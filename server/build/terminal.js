import { EventEmitter } from "events";
import { Terminal } from "@xterm/headless/lib-headless/xterm-headless.mjs";
import { EVENT_AUDIENCE_COUNT, EVENT_OUTPUT, EVENT_QUIT, EVENT_RESIZE, EVENT_SELECTION, Selection } from "./types.js";
import { newLogger } from "./logger.js";
import { SerializeAddon } from "@xterm/addon-serialize";
import { Mutex } from "async-mutex";
export class UpdatingTerminal extends EventEmitter {
    constructor() {
        super();
    }
}
export class UncachedTerminal extends UpdatingTerminal {
    constructor(wrappedProcess) {
        super();
        wrappedProcess.on(EVENT_QUIT, (q) => this.emit(EVENT_QUIT, q));
        wrappedProcess.on(EVENT_OUTPUT, (o) => this.emit(EVENT_OUTPUT, o));
        wrappedProcess.on(EVENT_RESIZE, (r) => this.emit(EVENT_RESIZE, r));
    }
    setAudienceCount() {
    }
}
export class DumpableTerminal extends UpdatingTerminal {
    name;
    decorated;
    logger;
    mutex = new Mutex();
    terminal;
    serializeAddon;
    selection;
    width = 0;
    height = 0;
    constructor(name, decorated, wrappedProcess) {
        super();
        this.name = name;
        this.decorated = decorated;
        this.logger = newLogger({ component: "terminal", sessionName: name });
        this.terminal = new Terminal({
            allowProposedApi: true
        });
        this.serializeAddon = new SerializeAddon();
        this.terminal.loadAddon(this.serializeAddon);
        this.selection = new Selection(-1, -1, -1, -1);
        if (wrappedProcess) {
            wrappedProcess.on(EVENT_QUIT, (q) => this.handleQuitEvent(q));
            wrappedProcess.on(EVENT_OUTPUT, (o) => this.handleOutputEvent(o));
            wrappedProcess.on(EVENT_RESIZE, (r) => this.handleResizeEvent(r));
        }
    }
    handleResizeEvent(r) {
        this.width = r.width;
        this.height = r.height;
        this.logger.info(`New terminal size: ${(r.width)}x${(r.height)}`);
        this.terminal.resize(r.width, r.height);
        this.emit(EVENT_RESIZE, r);
    }
    async handleOutputEvent(o) {
        await this.mutex.runExclusive(() => new Promise(resolve => this.terminal.write(o.value, () => resolve())));
        this.emit(EVENT_OUTPUT, o);
    }
    handleQuitEvent(q) {
        return this.emit(EVENT_QUIT, q);
    }
    handleSelection(startRow, startColumn, endRow, endColumn) {
        this.logger.info(`New selection: ${startRow}x${startColumn} to ${endRow}x${endColumn}`);
        this.selection = new Selection(startRow, startColumn, endRow, endColumn);
        this.emit(EVENT_SELECTION, this.selection);
    }
    setAudienceCount(count) {
        this.logger.info(`Current client count: ${count}`);
        this.emit(EVENT_AUDIENCE_COUNT, count);
    }
    async dumpTerminal(acquireMutex = true) {
        const start = new Date();
        let out;
        if (acquireMutex) {
            out = await this.mutex.runExclusive(() => this.serializeAddon.serialize());
        }
        else {
            out = this.serializeAddon.serialize();
        }
        const end = new Date();
        this.logger.info(`Generated ${out.length} bytes of terminal dump in ${end.getTime() - start.getTime()} ms`);
        return Buffer.from(out, "utf-8");
    }
    getWidth() {
        return this.width;
    }
    getHeight() {
        return this.height;
    }
    getSelection() {
        return this.selection;
    }
}
