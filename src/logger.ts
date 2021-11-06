import {createLogger, format, transports} from "winston";
import {TransformableInfo} from "logform";

const MAX_LEN = 27;
const MAX_LEN_PAD = " ".repeat(25);

const formatComponent = (info: TransformableInfo) => {
  const base = `[${info.component || "core"}]`;
  if (base.length > MAX_LEN) {
    return base;
  } else {
    return (`${base}${MAX_LEN_PAD}`).substr(0, MAX_LEN);
  }
};

const formatSession = (info: TransformableInfo) =>
  !info.sessionName ? "" : ` {${info.sessionName}}`;

export const rootLogger = createLogger({});

export const newLogger = (options: object) => rootLogger.child(options);

export const setupLogger = (level: string) => {
  rootLogger.configure(
    {
      level,
      format: format.combine(
        format.timestamp(),
        format.errors({stack: true}),
        format.splat(),
        format.padLevels(),
        format.colorize(),
        format.printf(info => `${[info.timestamp]} ${(formatComponent(info))} ${info.level}${info.message}${(formatSession(info))}`)
      ),
      transports: [new transports.Console()]
    }
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((rootLogger as unknown) as any).rejections.handle(new transports.Console());
};

setupLogger("warn");
