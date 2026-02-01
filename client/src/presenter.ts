import BaseApplication from "./application.js";
import Terminal from "./terminal.js";
import type {IBufferRange} from "@xterm/xterm";
import {
    type Init,
    PresenterClientMessageSchema,
    SelectionSchema,
    type ServerMessage,
    type Selection,
} from "@termshare/protocol/web_pb.js";
import {create} from "@bufbuild/protobuf";

class Application extends BaseApplication {
    private readonly encoder = new TextEncoder();

    constructor() {
        super(true);
    }

    // noinspection JSUnusedGlobalSymbols
    protected handleMessage(message: ServerMessage) {
        switch (message.content.case) {
            case "blocked":
                this.reset();
                this.askPresent();
                break;
            case "audienceCount":
                this.updateAudienceCount(message.content.value);
                break;
            default:
                console.log("Error: Got unknown message from server ", message.content.case);
        }
    }

    // noinspection JSUnusedGlobalSymbols
    protected customizeTerminal(terminal: Terminal, init: Init): void {
        if (!init.size) {
            terminal.addListener("resize", (width: number, height: number) => {
                const message = create(PresenterClientMessageSchema, {
                    content: {
                        case: "presenterResize",
                        value: {width, height}
                    }
                });

                this.client.sendPresenterClientMessage(message);
            });
        }

        terminal.addListener("data", (data: string) => {
            const message = create(PresenterClientMessageSchema, {
                content: {
                    case: "presenterStdin",
                    value: this.encoder.encode(data)
                }
            });

            this.client.sendPresenterClientMessage(message);
        });

        terminal.addListener("selection", (position: IBufferRange) => {
            let value: Selection;
            if (position) {
                value = create(SelectionSchema, {
                    startColumn: position.start.x,
                    startRow: position.start.y,
                    endColumn: position.end.x,
                    endRow: position.end.y
                });
            } else {
                value = create(SelectionSchema, {
                    startColumn: -1,
                    startRow: -1,
                    endColumn: -1,
                    endRow: -1
                });
            }

            this.client.sendPresenterClientMessage(create(PresenterClientMessageSchema, {content: {case: "selection", value}}));
        });
    }

    private askPresent(): void {
        const request = () => {
            const message = create(PresenterClientMessageSchema, {
                content: {
                    case: "requestPresenter",
                    value: {}
                }
            });
            this.client.sendPresenterClientMessage(message);
        };
        this.overlay.show("A presenter is already connected", "Highjack session", request.bind(this));
    }

    private updateAudienceCount(audienceCount: number) {
        this.terminal?.setTitlePrefix("[" + audienceCount + " viewers] ");
    }
}

new Application().start();
