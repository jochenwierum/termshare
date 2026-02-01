import {Mode, parseArguments, PresenterInput} from "./argumentParser.js";
import {EVENT_QUIT, IDisposable} from "./types.js";
import {rootLogger, setupLogger} from "./logger.js";
import Process from "./process.js";
import {DumpableTerminal, UncachedTerminal} from "./terminal.js";
import {SingleSessionManager, MultipleSessionManager} from "./sessionManager.js";
import Audience from "./audience.js";
import Presenter from "./presenter.js";
import {RepeaterClient, RepeaterServer} from "./repeater.js";

const args = parseArguments();

const setupLogging = (silent: boolean) => {
  if (args.debug) {
    setupLogger("debug");
  } else if (silent) {
    setupLogger("warn");
  } else {
    setupLogger("info");
  }
};

function run(
    repeaterClient: RepeaterClient | null,
    proc: Process | null,
    ...closeCallbacks: IDisposable[]) {
    if (repeaterClient) closeCallbacks.push(repeaterClient);

      const sigIntHandler = async () => {
        process.off("SIGINT", sigIntHandler);
        process.off("SIGHUP", sigIntHandler);
        if (proc) {
          rootLogger.warn("Closing process - press again to force quit");
          await proc.close();
        } else {
          rootLogger.info("Received signal to quit process");
          closeAll();
        }
      };

      process.on("SIGINT", sigIntHandler);
      process.on("SIGHUP", sigIntHandler);

      const closeAll = () => {
        closeCallbacks.forEach(async cb => {
          try {
            await cb.close();
          } catch {
            // just shutdown the rest
          }
        });
      };

      if (proc) {
        if (repeaterClient) {
          repeaterClient.on(EVENT_QUIT, () => proc.close());
        }

        proc.on(EVENT_QUIT, () => {
          rootLogger.warn("Process quit - shutting down servers");
          closeAll();
        });
      }
}

const termshareAudience = () => {
  const sessionManager = new MultipleSessionManager();
  const repeaterServer = new RepeaterServer(sessionManager, args);
  const audienceServer = new Audience(sessionManager, args);

  run(null, null, repeaterServer, audienceServer);
};


const termsharePresenterConsole = async () => {
  const wrappedProcess = new Process(args);
  const terminal = new UncachedTerminal(wrappedProcess);
  const repeaterClient = new RepeaterClient(args, terminal);

  try {
    await repeaterClient.start();
  } catch (e) {
    rootLogger.error((e instanceof Error) ? e.message : e);
    process.exit(2);
  }

  setupLogging(true);
  wrappedProcess.start();

  run(repeaterClient, wrappedProcess);
};

const termsharePresenterWeb = async () => {
  const wrappedProcess = new Process(args);
  const terminal = new DumpableTerminal("presenter", args.decoration, wrappedProcess);
  const repeaterClient = new RepeaterClient(args, terminal);
  const sessionManager = new SingleSessionManager(wrappedProcess, args, terminal);
  const presenterServer = new Presenter(sessionManager, wrappedProcess, args);

  try {
    await repeaterClient.start();
  } catch (e) {
    rootLogger.error((e instanceof Error) ? e.message : e);
    process.exit(2);
  }

  wrappedProcess.start();

  run(repeaterClient, wrappedProcess, presenterServer);
};

const termshareCombinedConsole = () => {
  const wrappedProcess = new Process(args);
  const terminal = new DumpableTerminal("presenter", args.decoration, wrappedProcess);
  const sessionManager = new SingleSessionManager(wrappedProcess, args, terminal);
  const audienceServer = new Audience(sessionManager, args);

  setupLogging(true);
  wrappedProcess.start();

  run(null, wrappedProcess, audienceServer);
};

const termshareCombinedWeb = () => {
  const wrappedProcess = new Process(args);
  const terminal = new DumpableTerminal("presenter", args.decoration, wrappedProcess);
  const sessionManager = new SingleSessionManager(wrappedProcess, args, terminal);
  const presenterServer = new Presenter(sessionManager, wrappedProcess, args);
  const audienceServer = new Audience(sessionManager, args);

  wrappedProcess.start();

  run(null, wrappedProcess, audienceServer, presenterServer);
};

const main = async () => {
  setupLogging(false);

  if (args.mode == Mode.repeater) {
    termshareAudience();
  } else if (args.mode == Mode.presenter && args.presenterInput == PresenterInput.console) {
    await termsharePresenterConsole();
  } else if (args.mode == Mode.presenter && args.presenterInput == PresenterInput.web) {
    await termsharePresenterWeb();
  } else if (args.mode == Mode.combined && args.presenterInput == PresenterInput.console) {
    termshareCombinedConsole();
  } else if (args.mode == Mode.combined && args.presenterInput == PresenterInput.web) {
    termshareCombinedWeb();
  }
};

export default () => main()
  .catch(e => {
    console.error("Unhandled fatal error in main routine:", e);
    process.exit(1);
  });
