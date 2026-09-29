import pino from "pino";

// Pretty output only where it is explicitly a dev shell: any host that boots
// without NODE_ENV (a bundled serverless runtime, a bare `node dist`) must
// never crash trying to load the optional pino-pretty transport.
const isDevelopment = process.env.NODE_ENV === "development";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isDevelopment
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }
    : {}),
});
