import { DumpableTerminal } from "./terminal.js";
import { Quit } from "./types.js";
import { EventEmitter } from "events";
export class SingleSessionManager {
    virtualTerminal;
    constructor(wrappedProcess, args, cachingTerminal) {
        this.virtualTerminal = cachingTerminal;
    }
    getTerminal() {
        return this.virtualTerminal;
    }
    formatSessionName() {
        return "default";
    }
}
export class MultipleSessionManager extends EventEmitter {
    terminals = new Map();
    constructor() {
        super();
    }
    formatSessionName(sessionName) {
        if (!sessionName.match(/^[A-Za-z][-_A-Za-z0-9]*$/))
            return null;
        return sessionName.toLowerCase();
    }
    getTerminal(sessionName) {
        return this.terminals.get(sessionName) ?? null;
    }
    newTerminal(name, decorated) {
        if (this.terminals.has(name)) {
            throw new Error("A session with this name already exists");
        }
        const term = new DumpableTerminal(name, decorated, null);
        this.terminals.set(name, term);
        this.emit("newSession", name);
        return term;
    }
    closeTerminal(name) {
        this.terminals.get(name)?.handleQuitEvent(new Quit());
        this.terminals.delete(name);
    }
}
