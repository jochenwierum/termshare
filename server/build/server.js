import express from "express";
import { WebSocketServer as WsServer, WebSocket } from "ws";
import expressStaticGzip from "express-static-gzip";
import * as path from "path";
import { newLogger } from "./logger.js";
const __dirname = import.meta.dirname;
const parseBind = (bind) => {
    const fail = () => new Error(`Illegal bind address '${bind}', must be something like ':8080' or '127.0.0.1:8080'`);
    const pos = bind.indexOf(":");
    if (pos === -1) {
        throw fail();
    }
    const portString = bind.substring(pos + 1);
    const port = parseInt(portString);
    if (isNaN(port)) {
        throw fail();
    }
    const ip = pos === 0 ? "0.0.0.0" : bind.substring(0, pos);
    return [ip, port];
};
export class WebSocketServer {
    args;
    static PING_INTERVAL_MS = 2000;
    logger;
    server;
    wsServer;
    bindPort;
    bindHost;
    pingInterval = null;
    constructor(bind, args, logName) {
        this.args = args;
        this.logger = newLogger({ component: logName });
        [this.bindHost, this.bindPort] = parseBind(bind);
        const app = express();
        this.server = app.listen(this.bindPort, this.bindHost, () => this.listening());
        this.wsServer = this.addWebsocketHandler(this.server);
        this.start(app);
        this.server.on("error", (e) => {
            this.logger.error("Error in webserver");
            this.logger.error(e);
            process.exit(1);
        });
        this.pingInterval = setInterval(() => this.ping(), StaticFileWebSocketServer.PING_INTERVAL_MS);
    }
    ping() {
        this.wsServer.clients.forEach(socket => {
            const s = socket;
            if (s.healthy === false)
                s.terminate();
            s.healthy = false;
            s.ping();
        });
    }
    addWebsocketHandler(server) {
        const wsServer = new WsServer({
            backlog: 8,
            clientTracking: true,
            noServer: true,
            path: "/ws",
            perMessageDeflate: false,
        });
        wsServer.on("connection", socket => {
            const s = socket;
            s.healthy = true;
            s.on("pong", () => {
                s.healthy = true;
            });
            this.handleConnection(socket);
        });
        server.on("upgrade", (request, socket, head) => {
            wsServer.handleUpgrade(request, socket, head, socket => {
                wsServer.emit("connection", socket, request);
            });
        });
        return wsServer;
    }
    async close() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }
        await this.closeConnections();
        this.wsServer.clients.forEach(c => {
            try {
                c.close();
            }
            catch {
                c.terminate();
            }
        });
        return new Promise(resolve => {
            this.server?.close(err => {
                if (err) {
                    this.logger.error(`Error stopping server`);
                    this.logger.error(err);
                }
                else {
                    this.logger.info(`HTTP server stopped`);
                }
                resolve();
            });
        });
    }
    async sendRaw(connection, msg) {
        if (connection.readyState !== WebSocket.OPEN) {
            this.logger.warn("Don't sending message - socket not open");
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => connection.send(msg, {
            binary: true,
        }, err => {
            if (err) {
                this.logger.warn("Unable to send websocket message to main presenter");
                this.logger.warn({ message: err });
                reject(err);
            }
            else {
                resolve();
            }
        }));
    }
    async send(connection, message) {
        if (this.logger.isDebugEnabled()) {
            const key = Object.keys(message)[0];
            this.logger.debug("Send message of type: %s: %s", key, JSON.stringify(message[key]));
        }
        return this.sendRaw(connection, this.marshalMessage(message));
    }
    listening() {
        this.logger.info(`HTTP server ${this.bindHost}:${this.bindPort} started`);
    }
    start(_app) {
    }
}
export class StaticFileWebSocketServer extends WebSocketServer {
    start(app) {
        this.addStaticFilesHandler(app);
        this.addCustomCssHandlers(app);
        this.addHandlerFile(app);
    }
    addStaticFilesHandler(app) {
        app.use("/_static", expressStaticGzip(this.httpBaseDir("_static"), {
            enableBrotli: true,
            serveStatic: {
                etag: true,
                cacheControl: true,
                maxAge: 25920000,
                index: false,
            }
        }));
    }
    httpBaseDir(dir) {
        let basename = path.basename(__dirname);
        const isDebugBuild = basename === "build" || basename === "src";
        const relDir = isDebugBuild ? `../../client/dist/${dir}` : `static/${dir}`;
        return path.normalize(path.join(__dirname, relDir));
    }
    addCustomCssHandlers(app) {
        if (this.args.customCssDir) {
            app.use("/_custom", express.static(this.args.customCssDir, {
                index: false,
                etag: true,
                fallthrough: false,
            }));
        }
        else {
            app.get("/_custom/custom.css", (_req, res) => {
                res.status(200);
                res.setHeader("Content-Type", "text/css");
                res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
                res.setHeader("Pragma", "no-cache");
                res.setHeader("Expires", "0");
                res.send("");
            });
        }
    }
    addHandlerFile(app) {
        const file = this.getStaticMainFile();
        app.get(/\/[^/]*/, (_req, res) => {
            res.sendFile(file, {
                maxAge: 0,
                headers: {
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0"
                }
            }, (err) => {
                if (err) {
                    this.logger.error(`Error while serving static file ${file}:`, err);
                    res.sendStatus(500);
                }
            });
        });
    }
}
