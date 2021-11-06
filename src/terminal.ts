import {EventEmitter} from "events";
import {Terminal} from "xterm-headless";
import {
  EVENT_AUDIENCE_COUNT,
  EVENT_OUTPUT,
  EVENT_QUIT,
  EVENT_RESIZE,
  EVENT_SELECTION,
  Output,
  Quit,
  Resize,
  Selection
} from "./types";
import Process from "./process";
import {newLogger} from "./logger";
import {SerializeAddon} from "xterm-addon-serialize";
import {Mutex} from "async-mutex";
import {Logger} from "winston";


export abstract class UpdatingTerminal extends EventEmitter {
  protected constructor() {
    super();
  }

  public abstract setAudienceCount(count: number): void;
}

export class UncachedTerminal extends UpdatingTerminal {
  constructor(wrappedProcess: Process) {
    super();

    wrappedProcess.on(EVENT_QUIT, (q: Quit) => this.emit(EVENT_QUIT, q));
    wrappedProcess.on(EVENT_OUTPUT, (o: Output) => this.emit(EVENT_OUTPUT, o));
    wrappedProcess.on(EVENT_RESIZE, (r: Resize) => this.emit(EVENT_RESIZE, r));
  }

  public setAudienceCount(): void {
    // ignored - no way to show in console
  }
}

export class CachingTerminal extends UpdatingTerminal {
  private readonly logger: Logger;

  public readonly mutex = new Mutex();

  private readonly terminal: Terminal;
  private readonly serializeAddon: SerializeAddon;

  private selection: Selection;
  private width = 0;
  private height = 0;

  constructor(public readonly name: string,
              public readonly decorated: boolean,
              wrappedProcess: Process|null) {
    super();

    this.logger = newLogger({component: "terminal", sessionName: name});

    this.terminal = new Terminal();
    this.serializeAddon = new SerializeAddon();
    this.terminal.loadAddon(this.serializeAddon);

    this.selection = new Selection(-1, -1, -1, -1);

    if (wrappedProcess) {
      wrappedProcess.on(EVENT_QUIT, (q: Quit) => this.handleQuitEvent(q));
      wrappedProcess.on(EVENT_OUTPUT, (o: Output) => this.handleOutputEvent(o));
      wrappedProcess.on(EVENT_RESIZE, (r: Resize) => this.handleResizeEvent(r));
    }
  }

  public handleResizeEvent(r: Resize) {
    this.width = r.width;
    this.height = r.height;

    this.logger.info(`New terminal size: ${(r.width)}x${(r.height)}`);
    this.terminal.resize(r.width, r.height);
    this.emit(EVENT_RESIZE, r);
  }

  public async handleOutputEvent(o: Output) {
    await this.mutex.runExclusive(() => new Promise<void>(resolve =>
      this.terminal.write(o.output, () => resolve())
    ));

    this.emit(EVENT_OUTPUT, o);
  }

  public handleQuitEvent(q: Quit) {
    return this.emit(EVENT_QUIT, q);
  }

  public handleSelection(startRow: number, startColumn: number, endRow: number, endColumn: number) {
    this.logger.info(`New selection: ${startRow}x${startColumn} to ${endRow}x${endColumn}`);

    this.selection = new Selection(startRow, startColumn, endRow, endColumn);
    this.emit(EVENT_SELECTION, this.selection);
  }

  public setAudienceCount(count: number) {
    this.logger.info(`Current client count: ${count}`);
    this.emit(EVENT_AUDIENCE_COUNT, count);
  }

  public async dumpTerminal(acquireMutex = true): Promise<Uint8Array> {
    const start = new Date();
    let out;
    if (acquireMutex) {
      out = await this.mutex.runExclusive(() => this.serializeAddon.serialize());
    } else {
      out = this.serializeAddon.serialize();
    }
    const end = new Date();

    this.logger.info(`Generated ${out.length} bytes of terminal dump in ${end.getTime() - start.getTime()} ms`);

    return Buffer.from(out, "utf-8");
  }

  public getWidth() {
    return this.width;
  }

  public getHeight() {
    return this.height;
  }

  public getSelection(): Selection {
    return this.selection;
  }
}
