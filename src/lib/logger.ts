/**
 * Thin logger abstraction. Writes to the console and forwards to the
 * observability backend (Sentry) when configured via VITE_SENTRY_DSN.
 *
 * Call sites pass a short event name + structured context so logs are greppable
 * and ready for forwarding to a real telemetry backend.
 */
import { captureException, captureMessage } from "./observability";

type LogContext = Record<string, unknown>;

type LogLevel = "debug" | "info" | "warn" | "error";

const isDev = import.meta.env?.DEV ?? false;

function emit(level: LogLevel, event: string, context?: LogContext): void {
  if (level === "debug" && !isDev) return;

  const payload = context ? { event, ...context } : { event };

  switch (level) {
    case "error":
      // eslint-disable-next-line no-console
      console.error(payload);
      return;
    case "warn":
      // eslint-disable-next-line no-console
      console.warn(payload);
      return;
    case "debug":
      // eslint-disable-next-line no-console
      console.debug(payload);
      return;
    default:
      // eslint-disable-next-line no-console
      console.info(payload);
  }
}

function normalizeError(err: unknown): { message: string; stack?: string; name?: string } {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack, name: err.name };
  }
  if (typeof err === "string") return { message: err };
  try {
    return { message: JSON.stringify(err) };
  } catch {
    return { message: String(err) };
  }
}

export const logger = {
  debug(event: string, context?: LogContext) {
    emit("debug", event, context);
  },
  info(event: string, context?: LogContext) {
    emit("info", event, context);
  },
  warn(event: string, context?: LogContext) {
    emit("warn", event, context);
    captureMessage(event, "warning", context);
  },
  error(event: string, err?: unknown, context?: LogContext) {
    emit("error", event, {
      ...(err !== undefined ? { error: normalizeError(err) } : {}),
      ...(context ?? {}),
    });
    if (err !== undefined) {
      captureException(err, { event, ...(context ?? {}) });
    } else {
      captureMessage(event, "error", context);
    }
  },
};

export type Logger = typeof logger;
