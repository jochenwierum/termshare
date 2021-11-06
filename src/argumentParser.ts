import commandLineArgs from "command-line-args";
import commandLineUsage, {OptionDefinition} from "command-line-usage";

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

interface IInternalArguments {
  help: boolean;
  _unknown: string[];
}

const fail = (msg: string | null, optionDefinitions: OptionDefinition[]) => {
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
  const optionDefinitions: OptionDefinition[] = [
    {
      name: "help",
      type: Boolean,
      description: "Show this help",
      group: "general"
    },
    {
      name: "audienceBind",
      alias: "a",
      defaultValue: ":8080",
      description: "Where to bind the audience port to.",
      typeLabel: "{underline bind-address}",
      group: ["repeater", "combined"]
    },
    {
      name: "customCssDir",
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
      name: "fontFamily",
      alias: "f",
      defaultValue: null,
      description: "The font family to use in the web.\nMay require to define a @font-face rule in custom.css.",
      typeLabel: "{underline string}",
      group: ["repeater", "combined"]
    },
    {
      name: "killSignal",
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
      name: "presenterBind",
      alias: "b",
      defaultValue: "127.0.0.1:8081",
      description: "Where to bind the presenter port to.",
      typeLabel: "{underline bind-address}",
      group: ["repeater", "combined"]
    },
    {
      name: "presenterHeight",
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
      name: "presenterInput",
      alias: "i",
      type: (value: string) => PresenterInput[value as keyof typeof PresenterInput],
      defaultValue: PresenterInput.console,
      description: "Which input to use.\nDefault: console",
      typeLabel: "{underline console|web}",
      group: ["presenter", "combined"]
    },
    {
      name: "presenterSession",
      alias: "s",
      type: String,
      defaultValue: null,
      description: "{bold Required.}\nName of the session.",
      typeLabel: "{underline string}",
      group: "presenter"
    },
    {
      name: "presenterWidth",
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
      name: "repeaterServer",
      alias: "r",
      defaultValue: "127.0.0.1:8082",
      description: "{bold Required.}\nAddress of repeater application.\nDefault: 127.0.0.1:8082",
      typeLabel: "{underline address}",
      group: "presenter"
    },
    {
      name: "repeaterBind",
      alias: "p",
      defaultValue: "127.0.0.1:8082",
      description: "Where to listen for presenter connections.",
      typeLabel: "{underline bind-address}",
      group: "repeater"
    }
  ];

  const parsed = commandLineArgs(optionDefinitions, {stopAtFirstUnknown: true});
  const args = parsed._all as IProgramArguments & IInternalArguments;

  if (args.help)
    fail(null, optionDefinitions);

  if (!args.mode)
    fail("Unknown mode: " + args.mode, optionDefinitions);
  if (args.mode !== Mode.repeater && !args.presenterInput)
    fail("Unknown presenterInput: " + args.presenterInput, optionDefinitions);

  if (args.mode === Mode.presenter && (!args.presenterSession || !args.presenterSession.match("^[a-zA-Z0-9-_+]+$")))
    fail("Presenter session name is required", optionDefinitions);

  if (args.presenterHeight && args.presenterHeight < 0)
    fail("presenterHeight must be a positive integer", optionDefinitions);
  if (args.presenterWidth && args.presenterWidth < 0)
    fail("presenterWidth must be a positive integer", optionDefinitions);
  if ((args.presenterWidth === 0) != (args.presenterHeight === 0))
    fail("presenterHeight and presenterWidth must be set together", optionDefinitions);


  if (args.mode === Mode.presenter && !args.repeaterServer)
    fail("Repeater address is missing", optionDefinitions);

  let cmd: string;
  let cmdArgs: string[] = [];
  if (!args._unknown || args._unknown.length === 0) {
    cmd = process.env.SHELL || "bash";
  } else {
    cmd = args._unknown[0];
    cmdArgs = args._unknown.slice(1);
  }

  return {
    ...args,
    presenterCommand: {
      cmd: cmd as string,
      args: cmdArgs as string[]
    } as IPresenterCommand,
  } as IProgramArguments;
};
