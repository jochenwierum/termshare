import {web} from "../../src/proto/web";

import BaseApplication from "./application";

class Application extends BaseApplication {
  constructor() {
    super(false);
  }

  connected(): void {
    super.connected();

    const name = window.location.pathname.replace(/^.*\//, "") || "default";
    const message = web.AudienceClientMessage.create({
      startAudience: name
    });

    this.client.send(message);
  }

  // noinspection JSUnusedGlobalSymbols
  protected handleMessage(message: web.ServerMessage): void {
    switch (message.content) {
      case "resize":
        this.terminal?.resize(message.resize as web.IResize);
        break;
      case "selection":
        this.terminal?.select(message.selection as web.ISelection);
        break;
      default:
        this.warn("Error: Got unknown message from server: " + JSON.stringify(message));
    }
  }

  // noinspection JSUnusedGlobalSymbols
  protected customizeTerminal(): void {
    // no implementation required
  }
}

new Application().start();
