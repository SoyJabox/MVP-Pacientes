// Proxy genérico /api/* → Hono con el JWT de la cookie.
// Las rutas específicas en server/api/auth/ tienen prioridad sobre este catch-all.
const BODY_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export default defineEventHandler(async (event) => {
  const token = getCookie(event, "auth_token");
  if (!token) throw createError({ statusCode: 401, statusMessage: "No autenticado" });

  const path = event.path.replace(/^\/api/, "");
  const method = event.method;

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  let body: Uint8Array | undefined;
  if (BODY_METHODS.has(method)) {
    // Bytes crudos: multipart con PDFs/imágenes no sobrevive a una conversión a string.
    const raw = await readRawBody(event, false).catch(() => undefined);
    if (raw && raw.length > 0) {
      headers["Content-Type"] = event.headers.get("content-type") ?? "application/json";
      body = raw;
    }
  }

  const res = await fetch(`${apiBase()}${path}`, { method, headers, body });
  const tipo = res.headers.get("content-type") ?? "application/json";
  setResponseStatus(event, res.status);
  event.node.res.setHeader("content-type", tipo);

  const disposicion = res.headers.get("content-disposition");
  if (disposicion) event.node.res.setHeader("content-disposition", disposicion);

  // JSON y XML viajan como texto (legible y con charset correcto);
  // cualquier otro tipo (PDF, imágenes) se devuelve byte a byte.
  const esTexto = tipo.includes("json") || tipo.includes("xml") || tipo.startsWith("text/");
  if (esTexto) return await res.text();

  return new Uint8Array(await res.arrayBuffer());
});
