import { createLogger, format, transports } from "winston";
const MAX_COMPONENT_LEN = 27;
const MAX_LEVEL_LEN = 5;
const SPACES = " ".repeat(MAX_COMPONENT_LEN);
const formatComponent = (info) => {
    let result = "[";
    result += info.component ?? "core";
    if (info.sessionName) {
        result += "/" + info.sessionName;
    }
    result += "]";
    const len = result.length;
    return result + SPACES.substring(0, MAX_COMPONENT_LEN - len);
};
const pad = (info) => {
    const len = info.level.replace(/\u{1b}\[[^m]*m/gu, "").length;
    return info.level + SPACES.substring(0, MAX_LEVEL_LEN - len);
};
export const rootLogger = createLogger({});
export const newLogger = (options) => rootLogger.child(options);
export const setupLogger = (level) => {
    rootLogger.configure({
        level,
        format: format.combine(format.timestamp(), format.errors({ stack: true }), format.splat(), format.colorize(), format.printf(info => `${[info.timestamp]} ${pad(info)} ${(formatComponent(info))} ${info.message}`)),
        transports: [new transports.Console()]
    });
    rootLogger.rejections.handle(new transports.Console());
};
setupLogger("info");
