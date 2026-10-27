export const NETWORK_ERROR = "Võrguühendus ebaõnnestus. Sisestatud andmed on alles – proovi uuesti.";

export type ApiResponse<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: string };

/** fetch wrapper that never throws and always yields an Estonian error message. */
export async function apiRequest<T>(
  url: string,
  init: { method?: string; body?: unknown },
  fallbackError: string,
): Promise<ApiResponse<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method ?? "GET",
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR };
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // Non-JSON body (e.g. proxy error page); handled below.
  }

  if (!response.ok || data === null) {
    const message =
      typeof data === "object" && data !== null && typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : fallbackError;
    return { ok: false, status: response.status, error: message };
  }
  return { ok: true, status: response.status, data: data as T };
}
