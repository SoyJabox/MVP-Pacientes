import { createMiddleware } from "hono/factory";
import DOMPurify from "isomorphic-dompurify";

// Sanitiza todos los strings del body de la request.
// Previene XSS en campos de texto libre (nombre, evolución, motivo, etc.).
export const sanitizar = createMiddleware(async (c, next) => {
  const contentType = c.req.header("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = await c.req.json().catch(() => null);
    if (body && typeof body === "object") {
      const sanitizado = sanearObjeto(body);
      // Reemplazar el body para que los handlers siguientes lo lean sanitizado.
      c.req = new Request(c.req.url, {
        method: c.req.method,
        headers: c.req.headers,
        body: JSON.stringify(sanitizado),
      });
    }
  }

  await next();
});

function sanearObjeto(obj: unknown): unknown {
  if (typeof obj === "string") {
    return DOMPurify.sanitize(obj, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  }
  if (Array.isArray(obj)) {
    return obj.map(sanearObjeto);
  }
  if (obj && typeof obj === "object") {
    const resultado: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      resultado[key] = sanearObjeto(value);
    }
    return resultado;
  }
  return obj;
}
