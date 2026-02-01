import BaseApplication from "./application.js";
import {AudienceClientMessageSchema, type ServerMessage} from "@termshare/protocol/web_pb.js";
import {create} from "@bufbuild/protobuf";

class Application extends BaseApplication {
    constructor() {
        super(false);
    }

    connected(): void {
        super.connected();

        const value = window.location.pathname.replace(/^.*\//, "") || "default";
        const message = create(AudienceClientMessageSchema, {
            content: {
                case: "startAudience",
                value
            }
        });

        this.client.sendAudienceClientMessage(message);
    }

    // noinspection JSUnusedGlobalSymbols
    protected handleMessage(message: ServerMessage): void {
        switch (message.content.case) {
            case "resize":
                this.terminal?.resize(message.content.value);
                break;
            case "selection":
                this.terminal?.select(message.content.value);
                break;
            default:
                this.warn("Error: Got unknown message from server: " + JSON.stringify(message.content));
        }
    }

    // noinspection JSUnusedGlobalSymbols
    protected customizeTerminal(): void {
        // no implementation required
    }
}

new Application().start();
