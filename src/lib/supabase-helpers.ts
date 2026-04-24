import { supabase } from "@/integrations/supabase/client";

export type MutationResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Wraps a Supabase mutation with consistent error handling.
 * Returns a discriminated union so callers can handle success/failure cleanly.
 */
/**
 * Wraps a Supabase mutation with consistent error handling.
 * For mutations that return data (INSERT/UPDATE with .select()), use safeMutation<YourType>.
 * For mutations that don't return data (DELETE, UPDATE without .select()), use safeMutation<null>.
 */
export async function safeMutation<T = null>(
  fn: () => Promise<{ data: T | null; error: { message: string } | null }>
): Promise<MutationResult<T>> {
  try {
    const { data, error } = await fn();
    if (error) return { success: false, error: error.message };
    return { success: true, data: data as T };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Invoke a Supabase edge function with consistent error handling.
 */
export async function extractInvokeErrorMessage(error: unknown): Promise<string | null> {
  if (!error || typeof error !== "object") return null;

  const maybeError = error as {
    message?: string;
    context?: Response;
    status?: number;
    statusText?: string;
  };

  if (maybeError.context instanceof Response) {
    try {
      const response = maybeError.context.clone();
      const contentType = response.headers.get("content-type") ?? "";

      if (contentType.includes("application/json")) {
        const payload = await response.json() as Record<string, unknown>;
        if (typeof payload.error === "string" && payload.error.trim()) return payload.error.trim();
        if (typeof payload.message === "string" && payload.message.trim()) return payload.message.trim();
      }

      const text = (await response.text()).trim();
      if (text) return text;
    } catch {
      // fall through to generic message handling
    }
  }

  if (typeof maybeError.message === "string" && maybeError.message.trim()) {
    return maybeError.message.trim();
  }

  if (typeof maybeError.status === "number") {
    return typeof maybeError.statusText === "string" && maybeError.statusText.trim()
      ? `${maybeError.status} ${maybeError.statusText.trim()}`
      : `Function error ${maybeError.status}`;
  }

  return null;
}

export async function safeInvoke<T = Record<string, unknown>>(
  functionName: string,
  body: Record<string, unknown>,
  headers?: Record<string, string>
): Promise<MutationResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke<T>(functionName, { body, headers });
    if (error) {
      return { success: false, error: await extractInvokeErrorMessage(error) ?? error.message };
    }
    if (!data) return { success: false, error: "No data returned from function" };
    // Check for error in response body
    const responseObj = data as Record<string, unknown>;
    if (typeof responseObj.error === "string") {
      return { success: false, error: responseObj.error };
    }
    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      error: await extractInvokeErrorMessage(err) ?? (err instanceof Error ? err.message : "Unknown error"),
    };
  }
}

/**
 * Check whether an error indicates a missing table or relation.
 * Useful for graceful degradation when optional tables don't exist.
 */
export function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: string; message?: string };
  if (maybe.code === "PGRST205" || maybe.code === "42P01") return true;
  return (maybe.message ?? "").toLowerCase().includes("could not find the table");
}

/**
 * Get the current user's auth session headers for edge function calls.
 * Returns null if no session is active.
 */
export async function getAuthHeaders(): Promise<Record<string, string> | null> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) return null;
  return { Authorization: `Bearer ${accessToken}` };
}
