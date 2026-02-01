export interface IDisposable {
    close(): Promise<void>;
}
export declare const EVENT_QUIT = "quit";
export declare const EVENT_OUTPUT = "output";
export declare const EVENT_RESIZE = "resize";
export declare const EVENT_SELECTION = "selection";
export declare const EVENT_AUDIENCE_COUNT = "audience_count";
export declare class Output {
    readonly value: Uint8Array;
    constructor(value: Uint8Array);
}
export declare class Resize {
    readonly width: number;
    readonly height: number;
    constructor(width: number, height: number);
}
export declare class Quit {
}
export declare class Selection {
    readonly startRow: number;
    readonly startColumn: number;
    readonly endRow: number;
    readonly endColumn: number;
    constructor(startRow: number, startColumn: number, endRow: number, endColumn: number);
}
