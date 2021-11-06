import "xterm/css/xterm.css";

import {Terminal as XTerm} from "xterm";
import {WebLinksAddon} from "xterm-addon-web-links";
import {FitAddon} from "xterm-addon-fit";
import {SearchAddon} from "xterm-addon-search";
import {WebglAddon} from "xterm-addon-webgl";
import {EventEmitter} from "events";
import {web} from "../../src/proto/web";
import {Unicode11Addon} from "xterm-addon-unicode11";

export default class Terminal extends EventEmitter {
  private readonly parent: HTMLElement;
  private readonly term: XTerm;
  private readonly fitAddon: FitAddon | null = null;
  private readonly windowResizedHandler: OmitThisParameter<() => void>;
  private readonly maximize: boolean;

  private resizeTimeout: NodeJS.Timeout | null = null;
  private prefix = "";
  private title = "";

  constructor(parent: HTMLElement, fontFamily: string | null | undefined, isPresenter: boolean, maximize = false) {
    super();

    if (!isPresenter) maximize = false;

    this.windowResizedHandler = this.windowResized.bind(this);

    this.term = new XTerm({
      allowTransparency: false,
      bellStyle: "none",
      cursorBlink: true,
      cursorStyle: "block",
      disableStdin: !isPresenter,
      cols: 80,
      rows: 24,
      scrollback: 0,
    });
    this.term.setOption("bellStyle", "visual");
    if (fontFamily) {
      this.term.setOption("fontFamily", fontFamily);
    }

    this.term.loadAddon(new WebLinksAddon());
    this.term.loadAddon(new SearchAddon());
    this.term.loadAddon(new Unicode11Addon());

    this.term.unicode.activeVersion = "11";

    if (isPresenter) {
      this.term.onData(d => this.emit("data", d));
      this.term.onSelectionChange(() => this.emit("selection", this.term.getSelectionPosition()));
    }

    if (maximize) {
      this.fitAddon = new FitAddon();
      this.term.loadAddon(this.fitAddon);
      window.addEventListener("resize", this.windowResizedHandler);
      this.term.onResize(size => this.emit("resize", size.cols, size.rows));
    }

    this.term.onTitleChange(title => {
      this.title = title;
      this.emitTitle();
    });

    this.parent = parent;
    this.maximize = maximize;
  }

  public open(): void {
    this.term.open(this.parent);

    if (Terminal.hasWebGl()) {
      this.term.loadAddon(new WebglAddon());
    }

    if (this.maximize) {
      this.updateSize();
    }

    this.focus();
  }

  public close(): void {
    window.removeEventListener("resize", this.windowResizedHandler);
    this.term.dispose();
  }

  public reset(): void {
    this.term.clear();
    this.term.reset();
  }

  public data(data: string | Uint8Array): void {
    this.term.write(data);
  }

  public resize(size: web.IResize): void {
    const width = size?.width as number;
    const height = size?.height as number;
    this.term.resize(width, height);
  }

  public select(select: web.ISelection): void {
    const row1 = select.startRow as number;
    const row2 = select.endRow as number;
    const col1 = select.startColumn as number;
    const col2 = select.endColumn as number;

    if (row1 === -1 && row2 === -1 && col1 === -1 && col2 === -1) {
      this.term.clearSelection();
    } else {
      const lineLength = this.term.cols;

      const startRow = Math.min(row1, row2);
      const endRow = startRow == row1 ? row2 : row1;
      const startCol = startRow == endRow ? Math.min(col1, col2) :
        (row1 < row2 ? col1 : col2);
      const endCol = startCol == col1 ? col2 : col1;

      const len = (endRow - startRow) * lineLength - startCol + endCol;
      this.term.select(startCol, startRow as number, len);
    }
  }

  public focus(): void {
    this.term.focus();
  }

  private windowResized() {
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
    this.resizeTimeout = setTimeout(() => {
      this.resizeTimeout = null;
      this.updateSize();
    }, 250);
  }

  private updateSize(): void {
    this.fitAddon?.fit();
    this.emit("resize", this.term.cols, this.term.rows);
  }

  private static hasWebGl(): boolean {
    try {
      const canvas = document.createElement("canvas");
      return !!(window.WebGL2RenderingContext && canvas.getContext("webgl2"));
    } catch (e) {
      return false;
    }
  }

  public setTitlePrefix(prefix: string): void {
    this.prefix = prefix;
    this.emitTitle();
  }

  private emitTitle(): void {
    this.emit("title", this.prefix + this.title);
  }
}
