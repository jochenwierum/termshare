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

interface IRawProgramArguments {
  "audience-bind": string;
  "custom-css-dir": string | null;
  decoration: boolean;
  debug: boolean;
  "font-family": string | null;
  "font-size": number;
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

// eslint-disable-next-line
function defaultValue<T>(name: string, fallbackValue: T, convert: (v: string) => T = v => v as unknown as T): T {
  const v = process.env["TERMSHARE_" + name.toUpperCase().replace(/-/g, "_")];
  if (v) {
    return convert(v);
  } else {
    return fallbackValue;
  }
}

const parsePositiveInteger = (value: string) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : -1;
};

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
    defaultValue: defaultValue("audience-bind", ":8080"),
    description: "Where to bind the audience port to.\nDefaults to :8080",
    typeLabel: "{underline bind-address}",
    group: ["repeater", "combined"]
  },
  {
    name: "custom-css-dir",
    alias: "c",
    defaultValue: defaultValue("custom-css-dir", null as null | string),
    description: "A directory which will be available as /_custom/ in the embedded http servers.\nMust include a file named custom.css.",
    typeLabel: "{underline directory}",
    group: ["repeater", "combined"]
  },
  {
    name: "decoration",
    alias: "d",
    type: Boolean,
    defaultValue: defaultValue("decoration", false, v => v.toLowerCase() === "false"),
    description: "Draw a decoration (includes window title)",
    typeLabel: "{underline true|false}",
    group: ["combined", "presenter"]
  },
  {
    name: "debug",
    type: Boolean,
    defaultValue: defaultValue("debug", false, v => v.toLowerCase() === "false"),
    description: "Debug logging",
    typeLabel: "{underline true|false}"
  },
  {
    name: "font-family",
    alias: "f",
    defaultValue: defaultValue("font-family", null as null | string),
    description: "The font family to use in the web.\nMay require to define @font-face rules in custom.css.",
    typeLabel: "{underline string}",
    group: ["repeater", "combined"]
  },
  {
    name: "font-size",
    alias: "S",
    defaultValue: defaultValue("font-size", 12, parsePositiveInteger),
    description: "The font size to use in the web.",
    typeLabel: "{underline string}",
    group: ["repeater", "combined"]
  },
  {
    name: "kill-signal",
    alias: "k",
    defaultValue: defaultValue("kill-signal", "SIGHUP"),
    description: "Signal that will be sent to exit the presented application\nDefaults to SIGHUP",
    typeLabel: "{underline signal-name}",
    group: ["presenter", "combined"]
  },
  {
    name: "mode",
    type: (value: string) => Mode[value as keyof typeof Mode],
    alias: "m",
    defaultValue: defaultValue("mode", Mode.combined, v => Mode[v as keyof typeof Mode]),
    description: "Application mode.\nDefaults to combined",
    typeLabel: "{underline combined|presenter|repeater}",
  },
  {
    name: "presenter-bind",
    alias: "p",
    defaultValue: defaultValue("presenter-bind", "127.0.0.1:8081"),
    description: "Where to bind the presenter port to.\nDefaults to 127.0.0.1:8081",
    typeLabel: "{underline bind-address}",
    group: ["repeater", "combined"]
  },
  {
    name: "presenter-height",
    type: parsePositiveInteger,
    alias: "h",
    defaultValue: defaultValue("presenter-height", 0, parsePositiveInteger),
    description: "Terminal with (0 = auto resize). Must be set if presenterHeight is set.\nDefaults to 0",
    typeLabel: "{underline integer}",
    group: "web"
  },
  {
    name: "presenter-input",
    alias: "i",
    type: (value: string) => PresenterInput[value as keyof typeof PresenterInput],
    defaultValue: defaultValue("presenter-input", PresenterInput.console,
      (value: string) => PresenterInput[value as keyof typeof PresenterInput]),
    description: "Which input to use.\nDefaults to console",
    typeLabel: "{underline console|web}",
    group: ["presenter", "combined"]
  },
  {
    name: "presenter-session",
    alias: "s",
    type: String,
    defaultValue: defaultValue("presenter-session", null as null | string),
    description: "{bold Required.}\nName of the session.",
    typeLabel: "{underline string}",
    group: "presenter"
  },
  {
    name: "presenter-width",
    alias: "w",
    type: parsePositiveInteger,
    defaultValue: defaultValue("presenter-width", 0, parsePositiveInteger),
    description: "Terminal with (0 = auto resize). Must be set if presenterHeight is set.\nDefaults to 0",
    typeLabel: "{underline integer}",
    group: "web"
  },
  {
    name: "repeater-server",
    alias: "r",
    defaultValue: defaultValue("repeater-server", "127.0.0.1:8082"),
    description: "Address of repeater application.\nDefaults to 127.0.0.1:8082",
    typeLabel: "{underline address}",
    group: "presenter"
  },
  {
    name: "repeater-bind",
    alias: "R",
    defaultValue: defaultValue("repeater-bind", "127.0.0.1:8082"),
    description: "Where to listen for presenter connections.\nDefaults to 127.0.0.1:8082",
    typeLabel: "{underline bind-address}",
    group: "repeater"
  }
];

const fail = (msg: string | null) => {
  if (msg) console.error(msg);

  const content = `Share your terminal session over HTTP.

  Usage:
  termshare [options] [command [arguments...]]

  If no command is provided, $SHELL is used.
  
  You can also set each option with environment variables, e.g. TERMSHARE_PRESENTER_INPUT for --presenter-input. `;

  console.error(commandLineUsage([
    {
      header: "Termshare",
      content
    },
    {
      header: "General Options",
      optionList: optionDefinitions,
      group: "_none",
      reverseNameOrder: true
    },
    {
      header: "Options for mode 'combined'",
      optionList: optionDefinitions,
      group: "combined",
      reverseNameOrder: true
    },
    {
      header: "Options for mode 'presenter'",
      optionList: optionDefinitions,
      group: "presenter",
      reverseNameOrder: true
    },
    {
      header: "Options for mode 'repeater'",
      optionList: optionDefinitions,
      group: "repeater",
      reverseNameOrder: true
    },
    {
      header: "Options for input type 'web'",
      optionList: optionDefinitions,
      group: "web",
      reverseNameOrder: true
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

  if (args["font-size"] <= 0)
    fail("Font size must be a positive integer");

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
    fontSize: args["font-size"],
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
