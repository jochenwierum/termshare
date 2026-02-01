import { IProgramArguments } from "./argumentParser.js";
import { EventEmitter } from "events";
import { IDisposable } from "./types.js";
export default class Process extends EventEmitter implements IDisposable {
    private readonly cfg;
    private ptyProcess;
    private currentRows;
    private currentCols;
    constructor(cfg: IProgramArguments);
    start(): void;
    private attachConsole;
    close(): Promise<void>;
    resize(cols: number, rows: number): void;
    stdin(presenterStdin: Uint8Array): void;
}
