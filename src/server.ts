import {IProgramArguments} from "./argumentParser";
import {IDisposable} from "./types";
import express, {Express} from "express";
import {Server as WsServer, WebSocket} from "ws";
import {Socket} from "net";
import * as http from "http";
import expressStaticGzip from "express-static-gzip";
import * as path from "path";
import {newLogger} from "./logger";
import {Logger} from "winston";

const parseBind = (bind: string): [string, number] => {
  const fail = () => new Error(`Illegal bind address '${bind}', must be something like ':8080' or '127.0.0.1:8080'`);

  const pos = bind.indexOf(":");
  if (pos === -1) {
    throw fail();
  }

  const portString = bind.substr(pos + 1);
  const port = parseInt(portString);
  if (isNaN(port)) {
    throw fail();
  }

  const ip = pos === 0 ? "0.0.0.0" : bind.substr(0, pos);

  return [ip, port];
};

type WebsocketWithHealth = WebSocket & { healthy?: boolean };

export abstract class WebSocketServer<M> implements IDisposable {
  public static readonly PING_INTERVAL_MS = 2000;

  protected logger: Logger;
  protected server: http.Server;
  protected readonly wsServer: WsServer;
  protected readonly bindPort: number;
  protected readonly bindHost: string;
  private readonly pingInterval: NodeJS.Timer | null = null;

  protected constructor(
    private bind: string,
    protected readonly args: IProgramArguments,
    logName: string
  ) {
    this.logger = newLogger({component: logName});
    [this.bindHost, this.bindPort] = parseBind(bind);

    const app = express();
    this.server = app.listen(this.bindPort, this.bindHost, () => this.listening());

    this.wsServer = this.addWebsocketHandler(this.server);
    this.start(app);

    this.server.on("error", (e) => {
        this.logger.error("Error in webserver");
        this.logger.error(e);
        process.exit(1);
      }
    );

    this.pingInterval = setInterval(() => this.ping(), StaticFileWebSocketServer.PING_INTERVAL_MS);
  }

  private ping() {
    this.wsServer.clients.forEach(socket => {
      const s = socket as WebsocketWithHealth;
      if (s.healthy === false) s.terminate();

      s.healthy = false;
      s.ping();
    });
  }

  private addWebsocketHandler(server: http.Server) {
    const wsServer = new WsServer({
      backlog: 8,
      clientTracking: true,
      noServer: true,
      path: "/ws",
      perMessageDeflate: false,
    });

    wsServer.on("connection", socket => {
      const s = (socket as WebsocketWithHealth);
      s.healthy = true;

      s.on("pong", () => {
        s.healthy = true;
      });

      this.handleConnection(socket);
    });

    server.on("upgrade", (request, socket, head) => {
      wsServer.handleUpgrade(request, socket as unknown as Socket, head, socket => {
        wsServer.emit("connection", socket, request);
      });
    });

    return wsServer;
  }

  public async close(): Promise<void> {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    await this.closeConnections();

    this.wsServer.clients.forEach(c => {
      try {
        c.close();
      } catch (_ignored) {
        c.terminate();
      }
    });

    return new Promise(resolve => {
      this.server?.close(err => {
        if (err) {
          this.logger.error(`Error stopping server`);
          this.logger.error(err);
        } else {
          this.logger.info(`HTTP server stopped`);
        }

        resolve();
      });
    });
  }

  protected async sendRaw(connection: WebSocket, msg: Uint8Array): Promise<void> {
    if (connection.readyState !== WebSocket.OPEN) {
      this.logger.warn("Don't sending message - socket not open");
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => connection.send(msg, {
        binary: true,
      }, err => {
        if (err) {
          this.logger.warn("Unable to send websocket message to main presenter");
          this.logger.warn({message: err});
          reject(err);
        } else {
          resolve();
        }
      }
    ));
  }

  protected async send(connection: WebSocket, message: M): Promise<void> {
    if (this.logger.isDebugEnabled()) {
      const key = Object.keys(message)[0];
      this.logger.debug("Send message of type: %s: %s", key,
        JSON.stringify((message as unknown as { [_k: string]: string }) [key]));
    }

    return this.sendRaw(connection, this.marshalMessage(message));
  }

  protected listening() {
    this.logger.info(`HTTP server ${this.bindHost}:${this.bindPort} started`);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected start(_app: Express): void {
    // can be overwritten when needed
  }

  protected abstract handleConnection(connection: WebSocket): void;

  protected abstract marshalMessage(message: M): Uint8Array;

  protected abstract closeConnections(): Promise<void>;
}

export abstract class StaticFileWebSocketServer<M> extends WebSocketServer<M> {
  protected start(app: Express) {
    this.addStaticFilesHandler(app);
    this.addCustomCssHandlers(app);
    this.addHandlerFile(app);
  }

  private addStaticFilesHandler(app: Express) {
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

  protected httpBaseDir(dir: string) {
    const relDir = path.basename(__dirname) === "src" ? "../dist/static/" + dir : "static/" + dir;
    return path.normalize(path.join(__dirname, relDir));
  }

  private addCustomCssHandlers(app: Express) {
    if (this.args.customCssDir) {
      app.use("/_custom", express.static(this.args.customCssDir, {
        index: false,
        etag: true,
        fallthrough: false,
      }));
    } else {
      app.get("/_custom/custom.css", (req, res) => {
        res.status(200);
        res.setHeader("Content-Type", "text/css");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        res.send("");
      });
    }
  }

  private addHandlerFile(app: Express) {
    const file = this.getStaticMainFile();

    app.get("/*", (req, res) => {
      res.sendFile(file, {
          maxAge: 0,
          headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
          }
        },
        (err) => {
          if (err) {
            this.logger.error(`Error while serving static file ${file}:`, err);
            res.sendStatus(500);
          }
        }
      );
    });
  }

  protected abstract getStaticMainFile(): string;
}
