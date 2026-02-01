import { EventEmitter } from "events";
import { Output, Quit, Resize, Selection } from "./types.js";
import Process from "./process.js";
import { Mutex } from "async-mutex";
export declare abstract class UpdatingTerminal extends EventEmitter {
    protected constructor();
    abstract setAudienceCount(count: number): void;
}
export declare class UncachedTerminal extends UpdatingTerminal {
    constructor(wrappedProcess: Process);
    setAudienceCount(): void;
}
export declare class DumpableTerminal extends UpdatingTerminal {
    readonly name: string;
    readonly decorated: boolean;
    private readonly logger;
    readonly mutex: Mutex;
    private readonly terminal;
    private readonly serializeAddon;
    private selection;
    private width;
    private height;
    constructor(name: string, decorated: boolean, wrappedProcess: Process | null);
    handleResizeEvent(r: Resize): void;
    handleOutputEvent(o: Output): Promise<void>;
    handleQuitEvent(q: Quit): boolean;
    handleSelection(startRow: number, startColumn: number, endRow: number, endColumn: number): void;
    setAudienceCount(count: number): void;
    dumpTerminal(acquireMutex?: boolean): Promise<Uint8Array>;
    getWidth(): number;
    getHeight(): number;
    getSelection(): Selection;
}
