import "./overlay.css";

export default class {
  public readonly content: HTMLDivElement
  private readonly overlay: HTMLDivElement;

  private readonly text: HTMLDivElement;
  private readonly button: HTMLAnchorElement;

  private buttonAction: (() => void) | null = null;

  constructor(owner: HTMLDivElement) {
    const document = owner.ownerDocument;

    this.overlay = document.createElement("div");
    this.overlay.classList.add("overlay");
    this.overlay.classList.add("overlay-hidden");

    const inner = document.createElement("div");
    inner.classList.add("overlay-inner");
    this.overlay.appendChild(inner);

    this.text = document.createElement("div");
    inner.appendChild(this.text);

    this.button = document.createElement("a");
    this.button.href = "#";
    this.button.onclick = this.click.bind(this);

    const buttonDiv = document.createElement("div");
    buttonDiv.appendChild(this.button);
    inner.appendChild(buttonDiv);

    this.content = document.createElement("div");

    owner.classList.add("overlay-container");
    owner.appendChild(this.overlay);
    owner.appendChild(this.content);
  }

  public show(text: string, buttonText: string | null = null, buttonAction: (() => void) | null = null): void {
    this.text.innerText = text;

    if (buttonAction && buttonText) {
      this.button.innerText = buttonText;
      this.button.classList.remove("overlay-hidden");
      this.buttonAction = buttonAction;
    } else {
      if (!this.button.classList.contains("overlay-hidden")) {
        this.button.classList.add("overlay-hidden");
      }
      this.buttonAction = null;
    }

    this.overlay.classList.remove("overlay-hidden");
  }

  public hide(): void {
    if (!this.overlay.classList.contains("overlay-hidden")) {
      this.overlay.classList.add("overlay-hidden");
    }
  }

  private click(): boolean {
    if (this.buttonAction != null) {
      this.buttonAction();
    }
    return false;
  }
}
