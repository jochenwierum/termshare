export declare enum Mode {
    combined = "combined",
    presenter = "presenter",
    repeater = "repeater"
}
export declare enum PresenterInput {
    console = "console",
    web = "web"
}
export interface IPresenterCommand {
    cmd: string;
    args: string[];
}
export interface IProgramArguments {
    audienceBind: string;
    customCssDir: string | null;
    decoration: boolean;
    debug: boolean;
    fontFamily: string | null;
    fontSize: number;
    killSignal: string;
    mode: Mode;
    presenterBind: string;
    presenterCommand: IPresenterCommand;
    presenterHeight: number;
    presenterInput: PresenterInput;
    presenterSession: string;
    presenterWidth: number;
    repeaterServer: string;
    repeaterBind: string;
}
export declare const parseArguments: () => IProgramArguments;
