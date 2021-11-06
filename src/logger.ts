import {createLogger, format, transports} from "winston";
import {TransformableInfo} from "logform";

const MAX_COMPONENT_LEN = 27;
const MAX_LEVEL_LEN = 5;
const SPACES = " ".repeat(MAX_COMPONENT_LEN);

const formatComponent = (info: TransformableInfo) => {
  let result = "[";
  result += info.component ?? "core";
  if (info.sessionName) {
    result += "/" + info.sessionName;
  }
  result += "]";

  const len = result.length;
  return result + SPACES.substr(0, MAX_COMPONENT_LEN - len);
};

const pad = (info: TransformableInfo) => {
  const len = (info.level as string).replace(/\u{1b}\[[^m]*m/gu, "").length;
  return info.level + SPACES.substr(0, MAX_LEVEL_LEN - len);
};

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
        format.colorize(),
        format.printf(info => `${[info.timestamp]} ${pad(info)} ${(formatComponent(info))} ${info.message}`)
      ),
      transports: [new transports.Console()]
    }
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((rootLogger as unknown) as any).rejections.handle(new transports.Console());
};

setupLogger("info");
