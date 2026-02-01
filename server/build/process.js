import { PresenterInput } from "./argumentParser.js";
import { spawn } from "node-pty";
import { EventEmitter } from "events";
import { EVENT_OUTPUT, EVENT_QUIT, EVENT_RESIZE, Output, Quit, Resize } from "./types.js";
import { newLogger } from "./logger.js";
const logger = newLogger({ component: "process" });
export default class Process extends EventEmitter {
    cfg;
    ptyProcess = null;
    currentRows = 0;
    currentCols = 0;
    constructor(cfg) {
        super();
        this.cfg = cfg;
    }
    start() {
        const isConsole = this.cfg.presenterInput == PresenterInput.console;
        if (isConsole) {
            this.currentRows = process.stdout.rows;
            this.currentCols = process.stdout.columns;
        }
        else if (this.cfg.presenterHeight != 0) {
            this.currentRows = this.cfg.presenterHeight;
            this.currentCols = this.cfg.presenterWidth;
        }
        else {
            this.currentRows = 24;
            this.currentCols = 80;
        }
        this.emit(EVENT_RESIZE, new Resize(this.currentCols, this.currentRows));
        logger.info("Spawning process '%s' with %d args in %dx%d", this.cfg.presenterCommand.cmd, this.cfg.presenterCommand.args, this.currentRows, this.currentCols);
        this.ptyProcess = spawn(this.cfg.presenterCommand.cmd, this.cfg.presenterCommand.args, {
            name: "xterm-256color",
            cols: this.currentCols,
            rows: this.currentRows,
        });
        this.ptyProcess.onData(data => this.emit(EVENT_OUTPUT, new Output(Buffer.from(data, "utf-8"))));
        if (isConsole) {
            this.attachConsole(this.ptyProcess);
        }
        this.ptyProcess.onExit(() => this.emit(EVENT_QUIT, new Quit()));
    }
    attachConsole(ptyProcess) {
        process.on("SIGWINCH", () => {
            const rows = process.stdout.rows;
            const columns = process.stdout.columns;
            ptyProcess.resize(columns, rows);
            this.emit(EVENT_RESIZE, new Resize(columns, rows));
        });
        const oldState = process.stdin.isRaw;
        process.stdin.setRawMode(true);
        process.stdin.on("data", (d) => ptyProcess.write("" + d));
        ptyProcess.onExit(() => {
            process.stdin.setRawMode(oldState);
            process.stdin.destroy();
        });
        ptyProcess.onData(data => process.stderr.write(data));
    }
    async close() {
        logger.warn(`Terminating subprocess (${this.cfg.killSignal})…`);
        this.ptyProcess?.kill(this.cfg.killSignal);
    }
    resize(cols, rows) {
        if (this.currentCols == cols && this.currentRows == rows) {
            return;
        }
        this.currentCols = cols;
        this.currentRows = rows;
        logger.info(`New pty size: %dx%d`, rows, cols);
        this.ptyProcess?.resize(cols, rows);
        this.emit(EVENT_RESIZE, new Resize(cols, rows));
    }
    stdin(presenterStdin) {
        this.ptyProcess?.write(Buffer.from(presenterStdin).toString("utf-8"));
    }
}
