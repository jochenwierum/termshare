import {Mode, parseArguments, PresenterInput} from "./argumentParser";
import {EVENT_QUIT, IDisposable} from "./types";
import {rootLogger, setupLogger} from "./logger";
import Process from "./process";
import {CachingTerminal, UncachedTerminal} from "./terminal";
import {LocalSessionManager, RemoteSessionManager} from "./sessionManager";
import Audience from "./audience";
import Presenter from "./presenter";
import {RepeaterClient, RepeaterServer} from "./repeater";

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

class ShutdownHandler {
  private readonly closeCallbacks: IDisposable[];

  constructor(
    private readonly repeaterClient: RepeaterClient | null,
    private readonly proc: Process | null,
    ...closeCallbacks: IDisposable[]) {
    this.proc = proc;
    this.repeaterClient = repeaterClient;
    this.closeCallbacks = closeCallbacks;
    if (repeaterClient) closeCallbacks.push(repeaterClient);
  }

  public async handleShutdown() {
    return await new Promise((resolve) => {
      const sigIntHandler = async () => {
        process.off("SIGINT", sigIntHandler);
        if (this.proc) {
          rootLogger.warn("Closing process - press again to force quit");
          await this.proc.close();
        } else {
          closeAll();
        }
      };
      process.on("SIGINT", sigIntHandler);

      const closeAll = () => {
        this.closeCallbacks.forEach(cb => cb.close());
        resolve(true);
      };

      if (this.proc) {
        if (this.repeaterClient) {
          this.repeaterClient.on(EVENT_QUIT, () => this.proc?.close());
          this.repeaterClient.on("error", () => this.proc?.close());
        }

        this.proc.on(EVENT_QUIT, () => {
          rootLogger.warn("Process quit - shutting down servers");
          closeAll();
        });
      }
    });
  }
}

const termshareAudience = (): ShutdownHandler => {
  const sessionManager = new RemoteSessionManager();
  const repeaterServer = new RepeaterServer(sessionManager, args);
  const audienceServer = new Audience(sessionManager, args);

  return new ShutdownHandler(null, null, repeaterServer, audienceServer);
};


const termsharePresenterConsole = async (): Promise<ShutdownHandler> => {
  const wrappedProcess = new Process(args);
  const terminal = new UncachedTerminal(wrappedProcess);
  const repeaterClient = new RepeaterClient(args, terminal);

  try {
    await repeaterClient.start();
  } catch (e) {
    rootLogger.error((e instanceof Error) ? e.message : e);
    process.exit(2);
    throw e; // unreachable
  }

  setupLogging(true);
  wrappedProcess.start();

  return new ShutdownHandler(repeaterClient, wrappedProcess);
};

const termsharePresenterWeb = async (): Promise<ShutdownHandler> => {
  const wrappedProcess = new Process(args);
  const terminal = new CachingTerminal("presenter", args.decoration, wrappedProcess);
  const repeaterClient = new RepeaterClient(args, terminal);
  const sessionManager = new LocalSessionManager(wrappedProcess, args, terminal);
  const presenterServer = new Presenter(sessionManager, wrappedProcess, args);

  try {
    await repeaterClient.start();
  } catch (e) {
    rootLogger.error((e instanceof Error) ? e.message : e);
    process.exit(2);
    throw e; // unreachable
  }

  wrappedProcess.start();

  return new ShutdownHandler(repeaterClient, wrappedProcess, presenterServer);
};

const termshareCombinedConsole = (): ShutdownHandler => {
  const wrappedProcess = new Process(args);
  const terminal = new CachingTerminal("presenter", args.decoration, wrappedProcess);
  const sessionManager = new LocalSessionManager(wrappedProcess, args, terminal);
  const audienceServer = new Audience(sessionManager, args);

  setupLogging(true);
  wrappedProcess.start();

  return new ShutdownHandler(null, wrappedProcess, audienceServer);
};

const termshareCombinedWeb = (): ShutdownHandler => {
  const wrappedProcess = new Process(args);
  const terminal = new CachingTerminal("presenter", args.decoration, wrappedProcess);
  const sessionManager = new LocalSessionManager(wrappedProcess, args, terminal);
  const presenterServer = new Presenter(sessionManager, wrappedProcess, args);
  const audienceServer = new Audience(sessionManager, args);

  wrappedProcess.start();

  return new ShutdownHandler(null, wrappedProcess, audienceServer, presenterServer);
};

const main = async () => {
  let shutdownHandler: ShutdownHandler | null = null;

  setupLogging(false);

  if (args.mode == Mode.repeater) {
    shutdownHandler = termshareAudience();
  } else if (args.mode == Mode.presenter && args.presenterInput == PresenterInput.console) {
    shutdownHandler = await termsharePresenterConsole();
  } else if (args.mode == Mode.presenter && args.presenterInput == PresenterInput.web) {
    shutdownHandler = await termsharePresenterWeb();
  } else if (args.mode == Mode.combined && args.presenterInput == PresenterInput.console) {
    shutdownHandler = termshareCombinedConsole();
  } else if (args.mode == Mode.combined && args.presenterInput == PresenterInput.web) {
    shutdownHandler = termshareCombinedWeb();
  }

  if (shutdownHandler)
    await shutdownHandler.handleShutdown();
};

export default () => main().catch(
  e => {
    console.error("Unhandled fatal error in main routine:", e);
    process.exit(1);
  }
);
