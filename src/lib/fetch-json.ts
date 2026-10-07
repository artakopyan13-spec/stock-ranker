/**
 * Client-side fetch for our JSON API routes that never hides WHY a request failed.
 *
 * The pattern it replaces — `await res.json().catch(() => ({}))` — turned every platform error
 * into an empty object: a 504 timeout, a 413 upload-too-large and a 502 all looked like "no data",
 * so components showed vague fallbacks ("Couldn't build… try again", "Try another industry") that
 * blamed the user's input. Vercel returns those errors as HTML/plain text, never JSON.
 */
export interface JsonResult<T> {
  ok: boolean;
  status: number;
  /** Parsed body when the server answered with JSON (success OR a structured error). */
  data: T | null;
  /** Human-readable reason when !ok — the server's own `error` message when it sent one. */
  error: string | null;
}

const PLATFORM_MESSAGES: Record<number, string> = {
  408: "The request took too long. Try again.",
  413: "That file is too large to upload. Try a smaller file or a screenshot.",
  429: "Too many requests right now. Wait a moment and try again.",
  502: "The server hit a problem. Try again in a moment.",
  503: "This is temporarily unavailable. Try again later.",
  504: "This took too long and timed out. Try again — it usually works on a second run.",
};

export async function fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<JsonResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    return { ok: false, status: 0, data: null, error: "Network error — check your connection and try again." };
  }
  const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
  const data = isJson ? ((await res.json().catch(() => null)) as T | null) : null;
  if (res.ok) return { ok: true, status: res.status, data, error: null };
  const serverMsg = data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string" ? (data as { error: string }).error : null;
  return { ok: false, status: res.status, data, error: serverMsg ?? PLATFORM_MESSAGES[res.status] ?? `Something went wrong (${res.status}). Try again.` };
}

/** POST a JSON body. */
export function postJson<T = unknown>(url: string, body: unknown, init?: RequestInit): Promise<JsonResult<T>> {
  return fetchJson<T>(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), ...init });
}
