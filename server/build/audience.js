import { StaticFileWebSocketServer, WebSocketServer } from "./server.js";
import { Mutex } from "async-mutex";
import { EVENT_OUTPUT, EVENT_QUIT, EVENT_RESIZE, EVENT_SELECTION } from "./types.js";
import { EventEmitter } from "events";
import { AudienceClientMessageSchema, ServerMessageSchema } from "@termshare/protocol/web_pb.js";
import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
export default class extends StaticFileWebSocketServer {
    sessionManager;
    mutex = new Mutex();
    closed = false;
    sessions = new Map();
    constructor(sessionManager, args) {
        super(args.audienceBind, args, "audience");
        this.sessionManager = sessionManager;
        if (sessionManager instanceof EventEmitter) {
            sessionManager.on("newSession", (name) => this.logger.info(`Use http://${this.bindHost}:${this.bindPort}/${name} to watch name's console!`));
        }
    }
    listening() {
        super.listening();
        if (!(this.sessionManager instanceof EventEmitter)) {
            this.logger.info(`Use http://${this.bindHost}:${this.bindPort}/ to watch the console!`);
        }
    }
    marshalMessage(message) {
        return toBinary(ServerMessageSchema, message);
    }
    getStaticMainFile() {
        return this.httpBaseDir("audience.html");
    }
    handleConnection(ws) {
        const connection = ws;
        if (this.closed) {
            connection.close();
            return;
        }
        let firstMessage = true;
        connection.on("message", async (message, isBinary) => {
            if (!isBinary) {
                this.logger.error("Got unexpected text message: %s", message, { sessionName: connection.session });
                return;
            }
            let decoded;
            try {
                decoded = fromBinary(AudienceClientMessageSchema, message);
            }
            catch (e) {
                this.logger.error("Unable to deserialize audience client message:", { sessionName: connection.session });
                this.logger.error(e);
                return;
            }
            if (this.logger.isDebugEnabled()) {
                this.logger.debug("Got message of type %s: %s", decoded.content.case, decoded.content.value, { sessionName: connection.session });
            }
            if (firstMessage) {
                firstMessage = false;
                if (decoded.content.case !== "startAudience") {
                    this.logger.warn("Unknown client init message ('%s'), dropping connection", decoded.content, { sessionName: connection.session });
                    this.logger.warn(JSON.stringify(decoded));
                    connection.close();
                }
                else {
                    await this.startClient(connection, decoded.content.value);
                }
            }
            else {
                this.logger.warn("Unknown client message, client already initialized; ignoring message", { sessionName: connection.session });
            }
        });
        connection.on("close", () => this.closeSocket(connection));
    }
    async startClient(connection, requestedSessionName) {
        return this.mutex.runExclusive(async () => {
            const sessionName = this.sessionManager.formatSessionName(requestedSessionName);
            if (sessionName === null) {
                return this.send(connection, create(ServerMessageSchema, {
                    content: {
                        case: "error",
                        value: "Invalid session name"
                    }
                }));
            }
            const terminal = this.sessionManager.getTerminal(sessionName);
            if (terminal === null) {
                return this.send(connection, create(ServerMessageSchema, {
                    content: {
                        case: "error",
                        value: "The specified session does not exist"
                    }
                }));
            }
            let session = this.sessions.get(sessionName);
            this.logger.info("Attaching socket to session %s, start event handler = %s", sessionName, session ? "no" : "yes");
            if (session === undefined) {
                session = {
                    connections: [connection],
                    mutex: new Mutex(),
                    name: sessionName
                };
                this.sessions.set(sessionName, session);
                this.startTerminalEventHandler(terminal, session);
            }
            else {
                session.connections.push(connection);
            }
            connection.session = sessionName;
            terminal.setAudienceCount(session.connections.length);
            return terminal.mutex.runExclusive(async () => {
                const output = (await Promise.all([
                    terminal.dumpTerminal(false),
                    this.send(connection, create(ServerMessageSchema, {
                        content: {
                            case: "init",
                            value: {
                                size: {
                                    height: terminal.getHeight(),
                                    width: terminal.getWidth(),
                                },
                                decoration: terminal.decorated,
                                fontName: this.args.fontFamily || undefined,
                                fontSize: this.args.fontSize,
                                expectedPingInterval: WebSocketServer.PING_INTERVAL_MS,
                            }
                        }
                    }))
                ]))[0];
                await this.send(connection, create(ServerMessageSchema, { content: { case: "output", value: output } }));
                await this.send(connection, create(ServerMessageSchema, {
                    content: {
                        case: "selection",
                        value: terminal.getSelection()
                    }
                }));
            });
        });
    }
    startTerminalEventHandler(terminal, session) {
        this.logger.info("Starting broadcaster", { sessionName: session.name });
        const onQuit = () => this.closeAllConnections(session);
        const onOutput = ({ value }) => this.broadcast(create(ServerMessageSchema, { content: { case: "output", value } }), session);
        const onResize = (value) => this.broadcast(create(ServerMessageSchema, { content: { case: "resize", value } }), session);
        const onSelection = (value) => this.broadcast(create(ServerMessageSchema, { content: { case: "selection", value } }), session);
        terminal.on(EVENT_QUIT, onQuit);
        terminal.on(EVENT_OUTPUT, onOutput);
        terminal.on(EVENT_RESIZE, onResize);
        terminal.on(EVENT_SELECTION, onSelection);
        session.cancelListener = () => {
            terminal.off(EVENT_QUIT, onQuit);
            terminal.off(EVENT_OUTPUT, onOutput);
            terminal.off(EVENT_RESIZE, onResize);
            terminal.off(EVENT_SELECTION, onSelection);
        };
    }
    closeAllConnections(session) {
        return this.mutex.runExclusive(() => {
            session.connections?.forEach(c => c.close());
            this.removeSession(session.name);
        });
    }
    async broadcast(message, session) {
        session?.mutex.runExclusive(() => {
            if (this.closed)
                return null;
            if (this.logger.isDebugEnabled()) {
                const key = Object.keys(message)[0];
                this.logger.debug("Broadcast message of type: %s: %s", key, JSON.stringify(message[key]), { sessionName: session.name });
            }
            const bytes = this.marshalMessage(message);
            return (session?.connections ?? [])
                .map(connection => () => session.mutex.runExclusive(() => this.sendRaw(connection, bytes).catch()));
        }).then((fns) => {
            if (fns) {
                return Promise.all(fns.map(fn => fn()));
            }
        });
    }
    closeSocket(connection) {
        return this.mutex.runExclusive(() => {
            if (this.closed)
                return;
            const sessionName = connection.session;
            if (!sessionName)
                return;
            const connections = this.sessions.get(sessionName)?.connections ?? [];
            connections.splice(connections.indexOf(connection), 1);
            const sessionCount = connections.length;
            this.sessionManager.getTerminal(sessionName)?.setAudienceCount(sessionCount);
            if (sessionCount === 0) {
                this.removeSession(sessionName);
            }
        });
    }
    removeSession(sessionName) {
        const cancelFunc = this.sessions.get(sessionName)?.cancelListener;
        if (!cancelFunc)
            return;
        cancelFunc();
        this.sessions.delete(sessionName);
        this.logger.info("Stopping broadcaster", { sessionName });
    }
    async closeConnections() {
        return this.mutex.runExclusive(() => {
            this.closed = true;
            this.sessions.forEach(s => {
                s.connections?.forEach(c => c.close());
                s.cancelListener?.call(this);
            });
            this.sessions.clear();
        });
    }
}
