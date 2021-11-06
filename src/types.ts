export interface IDisposable {
  close(): Promise<void>
}

export const EVENT_QUIT = "quit";
export const EVENT_OUTPUT = "output";
export const EVENT_RESIZE = "resize";
export const EVENT_SELECTION = "selection";
export const EVENT_AUDIENCE_COUNT = "audience_count";

export class Output {
  constructor(public readonly output: Uint8Array) {
  }
}

export class Resize {
  constructor(
    public readonly width: number,
    public readonly height: number) {
  }
}

export class Quit {
}

export class Selection {
  constructor(
    public readonly startRow: number,
    public readonly startColumn: number,
    public readonly endRow: number,
    public readonly endColumn: number) {
  }
}
