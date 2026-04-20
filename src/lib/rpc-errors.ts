/**
 * Typed classification of errors returned from Supabase RPCs / Edge Functions.
 *
 * Call sites receive a discriminated union so retry logic can differentiate
 * between transient failures (retry), validation failures (surface to the
 * user, do not retry), permission failures (sign-in / report), and terminal
 * business rule failures like `Cannot complete stop` (do not retry).
 */

export type RpcErrorKind = "permission" | "validation" | "business" | "transient" | "unknown";

export interface RpcError {
  kind: RpcErrorKind;
  message: string;
  /** Server-supplied code when available (e.g. Postgres / PostgREST code). */
  code?: string;
  /** True when retrying this operation is safe; false for validation/business errors. */
  retryable: boolean;
}

const PERMISSION_MARKERS = [
  "permission denied",
  "not authorized",
  "unauthorized",
  "insufficient_privilege",
  "jwt",
];

const VALIDATION_MARKERS = [
  "invalid input",
  "violates check constraint",
  "violates not-null",
  "violates unique constraint",
  "invalid transition",
  "validation",
];

const BUSINESS_MARKERS = ["cannot complete stop"];

function lower(message: string): string {
  return message.toLowerCase();
}

export function classifyRpcError(raw: unknown): RpcError {
  if (raw == null) {
    return { kind: "unknown", message: "Unknown error", retryable: true };
  }

  const message =
    raw instanceof Error
      ? raw.message
      : typeof raw === "string"
        ? raw
        : typeof raw === "object" && raw !== null && "message" in raw
          ? String((raw as { message: unknown }).message)
          : String(raw);

  const code =
    typeof raw === "object" && raw !== null && "code" in raw
      ? String((raw as { code: unknown }).code ?? "")
      : undefined;

  const lowered = lower(message);

  if (BUSINESS_MARKERS.some((m) => lowered.includes(m))) {
    return { kind: "business", message, code, retryable: false };
  }
  if (PERMISSION_MARKERS.some((m) => lowered.includes(m))) {
    return { kind: "permission", message, code, retryable: false };
  }
  if (VALIDATION_MARKERS.some((m) => lowered.includes(m))) {
    return { kind: "validation", message, code, retryable: false };
  }

  // Network-y errors from fetch / functions.invoke are safe to retry.
  if (
    raw instanceof Error &&
    (raw.name === "TypeError" || /network|failed to fetch|timed? ?out|aborted/i.test(message))
  ) {
    return { kind: "transient", message, code, retryable: true };
  }

  return { kind: "unknown", message, code, retryable: true };
}

