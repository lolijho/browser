/**
 * Client server-side per l'API admin. La chiave admin resta nel server Next.js
 * (mai esposta al browser). Se non configurata, le pagine mostrano un avviso.
 */
const API_URL = process.env.PUBLIC_API_URL ?? "http://localhost:3000";
const ADMIN_KEY = process.env.ADMIN_API_KEY ?? "";

export interface AdminFetchResult<T> {
  ok: boolean;
  data: T | null;
  error?: string;
}

export async function adminFetch<T>(path: string): Promise<AdminFetchResult<T>> {
  if (!ADMIN_KEY) {
    return { ok: false, data: null, error: "ADMIN_API_KEY non configurata sul server admin." };
  }
  try {
    const response = await fetch(`${API_URL}${path}`, {
      headers: { "x-admin-key": ADMIN_KEY },
      cache: "no-store",
    });
    if (!response.ok) {
      return { ok: false, data: null, error: `API ${response.status}` };
    }
    return { ok: true, data: (await response.json()) as T };
  } catch (error) {
    return {
      ok: false,
      data: null,
      error: error instanceof Error ? error.message : "API non raggiungibile",
    };
  }
}
