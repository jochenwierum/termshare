export const EVENT_QUIT = "quit";
export const EVENT_OUTPUT = "output";
export const EVENT_RESIZE = "resize";
export const EVENT_SELECTION = "selection";
export const EVENT_AUDIENCE_COUNT = "audience_count";
export class Output {
    value;
    constructor(value) {
        this.value = value;
    }
}
export class Resize {
    width;
    height;
    constructor(width, height) {
        this.width = width;
        this.height = height;
    }
}
export class Quit {
}
export class Selection {
    startRow;
    startColumn;
    endRow;
    endColumn;
    constructor(startRow, startColumn, endRow, endColumn) {
        this.startRow = startRow;
        this.startColumn = startColumn;
        this.endRow = endRow;
        this.endColumn = endColumn;
    }
}
