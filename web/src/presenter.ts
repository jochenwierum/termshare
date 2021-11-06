import {web} from "../../src/proto/web";

import BaseApplication from "./application";
import {ISelectionPosition} from "xterm";
import Terminal from "./terminal";

class Application extends BaseApplication {
  private readonly encoder = new TextEncoder();

  constructor() {
    super(true);
  }

  // noinspection JSUnusedGlobalSymbols
  protected handleMessage(message: web.ServerMessage) {
    switch (message.content) {
      case "blocked":
        this.reset();
        this.askPresent();
        break;
      case "audienceCount":
        this.updateAudienceCount(message.audienceCount as number);
        break;
      default:
        console.log("Error: Got unknown message from server ", message.error);
    }
  }

  // noinspection JSUnusedGlobalSymbols
  protected customizeTerminal(terminal: Terminal, init: web.IInit): void {
    if (!init.size) {
      terminal.addListener("resize", (width: number, height: number) => {
        const message = web.PresenterClientMessage.create({
          presenterResize: web.Resize.create({
            width, height
          })
        });

        this.client.send(message);
      });
    }

    terminal.addListener("data", (data: string) => {
      const message = web.PresenterClientMessage.create({
        presenterStdin: this.encoder.encode(data)
      });

      this.client.send(message);
    });

    terminal.addListener("selection", (position: ISelectionPosition) => {
      let selection: web.ISelection;
      if (position) {
        selection = web.Selection.create({
          startColumn: position.startColumn,
          startRow: position.startRow,
          endColumn: position.endColumn,
          endRow: position.endRow
        });
      } else {
        selection = web.Selection.create({
          startColumn: -1,
          startRow: -1,
          endColumn: -1,
          endRow: -1
        });
      }

      this.client.send(web.PresenterClientMessage.create({selection}));
    });
  }

  private askPresent(): void {
    const request = () => {
      const message = web.PresenterClientMessage.create({
        requestPresenter: web.Empty.create({})
      });
      this.client.send(message);
    };
    this.overlay.show("A presenter is already connected", "Highjack session", request.bind(this));
  }

  private updateAudienceCount(audienceCount: number) {
    this.terminal?.setTitlePrefix("[" + audienceCount + " viewers] ");
  }
}

new Application().start();
