import {EventEmitter} from "events";
import {web} from "../../src/proto/web";
import {Writer} from "protobufjs";

export default class extends EventEmitter {
  private ws: WebSocket | null = null;
  private hadError = false;

  constructor() {
    super();
  }

  public connect(): void {
    this.emit("connecting");

    const internalConnect = () => {
      const url = this.buildUrl();

      console.log("Starting Websocket connection to " + url);
      this.ws = new WebSocket(url);
      this.ws.binaryType = "arraybuffer";

      this.ws.onmessage = (m: MessageEvent) => this.onMessage(m);
      this.ws.onopen = () => this.emit("connected");
      this.ws.onerror = () => {
        this.hadError = true;
        this.emit("error");
      };
      this.ws.onclose = () => {
        if (!this.hadError) {
          this.emit("disconnected");
        } else {
          this.hadError = false;
        }
      };
    };

    internalConnect();
  }

  private buildUrl() {
    const location = window.location;
    const proto = location.protocol === "https:" ? "wss://" : "ws://";
    const port = location.port !== "" ? ":" + location.port : "";
    const path = location.pathname.replace(/\/[^/]*$/, "") + "/ws";
    return proto + location.hostname + port + path;
  }

  private onMessage(m: MessageEvent): void {
    try {
      this.emit("message", m.data);
    } catch (e) {
      console.log("Error while parsing payload:", e);
    }
  }

  public send(message: web.IPresenterClientMessage | web.IAudienceClientMessage): void {
    let encoded: Writer;
    if (message instanceof web.PresenterClientMessage) {
      encoded = web.PresenterClientMessage.encode(message);
    } else if (message instanceof web.AudienceClientMessage) {
      encoded = web.AudienceClientMessage.encode(message);
    } else {
      return; // should never happen
    }

    const arrayBuffer = encoded.finish();
    this.ws?.send(arrayBuffer.buffer.slice(arrayBuffer.byteOffset, arrayBuffer.byteOffset + arrayBuffer.byteLength));
  }

  public close() {
    this.ws?.close();
  }
}
