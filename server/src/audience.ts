import {IProgramArguments} from "./argumentParser.js";
import {StaticFileWebSocketServer, WebSocketServer} from "./server.js";
import {ISessionManager, TerminalSessionId} from "./sessionManager.js";
import {Mutex} from "async-mutex";
import WebSocket from "ws";
import {DumpableTerminal} from "./terminal.js";
import {EVENT_OUTPUT, EVENT_QUIT, EVENT_RESIZE, EVENT_SELECTION, Output, Resize, Selection} from "./types.js";
import {EventEmitter} from "events";
import {
    AudienceClientMessage,
    AudienceClientMessageSchema,
    ServerMessage,
    ServerMessageSchema
} from "@termshare/protocol/web_pb.js";
import {create, fromBinary, toBinary} from "@bufbuild/protobuf";

type AudienceWebSocket = WebSocket & {
    session?: TerminalSessionId;
};

interface Session {
    name: string;
    mutex: Mutex;
    connections: WebSocket[];
    cancelListener?: () => void;
}

export default class extends StaticFileWebSocketServer<ServerMessage> {
    private readonly mutex = new Mutex();
    private closed = false;

    private readonly sessions = new Map<string, Session>();

    constructor(
        private readonly sessionManager: ISessionManager,
        args: IProgramArguments) {
        super(args.audienceBind, args, "audience");

        if (sessionManager instanceof EventEmitter) {
            sessionManager.on("newSession", (name) =>
                this.logger.info(`Use http://${this.bindHost}:${this.bindPort}/${name} to watch name's console!`));
        }
    }

    protected listening() {
        super.listening();
        if (!(this.sessionManager instanceof EventEmitter)) {
            this.logger.info(`Use http://${this.bindHost}:${this.bindPort}/ to watch the console!`);
        }
    }

    protected marshalMessage(message: ServerMessage) {
        return toBinary(ServerMessageSchema, message);
    }

    protected getStaticMainFile(): string {
        return this.httpBaseDir("audience.html");
    }

    public handleConnection(ws: WebSocket): void {
        const connection = ws as AudienceWebSocket;
        if (this.closed) {
            connection.close();
            return;
        }

        let firstMessage = true;
        connection.on("message", async (message: Buffer, isBinary: boolean) => {
            if (!isBinary) {
                this.logger.error("Got unexpected text message: %s", message, {sessionName: connection.session});
                return;
            }

            let decoded: AudienceClientMessage;
            try {
                decoded = fromBinary(AudienceClientMessageSchema, message);
            } catch (e) {
                this.logger.error("Unable to deserialize audience client message:", {sessionName: connection.session});
                this.logger.error(e);
                return;
            }

            if (this.logger.isDebugEnabled()) {
                this.logger.debug("Got message of type %s: %s",

                    decoded.content.case, decoded.content.value, {sessionName: connection.session});
            }

            if (firstMessage) {
                firstMessage = false;
                if (decoded.content.case !== "startAudience") {
                    this.logger.warn("Unknown client init message ('%s'), dropping connection",
                        decoded.content, {sessionName: connection.session});
                    this.logger.warn(JSON.stringify(decoded));
                    connection.close();
                } else {
                    await this.startClient(connection, decoded.content.value);
                }
            } else {
                this.logger.warn("Unknown client message, client already initialized; ignoring message",
                    {sessionName: connection.session});
            }
        });

        connection.on("close", () => this.closeSocket(connection));
    }

    private async startClient(connection: AudienceWebSocket, requestedSessionName: string): Promise<void> {
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
            this.logger.info("Attaching socket to session %s, start event handler = %s",
                sessionName, session ? "no" : "yes");
            if (session === undefined) {
                session = {
                    connections: [connection],
                    mutex: new Mutex(),
                    name: sessionName
                };
                this.sessions.set(sessionName, session);
                this.startTerminalEventHandler(terminal, session);
            } else {
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
                    }))]))[0];

                await this.send(connection, create(ServerMessageSchema, {content: {case: "output", value: output}}));
                await this.send(connection, create(ServerMessageSchema, {
                    content: {
                        case: "selection",
                        value: terminal.getSelection()
                    }
                }));
            });
        });
    }

    private startTerminalEventHandler(terminal: DumpableTerminal, session: Session) {
        this.logger.info("Starting broadcaster", {sessionName: session.name});

        const onQuit = () => this.closeAllConnections(session);
        const onOutput = ({value}: Output) =>
            this.broadcast(create(ServerMessageSchema, {content: {case: "output", value}}), session);
        const onResize = (value: Resize) =>
            this.broadcast(create(ServerMessageSchema, {content: {case: "resize", value}}), session);
        const onSelection = (value: Selection) =>
            this.broadcast(create(ServerMessageSchema, {content: {case: "selection", value}}), session);

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

    private closeAllConnections(session: Session): Promise<void> {
        return this.mutex.runExclusive(() => {
            session.connections?.forEach(c => c.close());
            this.removeSession(session.name);
        });
    }

    private async broadcast(message: ServerMessage, session: Session): Promise<void> {
        session?.mutex.runExclusive(() => {
            if (this.closed) return null;
            if (this.logger.isDebugEnabled()) {
                const key = Object.keys(message)[0] as keyof ServerMessage;
                this.logger.debug("Broadcast message of type: %s: %s",
                    key, JSON.stringify(message[key]), {sessionName: session.name});
            }

            const bytes = this.marshalMessage(message);

            return (session?.connections ?? [])
                .map(connection =>
                    () => session.mutex.runExclusive(() =>
                        this.sendRaw(connection, bytes).catch()
                    ));
        }).then((fns) => {
            if (fns) {
                return Promise.all(fns.map(fn => fn()));
            }
        });
    }

    private closeSocket(connection: AudienceWebSocket): Promise<void> {
        return this.mutex.runExclusive(() => {
            if (this.closed) return;

            const sessionName = connection.session;
            if (!sessionName) return;

            const connections = this.sessions.get(sessionName)?.connections ?? [];
            connections.splice(connections.indexOf(connection), 1);

            const sessionCount = connections.length;
            this.sessionManager.getTerminal(sessionName)?.setAudienceCount(sessionCount);
            if (sessionCount === 0) {
                this.removeSession(sessionName);
            }
        });
    }

    private removeSession(sessionName: string): void {
        const cancelFunc = this.sessions.get(sessionName)?.cancelListener;
        if (!cancelFunc) return;

        cancelFunc();
        this.sessions.delete(sessionName);
        this.logger.info("Stopping broadcaster", {sessionName});
    }

    protected async closeConnections(): Promise<void> {
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
