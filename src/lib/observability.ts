import * as Sentry from "@sentry/react";

let initialized = false;

export function initObservability(): void {
  if (initialized) return;

  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_RELEASE,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  });

  initialized = true;
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

export function captureMessage(
  message: string,
  level: "debug" | "info" | "warning" | "error",
  context?: Record<string, unknown>,
): void {
  if (!initialized) return;
  Sentry.captureMessage(message, { level, extra: context });
}

export function setUserContext(user: { id: string; email?: string | null } | null): void {
  if (!initialized) return;
  if (user) {
    Sentry.setUser({ id: user.id, email: user.email ?? undefined });
  } else {
    Sentry.setUser(null);
  }
}
