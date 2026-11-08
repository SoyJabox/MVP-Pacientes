import { createMiddleware } from "hono/factory";
import { db } from "./db/client";
import { auditoria } from "./db/schema";
import type { EnvAuth } from "./auth";

type Accion = "ver" | "listar" | "crear" | "editar" | "eliminar" | "exportar";

const ACCION_POR_METODO: Record<string, Accion> = {
  GET: "listar",
  POST: "crear",
  PUT: "editar",
  PATCH: "editar",
  DELETE: "eliminar",
};

// Middleware de auditoría: registra toda acción sobre una entidad.
// Regla HCEN: cada acceso o modificación queda asentado, no negociable.
export const auditar = (entidad: string) =>
  createMiddleware<EnvAuth>(async (c, next) => {
    await next();
    if (c.error || c.res.status >= 400) return; // solo acciones exitosas

    const usuario = c.get("usuario");
    if (!usuario) return;

    const metodo = c.req.method;
    const accion: Accion = ACCION_POR_METODO[metodo] ?? "ver";
    // GET con id en el path es "ver" un recurso puntual.
    const idUrl = c.req.path.split("/").pop();
    const id = Number(idUrl);
    const entidadId = metodo === "GET" && Number.isInteger(id) && id > 0 ? id : Number(c.get("entidadId") ?? 0) || null;

    try {
      await db.insert(auditoria).values({
        usuarioId: usuario.sub,
        accion,
        entidadAfectada: entidad,
        entidadId,
      });
    } catch {
      // La auditoría no debe tumbar la request; pero se pierde constancia.
      console.error("auditoria: fallo al registrar acción");
    }
  });
