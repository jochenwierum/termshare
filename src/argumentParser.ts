import commandLineArgs from "command-line-args";
import commandLineUsage, {OptionDefinition} from "command-line-usage";
import * as fs from "fs";

export enum Mode {
  combined = "combined",
  presenter = "presenter",
  repeater = "repeater"
}

export enum PresenterInput {
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

interface IRawProgramArguments {
  "audience-bind": string;
  "custom-css-dir": string | null;
  decoration: boolean;
  debug: boolean;
  "font-family": string | null;
  "kill-signal": string;
  mode: Mode;
  "presenter-bind": string;
  "presenter-command": IPresenterCommand;
  "presenter-height": number;
  "presenter-input": PresenterInput;
  "presenter-session": string;
  "presenter-width": number;
  "repeater-server": string;
  "repeater-bind": string;
}

interface IInternalArguments {
  help: boolean;
  _unknown: string[];
}

const optionDefinitions: OptionDefinition[] = [
  {
    name: "help",
    type: Boolean,
    description: "Show this help",
    group: "general"
  },
  {
    name: "audience-bind",
    alias: "a",
    defaultValue: ":8080",
    description: "Where to bind the audience port to.\nDefault: :8080",
    typeLabel: "{underline bind-address}",
    group: ["repeater", "combined"]
  },
  {
    name: "custom-css-dir",
    alias: "c",
    defaultValue: null,
    description: "A directory which will be available as /_custom/ in the embedded http servers.\nMust include a file named custom.css.",
    typeLabel: "{underline directory}",
    group: ["repeater", "combined"]
  },
  {
    name: "decoration",
    alias: "d",
    type: Boolean,
    defaultValue: false,
    description: "Draw a decoration (includes window title)",
    typeLabel: "{underline true|false}",
    group: ["combined", "presenter"]
  },
  {
    name: "debug",
    type: Boolean,
    defaultValue: false,
    description: "Debug logging",
    typeLabel: "{underline true|false}",
  },
  {
    name: "font-family",
    alias: "f",
    defaultValue: null,
    description: "The font family to use in the web.\nMay require to define a @font-face rule in custom.css.",
    typeLabel: "{underline string}",
    group: ["repeater", "combined"]
  },
  {
    name: "kill-signal",
    alias: "k",
    defaultValue: "SIGHUP",
    description: "Signal that will be sent to exit the presented application\nDefault: SIGHUP",
    typeLabel: "{underline signal-name}",
    group: ["presenter", "combined"]
  },
  {
    name: "mode",
    type: (value: string) => Mode[value as keyof typeof Mode],
    alias: "m",
    defaultValue: Mode.combined,
    description: "Application mode.\nDefault: combined",
    typeLabel: "{underline combined|presenter|repeater}",
  },
  {
    name: "presenter-bind",
    alias: "b",
    defaultValue: "127.0.0.1:8081",
    description: "Where to bind the presenter port to.\nDefault: 127.0.0.1:8081",
    typeLabel: "{underline bind-address}",
    group: ["repeater", "combined"]
  },
  {
    name: "presenter-height",
    alias: "h",
    defaultValue: 0,
    type: (value: string) => {
      const parsed = Number(value);
      return !Number.isInteger(parsed) || parsed < 0;
    },
    description: "Terminal with (0 = auto resize). Must be set if presenterHeight is set.\nDefault: 0",
    typeLabel: "{underline integer}",
    group: "web"
  },
  {
    name: "presenter-input",
    alias: "i",
    type: (value: string) => PresenterInput[value as keyof typeof PresenterInput],
    defaultValue: PresenterInput.console,
    description: "Which input to use.\nDefault: console",
    typeLabel: "{underline console|web}",
    group: ["presenter", "combined"]
  },
  {
    name: "presenter-session",
    alias: "s",
    type: String,
    defaultValue: null,
    description: "{bold Required.}\nName of the session.",
    typeLabel: "{underline string}",
    group: "presenter"
  },
  {
    name: "presenter-width",
    alias: "w",
    type: (value: string) => {
      const parsed = Number(value);
      return !Number.isInteger(parsed) || parsed < 0;
    },
    defaultValue: 0,
    description: "Terminal with (0 = auto resize). Must be set if presenterHeight is set.\nDefault: 0",
    typeLabel: "{underline integer}",
    group: "web"
  },
  {
    name: "repeater-server",
    alias: "r",
    defaultValue: "127.0.0.1:8082",
    description: "Address of repeater application.\nDefault: 127.0.0.1:8082",
    typeLabel: "{underline address}",
    group: "presenter"
  },
  {
    name: "repeater-bind",
    alias: "p",
    defaultValue: "127.0.0.1:8082",
    description: "Where to listen for presenter connections.\nDefault: 127.0.0.1:8082",
    typeLabel: "{underline bind-address}",
    group: "repeater"
  }
];

const fail = (msg: string | null) => {
  if (msg) console.error(msg);
  console.error(commandLineUsage([
    {
      header: "Termshare",
      content: "Share your terminal session over HTTP."
    },
    {
      header: "General Options",
      optionList: optionDefinitions,
      group: "_none"
    },
    {
      header: "Options for mode 'combined'",
      optionList: optionDefinitions,
      group: "combined"
    },
    {
      header: "Options for mode 'presenter'",
      optionList: optionDefinitions,
      group: "presenter"
    },
    {
      header: "Options for mode 'repeater'",
      optionList: optionDefinitions,
      group: "repeater"
    },
    {
      header: "Options for input type 'web'",
      optionList: optionDefinitions,
      group: "web"
    },
  ]));
  process.exit(1);
};

export const parseArguments: () => IProgramArguments = () => {
  const parsed = commandLineArgs(optionDefinitions, {stopAtFirstUnknown: true});
  const args = parsed._all as IRawProgramArguments & IInternalArguments;

  if (args.help)
    fail(null);

  if (!args.mode)
    fail("Unknown mode: " + args.mode);
  if (args.mode !== Mode.repeater && !args["presenter-input"])
    fail("Unknown presenterInput: " + args["presenter-input"]);

  if (args.mode === Mode.presenter && (!args["presenter-session"] || !args["presenter-session"].match("^[a-zA-Z0-9-_+]+$")))
    fail("Presenter session name is required");

  if (args["presenter-height"] && args["presenter-height"] < 0)
    fail("presenterHeight must be a positive integer");
  if (args["presenter-width"] && args["presenter-width"] < 0)
    fail("presenterWidth must be a positive integer");
  if ((args["presenter-width"] === 0) != (args["presenter-height"] === 0))
    fail("presenterHeight and presenterWidth must be set together");


  if (args.mode === Mode.presenter && !args["repeater-server"])
    fail("Repeater address is missing");

  let cmd: string;
  let cmdArgs: string[] = [];
  if (!parsed._unknown || parsed._unknown.length === 0) {
    cmd = process.env.SHELL ?? "bash";
  } else {
    cmd = parsed._unknown[0];
    cmdArgs = parsed._unknown.slice(1);
  }

  if (args["custom-css-dir"] && !fs.existsSync(args["custom-css-dir"]))
    fail("Provided CSS directory does not exist or does not contain a custom.css");

  return {
    audienceBind: args["audience-bind"],
    customCssDir: args["custom-css-dir"],
    decoration: args.decoration,
    debug: args.debug,
    fontFamily: args["font-family"],
    killSignal: args["kill-signal"],
    mode: args.mode,
    presenterBind: args["presenter-bind"],
    presenterHeight: args["presenter-height"],
    presenterInput: args["presenter-input"],
    presenterSession: args["presenter-session"],
    presenterWidth: args["presenter-width"],
    repeaterServer: args["repeater-server"],
    repeaterBind: args["repeater-bind"],

    presenterCommand: {
      cmd: cmd as string,
      args: cmdArgs as string[]
    },
  };
};
