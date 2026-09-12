import { ApiError } from "@/client";

/**
 * The message the API actually sent, or a readable fallback.
 *
 * FastAPI puts the useful text in `detail` — the exchange delete endpoint names the
 * positions blocking it there, for instance. The generated client wraps that in an
 * ApiError whose own `message` is only the status line, so reading `error.message`
 * alone throws away the part worth showing.
 *
 * `detail` can also be a validation array (422), in which case the first entry's
 * message is the closest thing to a sentence.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const body = error.body as { detail?: unknown } | null | undefined;
    const detail = body?.detail;

    if (typeof detail === "string" && detail.trim()) return detail;

    if (Array.isArray(detail)) {
      const first = detail[0] as { msg?: unknown } | undefined;
      if (first && typeof first.msg === "string") return first.msg;
    }

    // 401 only happens if the proxy session expired mid-session.
    if (error.status === 401)
      return "Your session expired. Reload to sign in again.";
  }

  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
