import { DumpableTerminal } from "./terminal.js";
import Process from "./process.js";
import { IProgramArguments } from "./argumentParser.js";
import { EventEmitter } from "events";
export type TerminalSessionId = string;
export interface ISessionManager {
    getTerminal(sessionName: string): DumpableTerminal | null;
    formatSessionName(name: string): TerminalSessionId | null;
}
export declare class SingleSessionManager implements ISessionManager {
    private readonly virtualTerminal;
    constructor(wrappedProcess: Process, args: IProgramArguments, cachingTerminal: DumpableTerminal);
    getTerminal(): DumpableTerminal;
    formatSessionName(): string;
}
export declare class MultipleSessionManager extends EventEmitter implements ISessionManager {
    private readonly terminals;
    constructor();
    formatSessionName(sessionName: string): TerminalSessionId | null;
    getTerminal(sessionName: string): DumpableTerminal | null;
    newTerminal(name: string, decorated: boolean): DumpableTerminal;
    closeTerminal(name: string): void;
}
