import {RemoteSessionManager} from "./sessionManager";
import {IProgramArguments} from "./argumentParser";
import {CachingTerminal, UpdatingTerminal} from "./terminal";
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
} from "./types";
import {WebSocketServer} from "./server";
import {WebSocket} from "ws";
import {repeater} from "./proto/repeater";
import {newLogger} from "./logger";
import {EventEmitter} from "events";
import IStreamData = repeater.IStreamData;

type RepeaterWebsocket = WebSocket & {
  terminal?: CachingTerminal;
}

export class RepeaterServer extends WebSocketServer<repeater.IStreamFeedback> {
  constructor(
    private readonly sessionManager: RemoteSessionManager,
    args: IProgramArguments) {
    super(args.repeaterBind, args, "repeater-server");
  }

  protected marshalMessage(message: repeater.IStreamFeedback): Uint8Array {
    return repeater.StreamFeedback.encode(message).finish();
  }

  public handleConnection(websocket: WebSocket): void {
    const connection = websocket as RepeaterWebsocket;

    connection.on("message", async (message: Buffer, isBinary: boolean) => {
      if (!isBinary) {
        this.logger.error("Got unexpected text message: %s", message);
        return;
      }

      const decoded = repeater.StreamData.decode(message);

      if (this.logger.isDebugEnabled()) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.logger.debug("Got message of type %s: %s", decoded.content, (decoded as any)[decoded.content ?? ""]);
      }

      if (connection.terminal === undefined) {
        await this.handleFirstMessage(connection, decoded);
      } else {
        await this.handleMessage(connection, decoded);
      }
    });

    connection.on("close", () => this.closeSession(connection));
  }

  private async handleFirstMessage(connection: RepeaterWebsocket, decoded: repeater.StreamData) {
    let terminal: CachingTerminal;

    try {
      terminal = this.createTerminal(decoded);
    } catch (e) {
      this.logger.warn(e);
      await this.send(connection, {
        error: (e instanceof Error) ? e.message : "" + e
      });
      connection.close();
      return;
    }

    connection.terminal = terminal;

    terminal.on(EVENT_AUDIENCE_COUNT, (c: number) =>
      this.send(connection, {audienceCount: c}));

    await this.send(connection, {
      acknowledge: {
        expectedPingInterval: RepeaterServer.PING_INTERVAL_MS
      }
    });
  }

  private createTerminal(decoded: repeater.StreamData): CachingTerminal {
    if (decoded.content !== "init") {
      throw new Error("First message was not an init message");
    }

    const sessionName = this.sessionManager.formatSessionName(decoded.init?.session ?? "");
    if (sessionName === null) {
      throw new Error("Session name contains invalid characters");
    }

    this.logger = this.logger.child({sessionName});
    const terminal = this.sessionManager.newTerminal(sessionName, decoded.init?.decoration ?? false);

    terminal.handleResizeEvent({
      width: decoded.init?.size?.width ?? 80,
      height: decoded.init?.size?.height ?? 24
    });

    return terminal;
  }

  private async handleMessage(connection: RepeaterWebsocket, decoded: repeater.StreamData) {
    switch (decoded.content) {
      case "init":
        this.logger.warn("Got duplicated init data - ignoring");
        break;
      case "resize":
        connection.terminal?.handleResizeEvent({
          width: decoded.resize?.width ?? 80,
          height: decoded.resize?.height ?? 24,
        });
        break;
      case "output":
        if (decoded.output) {
          await connection.terminal?.handleOutputEvent({
            output: decoded.output
          });
        }
        break;
      case "selection":
        connection.terminal?.handleSelection(
          decoded.selection?.startRow ?? -1,
          decoded.selection?.startColumn ?? -1,
          decoded.selection?.endRow ?? -1,
          decoded.selection?.endColumn ?? -1);
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
          await this.send(c, {quit: {}});
          c.close();
        } catch (_ignored) {
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
    return this.send({
      init: {
        decoration: this.args.decoration,
        session: this.args.presenterSession,
        size: {
          height: this.args.presenterHeight != 0 ? this.args.presenterHeight : 24,
          width: this.args.presenterWidth != 0 ? this.args.presenterWidth : 80,
        },
      }
    });
  }

  private send(message: IStreamData): Promise<void> {
    if (this.connection?.readyState !== WebSocket.OPEN) {
      this.logger.warn("Don't sending message - socket not open");
      return Promise.resolve();
    }

    const msg = repeater.StreamData.encode(message).finish();
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
    const feedback = repeater.StreamFeedback.decode(m);

    if (!this.connected) {
      switch (feedback.content) {
        case "acknowledge":
          this.expectedPingInterval = feedback.acknowledge?.expectedPingInterval ?? 0;
          this.connected = true;
          this.attachTerminal();
          resolve();
          break;
        case "error":
          reject(feedback.error);
          break;
        default:
          this.logger.warn("Got an unexpected answer while establishing connection");
      }
    } else {
      switch (feedback.content) {
        case "error":
          this.logger.error("Server error: %s", feedback.error);
          this.emit(EVENT_QUIT);
          break;
        case "quit":
          this.logger.warn("Server closed the connection gracefully");
          this.emit(EVENT_QUIT);
          break;
        case "audienceCount":
          this.term.setAudienceCount(feedback.audienceCount ?? 0);
          break;
        default:
          this.logger.warn("Got an unexpected answer");
      }
    }
  }

  private attachTerminal() {
    this.term.on(EVENT_QUIT, () => this.connection?.close());
    this.term.on(EVENT_OUTPUT, (o: Output) => this.send({output: o.output}));
    this.term.on(EVENT_RESIZE, (r: Resize) => this.send({resize: r}));
    this.term.on(EVENT_SELECTION, (s: Selection) => this.send({selection: s}));
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
