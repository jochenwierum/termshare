import { IProgramArguments } from "./argumentParser.js";
import { StaticFileWebSocketServer } from "./server.js";
import { ISessionManager } from "./sessionManager.js";
import WebSocket from "ws";
import { ServerMessage } from "@termshare/protocol/web_pb.js";
export default class extends StaticFileWebSocketServer<ServerMessage> {
    private readonly sessionManager;
    private readonly mutex;
    private closed;
    private readonly sessions;
    constructor(sessionManager: ISessionManager, args: IProgramArguments);
    protected listening(): void;
    protected marshalMessage(message: ServerMessage): Uint8Array<ArrayBuffer>;
    protected getStaticMainFile(): string;
    handleConnection(ws: WebSocket): void;
    private startClient;
    private startTerminalEventHandler;
    private closeAllConnections;
    private broadcast;
    private closeSocket;
    private removeSession;
    protected closeConnections(): Promise<void>;
}
