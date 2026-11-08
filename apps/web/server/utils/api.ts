// Llamadas del servidor Nuxt hacia la API Hono.
export function apiBase(): string {
  return useRuntimeConfig().apiBase;
}

export async function apiFetch<T>(path: string, opts: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  return await $fetch<T>(`${apiBase()}${path}`, {
    method: opts.method ?? "GET",
    body: opts.body,
    headers: opts.token ? { Authorization: `Bearer ${opts.token}` } : {},
  });
}
