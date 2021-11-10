import {DumpableTerminal} from "./terminal";
import Process from "./process";
import {IProgramArguments} from "./argumentParser";
import {Quit} from "./types";
import {EventEmitter} from "events";

export type TerminalSessionId = string;

export interface ISessionManager {
  getTerminal(sessionName: string): DumpableTerminal | null;

  formatSessionName(name: string): TerminalSessionId | null;
}

export class SingleSessionManager implements ISessionManager {
  private readonly virtualTerminal: DumpableTerminal;

  constructor(wrappedProcess: Process, args: IProgramArguments, cachingTerminal: DumpableTerminal) {
    this.virtualTerminal = cachingTerminal;
  }

  public getTerminal(): DumpableTerminal {
    return this.virtualTerminal;
  }

  public formatSessionName() {
    return "default";
  }
}

export class MultipleSessionManager extends EventEmitter implements ISessionManager {
  private readonly terminals = new Map<string, DumpableTerminal>();

  constructor() {
    super();
  }

  public formatSessionName(sessionName: string): TerminalSessionId | null {
    if (!sessionName.match(/^[A-Za-z][-_A-Za-z0-9]*$/))
      return null;

    return sessionName.toLowerCase();
  }

  public getTerminal(sessionName: string): DumpableTerminal | null {
    return this.terminals.get(sessionName) ?? null;
  }

  public newTerminal(name: string, decorated: boolean): DumpableTerminal {
    if (this.terminals.has(name)) {
      throw new Error("A session with this name already exists");
    }

    const term = new DumpableTerminal(name, decorated, null);
    this.terminals.set(name, term);

    this.emit("newSession", name);

    return term;
  }

  public closeTerminal(name: string) {
    this.terminals.get(name)?.handleQuitEvent(new Quit());
    this.terminals.delete(name);
  }
}
