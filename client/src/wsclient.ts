import {EventEmitter} from "events";
import {
    type AudienceClientMessage, AudienceClientMessageSchema,
    type PresenterClientMessage,
    PresenterClientMessageSchema
} from "@termshare/protocol/web_pb.js";
import {toBinary} from "@bufbuild/protobuf";

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

    public sendPresenterClientMessage(message: PresenterClientMessage): void {
        this.send(toBinary(PresenterClientMessageSchema, message));
    }

    public sendAudienceClientMessage(message: AudienceClientMessage): void {
        this.send(toBinary(AudienceClientMessageSchema, message));
    }

    private send(array: Uint8Array): void {
        this.ws?.send(array.buffer as ArrayBuffer);
    }

    public close() {
        this.ws?.close();
    }
}
