import { StaticFileWebSocketServer } from "./server.js";
import { IProgramArguments } from "./argumentParser.js";
import { ISessionManager } from "./sessionManager.js";
import Process from "./process.js";
import { WebSocket } from "ws";
import { ServerMessage } from "@termshare/protocol/web_pb.js";
export default class extends StaticFileWebSocketServer<ServerMessage> {
    private readonly wrappedProcess;
    private readonly mutex;
    private waitingConnections;
    private mainConnection;
    private closed;
    private readonly term;
    constructor(sessionManager: ISessionManager, wrappedProcess: Process, args: IProgramArguments);
    protected listening(): void;
    protected marshalMessage(message: ServerMessage): Uint8Array;
    protected getStaticMainFile(): string;
    private sendToMain;
    private logConnections;
    private sendPresenterSetup;
    private sendWaitingSetup;
    private handleMainMessage;
    closeConnections(): Promise<void>;
    handleConnection(connection: WebSocket): Promise<void>;
    private handleInput;
    private handleWaitingMessage;
    private removeWaitingConnection;
    private closeConnection;
}
