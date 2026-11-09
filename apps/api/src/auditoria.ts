import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { and, desc, eq } from "drizzle-orm";
import { db } from "./db/client";
import { auditoria, usuarios } from "./db/schema";
import { requiereRol, type EnvAuth } from "./auth";

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
    // GET con id en el path es "ver" un recurso puntual (acceso a la ficha).
    const idUrl = c.req.path.split("/").pop();
    const id = Number(idUrl);
    const esVerPuntual = metodo === "GET" && Number.isInteger(id) && id > 0;
    // La acción explícita del handler gana sobre la deducida del método.
    const accion: Accion = c.get("accion") ?? (esVerPuntual ? "ver" : ACCION_POR_METODO[metodo] ?? "ver");
    const entidadId = esVerPuntual ? id : Number(c.get("entidadId") ?? 0) || null;

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

// Consulta de la auditoría: solo el admin. Un registro que nadie puede leer no
// sirve como constancia (HCEN): acá se consulta por entidad o por usuario.
export const auditoriaRouter = new Hono<EnvAuth>();

auditoriaRouter.use("/auditoria", requiereRol("admin"));
// Consultar la auditoría también queda asentado: es un acceso sensible.
auditoriaRouter.use("/auditoria", auditar("auditoria"));

auditoriaRouter.get("/auditoria", async (c) => {
  const entidad = c.req.query("entidad")?.trim() || null;
  const entidadId = Number(c.req.query("entidadId")) || null;
  const usuarioId = Number(c.req.query("usuarioId")) || null;
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 100, 1), 500);

  const filas = await db
    .select({
      id: auditoria.id,
      timestamp: auditoria.timestamp,
      accion: auditoria.accion,
      entidadAfectada: auditoria.entidadAfectada,
      entidadId: auditoria.entidadId,
      usuario: usuarios.nombre,
      usuarioEmail: usuarios.email,
    })
    .from(auditoria)
    .leftJoin(usuarios, eq(auditoria.usuarioId, usuarios.id))
    .where(
      and(
        entidad ? eq(auditoria.entidadAfectada, entidad) : undefined,
        entidadId ? eq(auditoria.entidadId, entidadId) : undefined,
        usuarioId ? eq(auditoria.usuarioId, usuarioId) : undefined,
      ),
    )
    .orderBy(desc(auditoria.timestamp))
    .limit(limit);

  // Si el usuario ya no existe (o no tiene nombre), se muestra el email.
  return c.json(filas.map((f) => ({ ...f, usuario: f.usuario || f.usuarioEmail || "—" })));
});
