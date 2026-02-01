import {MultipleSessionManager} from "./sessionManager.js";
import {IProgramArguments} from "./argumentParser.js";
import {DumpableTerminal, UpdatingTerminal} from "./terminal.js";
import {
    EVENT_AUDIENCE_COUNT,
    EVENT_OUTPUT,
    EVENT_QUIT,
    EVENT_RESIZE,
    EVENT_SELECTION,
    IDisposable,
    Output,
    Quit,
    Resize,
    Selection
} from "./types.js";
import {WebSocketServer} from "./server.js";
import {WebSocket} from "ws";
import {newLogger} from "./logger.js";
import {EventEmitter} from "events";
import {StreamData, StreamDataSchema, StreamFeedback, StreamFeedbackSchema} from "@termshare/protocol/repeater_pb.js";
import {create, fromBinary, toBinary} from "@bufbuild/protobuf";

type RepeaterWebsocket = WebSocket & {
    terminal?: DumpableTerminal;
}

export class RepeaterServer extends WebSocketServer<StreamFeedback> {
    constructor(
        private readonly sessionManager: MultipleSessionManager,
        args: IProgramArguments) {
        super(args.repeaterBind, args, "repeater-server");
    }

    protected marshalMessage(message: StreamFeedback): Uint8Array {
        return toBinary(StreamFeedbackSchema, message);
    }

    public handleConnection(websocket: WebSocket): void {
        const connection = websocket as RepeaterWebsocket;

        connection.on("message", async (message: Buffer, isBinary: boolean) => {
            if (!isBinary) {
                this.logger.error("Got unexpected text message: %s", message);
                return;
            }

            const decoded = fromBinary(StreamDataSchema, message);

            if (this.logger.isDebugEnabled()) {
                 
                this.logger.debug("Got message of type %s: %s", decoded.content, decoded.content.value);
            }

            if (connection.terminal === undefined) {
                await this.handleFirstMessage(connection, decoded);
            } else {
                await this.handleMessage(connection, decoded);
            }
        });

        connection.on("close", () => this.closeSession(connection));
    }

    private async handleFirstMessage(connection: RepeaterWebsocket, decoded: StreamData) {
        let terminal: DumpableTerminal;

        try {
            terminal = this.createTerminal(decoded);
        } catch (e) {
            this.logger.warn(e);

            await this.send(connection, create(StreamFeedbackSchema, {
                content: {case: "error", value: (e instanceof Error) ? e.message : "" + e},
            }));
            connection.close();
            return;
        }

        connection.terminal = terminal;

        terminal.on(EVENT_AUDIENCE_COUNT, (value: number) =>
            this.send(connection, create(StreamFeedbackSchema, {content: {case: "audienceCount", value}})));

        await this.send(connection, create(StreamFeedbackSchema, {
            content: {
                case: "acknowledge",
                value: {
                    expectedPingInterval: RepeaterServer.PING_INTERVAL_MS
                }
            }
        }));
    }

    private createTerminal(decoded: StreamData): DumpableTerminal {
        if (decoded.content.case !== "init") {
            throw new Error("First message was not an init message");
        }

        const sessionName = this.sessionManager.formatSessionName(decoded.content.value.session ?? "");
        if (sessionName === null) {
            throw new Error("Session name contains invalid characters");
        }

        this.logger = this.logger.child({sessionName});
        const terminal = this.sessionManager.newTerminal(sessionName, decoded.content.value.decoration ?? false);

        terminal.handleResizeEvent({
            width: decoded.content.value.size?.width ?? 80,
            height: decoded.content.value.size?.height ?? 24
        });

        return terminal;
    }

    private async handleMessage(connection: RepeaterWebsocket, decoded: StreamData) {
        switch (decoded.content.case) {
            case "init":
                this.logger.warn("Got duplicated init data - ignoring");
                break;
            case "resize":
                connection.terminal?.handleResizeEvent({
                    width: decoded.content.value?.width ?? 80,
                    height: decoded.content.value?.height ?? 24,
                });
                break;
            case "output":
                if (decoded.content.value) {
                    await connection.terminal?.handleOutputEvent({
                        value: decoded.content.value
                    });
                }
                break;
            case "selection":
                connection.terminal?.handleSelection(
                    decoded.content.value.startRow ?? -1,
                    decoded.content.value.startColumn ?? -1,
                    decoded.content.value.endRow ?? -1,
                    decoded.content.value.endColumn ?? -1);
                break;
            default:
                this.logger.warn("Got unknown message of type '%s', ignoring: '%s'",
                    decoded.content, JSON.stringify(decoded));
        }
    }

    private closeSession(connection: RepeaterWebsocket) {
        if (!connection.terminal?.name) return;

        this.logger.info("Closing session %s", connection.terminal.name);
        this.sessionManager.closeTerminal(connection.terminal.name);
    }

    public async closeConnections(): Promise<void> {
        return Promise.all(Array.from(this.wsServer.clients)
            .map(async c => {
                try {
                    await this.send(c, create(StreamFeedbackSchema, {content: {case: "quit", value: {}}}));
                    c.close();
                } catch {
                    c.terminate();
                }
            }))
            .then();
    }
}

export class RepeaterClient extends EventEmitter implements IDisposable {
    private readonly logger = newLogger({component: "repeater-client"});
    private connection: WebSocket | null = null;
    private connected = false;

    private expectedPingInterval = 0;
    private pingTimeout: NodeJS.Timeout | null = null;

    constructor(
        private readonly args: IProgramArguments,
        private readonly term: UpdatingTerminal) {
        super();
    }

    public start(): Promise<void> {
        return new Promise((resolve, reject) => {
            const url = "ws://" + this.args.repeaterServer + "/ws";

            this.logger.info("Opening repeater connection to server at %s", url);
            this.connection = new WebSocket(url, {
                perMessageDeflate: false,
            });

            this.connection.on("ping", () => this.ping());
            this.connection.on("message", (m: Buffer) => this.handleMessage(m, resolve, reject));
            this.connection.on("open", () => this.init());
            this.connection.on("error", (e) => {
                this.logger.warn("connection closed");
                this.emit(EVENT_QUIT);
                reject(e);
            });
        });
    }

    private init(): Promise<void> {
        return this.send(create(StreamDataSchema, {
            content: {
                case: "init",
                value: {
                    decoration: this.args.decoration,
                    session: this.args.presenterSession,
                    size: {
                        height: this.args.presenterHeight != 0 ? this.args.presenterHeight : 24,
                        width: this.args.presenterWidth != 0 ? this.args.presenterWidth : 80,
                    },
                }
            }
        }));
    }

    private send(message: StreamData): Promise<void> {
        if (this.connection?.readyState !== WebSocket.OPEN) {
            this.logger.warn("Don't sending message - socket not open");
            return Promise.resolve();
        }

        const msg = toBinary(StreamDataSchema, message);
        return new Promise((resolve, reject) =>
            this.connection?.send(msg, e => e ? reject(e) : resolve()));
    }

    public async close(): Promise<void> {
        this.connection?.close();

        if (this.pingTimeout) {
            clearTimeout(this.pingTimeout);
        }
    }

    private handleMessage(m: Buffer, resolve: () => void, reject: (m: string | null | undefined) => void) {
        const feedback = fromBinary(StreamFeedbackSchema, m).content;

        if (!this.connected) {
            switch (feedback.case) {
                case "acknowledge":
                    this.expectedPingInterval = feedback.value.expectedPingInterval ?? 0;
                    this.connected = true;
                    this.attachTerminal();
                    resolve();
                    break;
                case "error":
                    reject(feedback.value);
                    break;
                default:
                    this.logger.warn("Got an unexpected answer while establishing connection");
            }
        } else {
            switch (feedback.case) {
                case "error":
                    this.logger.error("Server error: %s", feedback.value);
                    this.emit(EVENT_QUIT);
                    break;
                case "quit":
                    this.logger.warn("Server closed the connection gracefully");
                    this.emit(EVENT_QUIT);
                    break;
                case "audienceCount":
                    this.term.setAudienceCount(feedback.value ?? 0);
                    break;
                default:
                    this.logger.warn("Got an unexpected answer");
            }
        }
    }

    private attachTerminal() {
        this.term.on(EVENT_QUIT, () => this.connection?.close());
        this.term.on(EVENT_OUTPUT, ({value}: Output) => this.send(create(StreamDataSchema, {
            content: {
                case: "output",
                value
            }
        })));
        this.term.on(EVENT_RESIZE, (value: Resize) => this.send(create(StreamDataSchema, {
            content: {
                case: "resize",
                value
            }
        })));
        this.term.on(EVENT_SELECTION, (value: Selection) => this.send(create(StreamDataSchema, {
            content: {
                case: "selection",
                value
            }
        })));
    }

    private ping() {
        if (this.expectedPingInterval === 0) return;

        if (this.pingTimeout) clearTimeout(this.pingTimeout);
        this.pingTimeout = setTimeout(() => {
            this.logger.error("Ping timeout - terminating connection");
            this.emit("quit", new Quit());
            this.connection?.terminate();
        }, this.expectedPingInterval + 1000);
    }
}
