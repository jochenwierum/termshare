import "./decoration.css";

export default class {
  private readonly owner: HTMLDivElement;
  private readonly titleDiv: HTMLDivElement | null;

  public readonly consoleDiv: HTMLDivElement;

  constructor(owner: HTMLDivElement, enabled: boolean, maximize: boolean) {
    this.owner = owner;
    this.owner.classList.add("window-outer");

    const document = this.owner.ownerDocument;

    const consoleContainer = document.createElement("div");
    consoleContainer.classList.add("console");

    const windowDiv = document.createElement("div");
    windowDiv.classList.add("window");

    if (enabled) {
      this.owner.classList.add("decorated");
      windowDiv.classList.add("decorated");
      consoleContainer.classList.add("decorated");

      if (maximize) {
        windowDiv.classList.add("maximise");
        consoleContainer.classList.add("maximise");
      }

      this.titleDiv = document.createElement("div");
      this.titleDiv.classList.add("title");

      windowDiv.appendChild(this.titleDiv);
      windowDiv.appendChild(consoleContainer);
    } else {
      windowDiv.appendChild(consoleContainer);
      windowDiv.classList.add("maximise");
      consoleContainer.classList.add("maximise");
      this.titleDiv = null;
    }

    this.consoleDiv = document.createElement("div");
    this.consoleDiv.classList.add("console-inner");
    consoleContainer.appendChild(this.consoleDiv);

    this.owner.appendChild(windowDiv);
  }

  public setTitle(title: string): void {
    if (this.titleDiv) {
      this.titleDiv.innerText = title;
    }
  }

  public reset(): void {
    while (this.owner.childElementCount > 0) {
      this.owner.removeChild(this.owner.firstChild as Node);
    }
    this.owner.classList.remove("decorated");
  }
}
