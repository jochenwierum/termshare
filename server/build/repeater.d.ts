import { MultipleSessionManager } from "./sessionManager.js";
import { IProgramArguments } from "./argumentParser.js";
import { UpdatingTerminal } from "./terminal.js";
import { IDisposable } from "./types.js";
import { WebSocketServer } from "./server.js";
import { WebSocket } from "ws";
import { EventEmitter } from "events";
import { StreamFeedback } from "@termshare/protocol/repeater_pb.js";
export declare class RepeaterServer extends WebSocketServer<StreamFeedback> {
    private readonly sessionManager;
    constructor(sessionManager: MultipleSessionManager, args: IProgramArguments);
    protected marshalMessage(message: StreamFeedback): Uint8Array;
    handleConnection(websocket: WebSocket): void;
    private handleFirstMessage;
    private createTerminal;
    private handleMessage;
    private closeSession;
    closeConnections(): Promise<void>;
}
export declare class RepeaterClient extends EventEmitter implements IDisposable {
    private readonly args;
    private readonly term;
    private readonly logger;
    private connection;
    private connected;
    private expectedPingInterval;
    private pingTimeout;
    constructor(args: IProgramArguments, term: UpdatingTerminal);
    start(): Promise<void>;
    private init;
    private send;
    close(): Promise<void>;
    private handleMessage;
    private attachTerminal;
    private ping;
}
