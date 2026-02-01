import "./application.css";

import WsClient from "./wsclient.js";
import Terminal from "./terminal.js";
import Decoration from "./decoration.js";
import Overlay from "./overlay.js";
import {type Init, type ServerMessage, ServerMessageSchema} from "@termshare/protocol/web_pb.js";

import FontFaceObserver from "fontfaceobserver";
import {fromBinary} from "@bufbuild/protobuf";

export default abstract class {
  protected readonly client: WsClient;
  protected readonly overlay: Overlay;
  private readonly isPresenter: boolean;

  protected decoration: Decoration | null = null;
  protected terminal: Terminal | null = null;

  private outputBuffer: Array<Uint8Array> | null = [];
  private pingTimeout: number | null = null;

  protected constructor(isPresenter: boolean) {
    this.isPresenter = isPresenter;

    const mainDiv = document.getElementById("main") as HTMLDivElement;
    mainDiv.classList.add(isPresenter ? "presenter" : "audience");

    this.overlay = new Overlay(mainDiv);

    this.client = new WsClient();

    this.client.on("connecting", () => this.overlay.show("Connecting..."));
    this.client.on("disconnected", () => this.close("Disconnected"));
    this.client.on("error", () => this.close("Error"));

    this.client.on("connected", this.connected.bind(this));

    this.client.on("message", this.internalHandleMessage.bind(this));
  }

  public start(): void {
    this.client.connect();
  }

  private close(reason: string): void {
    if (this.pingTimeout) clearTimeout(this.pingTimeout);
    this.overlay.show("Connection closed: " + reason, "Reconnect", this.start.bind(this));
    this.reset();
  }

  protected connected(): void {
    this.overlay.hide();
    // may be overridden by a client
  }

  private internalHandleMessage(data: ArrayBuffer): void {
    const message = fromBinary(ServerMessageSchema, new Uint8Array(data));
    const content = message.content;
    switch (content.case) {
      case "output":
        this.output(content.value as Uint8Array);
        break;
      case "error":
        this.overlay.show("Error: " + content.value, "Reconnect", this.start.bind(this));
        break;
      case "init":
        this.overlay.hide();
        this.init(content.value as Init);
        break;
      default:
        this.handleMessage(message);
    }
  }

  private init(message: Init) {
    if (!message.fontName) {
      this.initTerminal(message);
      return;
    }

    this.overlay.show("Loading font...");

    new FontFaceObserver(message.fontName).load(null, 4000).then(
      () => {
        this.overlay.hide();
        console.log("Font loaded - initializing terminal");
      },
      () => {
        console.log("Unable to load font (timeout) - continuing without it...");
        message.fontName = "";
        return new Promise<void>(resolve =>
          this.overlay.show("Could not load font", "Continue", resolve));
      })
      .then(() => this.initTerminal(message));
  }

  private output(message: Uint8Array) {
    if (this.outputBuffer != null) {
      this.outputBuffer.push(message);
    } else {
      this.terminal?.data(message);
    }
  }

  protected initTerminal(init: Init): void {
    const maximise = this.isPresenter && !init.size;
    this.decoration = new Decoration(this.overlay.content, init.decoration, maximise);
    this.decoration.setTitle("loading...");
    this.terminal = new Terminal(this.decoration.consoleDiv, init.fontName, init.fontSize, this.isPresenter, maximise);

    if (init.size && init.size?.width !== 0) {
      this.terminal.resize(init.size);
    }

    this.terminal.addListener("title", (title: string) => {
      this.decoration?.setTitle(title);
    });

    this.customizeTerminal(this.terminal, init);

    this.terminal.open();

    setTimeout(() => {
      this.outputBuffer?.forEach(d => this.terminal?.data(d));
      this.outputBuffer = null;

      this.decoration?.setTitle("termshare");
    }, 500);

    if (init.expectedPingInterval) {
      const interval = init.expectedPingInterval + 1000;
      this.client.on("ping", () => {
        if (this.pingTimeout)
          clearTimeout(this.pingTimeout);

        this.pingTimeout = setTimeout(() => this.client.close(), interval);
      });
    }
  }

  protected abstract handleMessage(message: ServerMessage): void;

  protected abstract customizeTerminal(terminal: Terminal, init: Init): void;

  protected warn(text: string): void {
    this.overlay.show(text, "Dismiss", this.overlay.hide);
  }

  protected reset(): void {
    this.terminal?.close();
    this.terminal = null;

    this.decoration?.reset();
    this.decoration = null;

    this.outputBuffer = [];
  }
}
