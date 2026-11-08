// Proxy genérico /api/* → Hono con el JWT de la cookie.
// Las rutas específicas en server/api/auth/ tienen prioridad sobre este catch-all.
const BODY_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export default defineEventHandler(async (event) => {
  const token = getCookie(event, "auth_token");
  if (!token) throw createError({ statusCode: 401, statusMessage: "No autenticado" });

  const path = event.path.replace(/^\/api/, "");
  const method = event.method;

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  let body: string | undefined;
  if (BODY_METHODS.has(method)) {
    const raw = await readRawBody(event).catch(() => undefined);
    if (typeof raw === "string" && raw.length > 0) {
      headers["Content-Type"] = event.headers.get("content-type") ?? "application/json";
      body = raw;
    }
  }

  const res = await fetch(`${apiBase()}${path}`, { method, headers, body });
  const text = await res.text();
  setResponseStatus(event, res.status);
  if (text) {
    event.node.res.setHeader("content-type", res.headers.get("content-type") ?? "application/json");
  }
  return text;
});
