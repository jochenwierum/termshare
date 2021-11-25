import {StaticFileWebSocketServer, WebSocketServer} from "./server";
import {IProgramArguments} from "./argumentParser";
import {ISessionManager} from "./sessionManager";
import Process from "./process";
import {EVENT_AUDIENCE_COUNT, EVENT_OUTPUT, Output} from "./types";
import {DumpableTerminal} from "./terminal";
import {web} from "./proto/web";
import {WebSocket} from "ws";
import {Mutex} from "async-mutex";


export default class extends StaticFileWebSocketServer<web.IServerMessage> {
  private readonly mutex = new Mutex();

  private waitingConnections: WebSocket[] = [];
  private mainConnection: WebSocket | null = null;
  private closed = false;
  private readonly term: DumpableTerminal;

  constructor(
    private readonly sessionManager: ISessionManager,
    private readonly wrappedProcess: Process,
    args: IProgramArguments) {
    super(args.presenterBind, args, "presenter");

    this.term = sessionManager.getTerminal("presenter") as DumpableTerminal;

    this.term.on(EVENT_OUTPUT, (output: Output) =>
      this.mutex.runExclusive(() =>
        this.sendToMain({output: output.output})));

    this.term.on(EVENT_AUDIENCE_COUNT, (count: number) =>
      this.mutex.runExclusive(() =>
        this.sendToMain({audienceCount: count})));
  }

  protected listening() {
    super.listening();
    this.logger.info(`Open http://${this.bindHost}:${this.bindPort}/ to access the writable console!`);
  }

  protected marshalMessage(message: web.IServerMessage): Uint8Array {
    return web.ServerMessage.encode(message).finish();
  }

  protected getStaticMainFile(): string {
    return this.httpBaseDir("html/presenter.html");
  }

  private async sendToMain(message: web.IServerMessage): Promise<void> {
    if (this.mainConnection) {
      return this.send(this.mainConnection, message);
    }
  }

  private logConnections() {
    const t = this.mainConnection == null ? "no" : "a";
    this.logger.info(`Connection stats: ${t} main and ${this.waitingConnections.length} waiting connections`);
  }

  private async sendPresenterSetup(): Promise<void> {
    const size = this.args.presenterHeight > 0 ? {
      height: this.args.presenterHeight,
      width: this.args.presenterWidth
    } : null;

    await this.sendToMain({
      init: {
        decoration: this.args.decoration,
        fontName: this.args.fontFamily,
        fontSize: this.args.fontSize,
        expectedPingInterval: WebSocketServer.PING_INTERVAL_MS,
        size
      }
    });

    const output = await this.term.dumpTerminal();
    await this.sendToMain({output});
  }

  private sendWaitingSetup(connection: WebSocket): Promise<void> {
    return this.send(connection, {blocked: {}});
  }

  private async handleMainMessage(decoded: web.PresenterClientMessage) {
    switch (decoded.content) {
      case "presenterResize":
        this.wrappedProcess.resize(decoded.presenterResize?.width ?? 80, decoded.presenterResize?.height ?? 24);
        break;
      case "presenterStdin":
        this.wrappedProcess.stdin(decoded.presenterStdin as Uint8Array);
        break;
      case "selection":
        this.term.handleSelection(
          decoded.selection?.startRow ?? -1,
          decoded.selection?.startColumn ?? -1,
          decoded.selection?.endRow ?? -1,
          decoded.selection?.endColumn ?? -1);
        break;
      default:
    }
  }

  public async closeConnections(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      this.closed = true;

      if (this.mainConnection) {
        await this.mainConnection.close();
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

      let decoded: web.PresenterClientMessage;
      try {
        decoded = web.PresenterClientMessage.decode(message);
      } catch (e) {
        this.logger.error("Unable to deserialize presenter client message:");
        this.logger.error(e);
        return;
      }

      if (this.logger.isDebugEnabled()) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.logger.debug("Got message of type %s: %s", decoded.content, (decoded as any)[decoded.content ?? ""]);
      }


      if (this.mainConnection === connection) {
        await this.handleMainMessage(decoded);
      } else {
        await this.handleWaitingMessage(connection, decoded);
      }
    });

    connection.on("close", () => this.closeConnection(connection));
  }

  private async handleWaitingMessage(connection: WebSocket, message: web.PresenterClientMessage): Promise<void> {
    if (message.content !== "requestPresenter") return;

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
