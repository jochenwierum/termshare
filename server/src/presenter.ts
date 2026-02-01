import {StaticFileWebSocketServer, WebSocketServer} from "./server.js";
import {IProgramArguments} from "./argumentParser.js";
import {ISessionManager} from "./sessionManager.js";
import Process from "./process.js";
import {EVENT_AUDIENCE_COUNT, EVENT_OUTPUT, Output} from "./types.js";
import {DumpableTerminal} from "./terminal.js";
import {Mutex} from "async-mutex";
import {WebSocket} from "ws";
import {
    PresenterClientMessage,
    PresenterClientMessageSchema,
    Resize,
    ServerMessage,
    ServerMessageSchema
} from "@termshare/protocol/web_pb.js";
import {create, fromBinary, toBinary} from "@bufbuild/protobuf";


export default class extends StaticFileWebSocketServer<ServerMessage> {
    private readonly mutex = new Mutex();

    private waitingConnections: WebSocket[] = [];
    private mainConnection: WebSocket | null = null;
    private closed = false;
    private readonly term: DumpableTerminal;

    constructor(
        sessionManager: ISessionManager,
        private readonly wrappedProcess: Process,
        args: IProgramArguments) {
        super(args.presenterBind, args, "presenter");

        this.term = sessionManager.getTerminal("presenter") as DumpableTerminal;

        this.term.on(EVENT_OUTPUT, ({value}: Output) =>
            this.mutex.runExclusive(() =>
                this.sendToMain(create(ServerMessageSchema, {content: {case: "output", value}}))));

        this.term.on(EVENT_AUDIENCE_COUNT, (count: number) =>
            this.mutex.runExclusive(() =>
                this.sendToMain(create(ServerMessageSchema, {content: {case: "audienceCount", value: count}}))));
    }

    protected listening() {
        super.listening();
        this.logger.info(`Open http://${this.bindHost}:${this.bindPort}/ to access the writable console!`);
    }

    protected marshalMessage(message: ServerMessage): Uint8Array {
        return toBinary(ServerMessageSchema, message);
    }

    protected getStaticMainFile(): string {
        return this.httpBaseDir("presenter.html");
    }

    private async sendToMain(message: ServerMessage): Promise<void> {
        if (this.mainConnection) {
            return this.send(this.mainConnection, message);
        }
    }

    private logConnections() {
        const t = this.mainConnection == null ? "no" : "a";
        this.logger.info(`Connection stats: ${t} main and ${this.waitingConnections.length} waiting connections`);
    }

    private async sendPresenterSetup(): Promise<void> {
        const size = this.args.presenterHeight > 0 ? ({
            height: this.args.presenterHeight,
            width: this.args.presenterWidth
        } as Resize) : undefined;

        await this.sendToMain(create(ServerMessageSchema, {
            content: {
                case: "init",
                value: {
                    decoration: this.args.decoration,
                    fontName: this.args.fontFamily || undefined,
                    fontSize: this.args.fontSize,
                    expectedPingInterval: WebSocketServer.PING_INTERVAL_MS,
                    size
                }
            }
        }));

        const output = await this.term.dumpTerminal();
        await this.sendToMain(create(ServerMessageSchema, {content: {case: "output", value: output}}));
    }

    private sendWaitingSetup(connection: WebSocket): Promise<void> {
        return this.send(connection, create(ServerMessageSchema, {content: {case: "blocked", value: {}}}));
    }

    private async handleMainMessage({content}: PresenterClientMessage) {
        switch (content.case) {
            case "presenterResize":
                this.wrappedProcess.resize(content.value.width ?? 80, content.value.height ?? 24);
                break;
            case "presenterStdin":
                this.wrappedProcess.stdin(content.value as Uint8Array);
                break;
            case "selection":
                this.term.handleSelection(
                    content.value.startRow ?? -1,
                    content.value.startColumn ?? -1,
                    content.value.endRow ?? -1,
                    content.value.endColumn ?? -1);
                break;
            default:
        }
    }

    public async closeConnections(): Promise<void> {
        await this.mutex.runExclusive(async () => {
            this.closed = true;

            if (this.mainConnection) {
                this.mainConnection.close();
            }
        });

        await Promise.all(this.waitingConnections.map(c => c.close()));
        this.waitingConnections = [];
    }


    public async handleConnection(connection: WebSocket): Promise<void> {
        return this.mutex.runExclusive(async () => {
            if (this.closed) {
                connection.close();
                return;
            }

            const isMainConnection = this.mainConnection == null;
            if (isMainConnection) {
                this.logger.info("New presenter - using as main connection");
                this.mainConnection = connection;
            } else {
                this.logger.info("New presenter - queuing as standby connection");
                this.waitingConnections.push(connection);
            }

            this.logConnections();

            if (isMainConnection) {
                await this.sendPresenterSetup();
            } else {
                await this.sendWaitingSetup(connection);
            }

        }).then(() => this.handleInput(connection));
    }

    private handleInput(connection: WebSocket) {
        connection.on("message", async (message: Buffer, isBinary: boolean) => {
            if (!isBinary) {
                this.logger.error("Got unexpected text message: %s", message);
                return;
            }

            let decoded: PresenterClientMessage;
            try {
                decoded = fromBinary(PresenterClientMessageSchema, message);
            } catch (e) {
                this.logger.error("Unable to deserialize presenter client message:");
                this.logger.error(e);
                return;
            }

            if (this.logger.isDebugEnabled()) {

                this.logger.debug("Got message of type %s: %s", decoded.content.case, decoded.content.value);
            }


            if (this.mainConnection === connection) {
                await this.handleMainMessage(decoded);
            } else {
                await this.handleWaitingMessage(connection, decoded);
            }
        });

        connection.on("close", () => this.closeConnection(connection));
    }

    private async handleWaitingMessage(connection: WebSocket, message: PresenterClientMessage): Promise<void> {
        if (message.content.case !== "requestPresenter") return;

        return this.mutex.runExclusive(async () => {
            this.term.handleSelection(-1, -1, -1, -1);

            if (this.mainConnection) {
                await this.sendWaitingSetup(this.mainConnection);
                this.waitingConnections.push(this.mainConnection);
            }

            this.removeWaitingConnection(connection);
            this.mainConnection = connection;
            await this.sendPresenterSetup();
        });
    }

    private removeWaitingConnection(connection: WebSocket) {
        this.waitingConnections.splice(
            this.waitingConnections.indexOf(connection), 1);
    }

    private async closeConnection(connection: WebSocket): Promise<void> {
        return this.mutex.runExclusive(async () => {
            if (this.closed) return;

            if (this.mainConnection == connection) {
                if (this.waitingConnections.length == 0) {
                    this.mainConnection = null;
                } else {
                    this.mainConnection = this.waitingConnections.splice(0, 1)[0];
                    await this.sendPresenterSetup();
                }
            } else {
                this.removeWaitingConnection(connection);
            }

            this.logConnections();
        });
    }
}
