import { createPinoLogger, type InferContext } from "@bogeychan/elysia-logger";
import { Elysia } from "elysia";
import * as util from "util";

const isProductionMode = process.env.NODE_ENV === "production";

util.inspect.defaultOptions = {
  depth: 5,
  maxArrayLength: 30,
  maxStringLength: 500,
  compact: isProductionMode,
  breakLength: 80,
};

export function useLogger(app: Elysia) {
  const logger = createPinoLogger({
    redact: {
      paths: [
        "body.password",
        "body.token",
        "headers.authorization",
      ],
      censor: "[Redacted]",
    },
    ...(!isProductionMode
      ? {
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              singleLine: false,
              translateTime: "HH:MM:ss.l",
              ignore: "pid,hostname",
              level: "debug",
            },
          },
        }
      : {}),
    level: isProductionMode ? "info" : "debug",
  });

  console.log = (...args: unknown[]) => {
    logger.info(args.map((a) => (typeof a === "object" ? util.inspect(a) : a)).join(" "));
  };
  console.debug = (...args: unknown[]) => {
    logger.debug(args.map((a) => (typeof a === "object" ? util.inspect(a) : a)).join(" "));
  };
  console.error = (...args: unknown[]) => {
    logger.error(args.map((a) => (typeof a === "object" ? util.inspect(a) : a)).join(" "));
  };
  console.warn = (...args: unknown[]) => {
    logger.warn(args.map((a) => (typeof a === "object" ? util.inspect(a) : a)).join(" "));
  };

  app.use(
    logger.into({
      autoLogging: {
        ignore: () => false,
        getPath: (req) => new URL(req.url).pathname,
      },
      customProps: (ctx: InferContext<typeof app>) => {
        const req = ctx.request;
        return {
          body: ctx.body,
          params: ctx.params,
          query: ctx.query,
          request: {
            method: req?.method,
            url: req?.url,
            referrer: req?.headers?.get?.("Referer") ?? null,
            headers: req?.headers,
          },
        };
      },
    })
  );

  app.decorate("logger", logger);
  return logger;
}
