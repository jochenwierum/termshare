import {CachingTerminal} from "./terminal";
import Process from "./process";
import {IProgramArguments} from "./argumentParser";
import {Quit} from "./types";

export type TerminalSessionId = string;

export interface ISessionManager {
  getTerminal(sessionName: string): CachingTerminal | null;

  formatSessionName(name: string): TerminalSessionId | null;
}

export class LocalSessionManager implements ISessionManager {
  private readonly virtualTerminal: CachingTerminal;

  constructor(wrappedProcess: Process, args: IProgramArguments, cachingTerminal: CachingTerminal) {
    this.virtualTerminal = cachingTerminal;
  }

  public getTerminal(): CachingTerminal {
    return this.virtualTerminal;
  }

  public formatSessionName() {
    return "default";
  }

}

export class RemoteSessionManager implements ISessionManager {
  private readonly terminals = new Map<string, CachingTerminal>();

  public formatSessionName(sessionName: string): TerminalSessionId | null {
    if (!sessionName.match(/^[A-Za-z][-_A-Za-z0-9]*$/))
      return null;

    return sessionName.toLowerCase();
  }

  public getTerminal(sessionName: string): CachingTerminal | null {
    return this.terminals.get(sessionName) || null;
  }

  public newTerminal(name: string, decorated: boolean): CachingTerminal {
    if (this.terminals.has(name)) {
      throw new Error("A session with this name already exists");
    }

    const term = new CachingTerminal(name, decorated, null);
    this.terminals.set(name, term);
    return term;
  }

  public closeTerminal(name: string) {
    this.terminals.get(name)?.handleQuitEvent(new Quit());
    this.terminals.delete(name);
  }
}
