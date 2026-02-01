import { IProgramArguments } from "./argumentParser.js";
import { IDisposable } from "./types.js";
import { Express } from "express";
import { WebSocketServer as WsServer, WebSocket } from "ws";
import * as http from "http";
import { Logger } from "winston";
export declare abstract class WebSocketServer<M> implements IDisposable {
    protected readonly args: IProgramArguments;
    static readonly PING_INTERVAL_MS = 2000;
    protected logger: Logger;
    protected server: http.Server;
    protected readonly wsServer: WsServer;
    protected readonly bindPort: number;
    protected readonly bindHost: string;
    private readonly pingInterval;
    protected constructor(bind: string, args: IProgramArguments, logName: string);
    private ping;
    private addWebsocketHandler;
    close(): Promise<void>;
    protected sendRaw(connection: WebSocket, msg: Uint8Array): Promise<void>;
    protected send(connection: WebSocket, message: M): Promise<void>;
    protected listening(): void;
    protected start(_app: Express): void;
    protected abstract handleConnection(connection: WebSocket): void;
    protected abstract marshalMessage(message: M): Uint8Array;
    protected abstract closeConnections(): Promise<void>;
}
export declare abstract class StaticFileWebSocketServer<M> extends WebSocketServer<M> {
    protected start(app: Express): void;
    private addStaticFilesHandler;
    protected httpBaseDir(dir: string): string;
    private addCustomCssHandlers;
    private addHandlerFile;
    protected abstract getStaticMainFile(): string;
}
