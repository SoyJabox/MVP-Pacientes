import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { db } from "./db/client";
import { documentos, pacientes } from "./db/schema";
import { requiereRol, type EnvAuth } from "./auth";
import { auditar } from "./auditoria";

// Documentos clínicos: mismo nivel de acceso que la historia clínica.
const soloClinicos = requiereRol("admin", "profesional");

// Almacenamiento fuera del repo, permisos 0600 (los documentos son datos de salud).
const DIR_DOCS = process.env.DOCS_DIR ?? join(process.cwd(), "data", "documentos");

// Solo formatos que el sistema puede mostrar al profesional.
const MIMES_PERMITIDOS = new Set(["application/pdf", "image/png", "image/jpeg"]);
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export const documentosRouter = new Hono<EnvAuth>();

documentosRouter.use("/documentos", soloClinicos);
documentosRouter.use("/documentos/*", soloClinicos);
documentosRouter.use("/documentos", auditar("documentos"));
documentosRouter.use("/documentos/*", auditar("documentos"));

async function asegurarDir() {
  await mkdir(DIR_DOCS, { recursive: true, mode: 0o700 });
}

documentosRouter.get("/documentos/paciente/:pacienteId{\\d+}", async (c) => {
  const pacienteId = Number(c.req.param("pacienteId"));
  const filas = await db
    .select({
      id: documentos.id,
      nombreArchivo: documentos.nombreArchivo,
      fechaSubida: documentos.fechaSubida,
    })
    .from(documentos)
    .where(eq(documentos.pacienteId, pacienteId))
    .orderBy(documentos.fechaSubida);
  return c.json(filas);
});

documentosRouter.post("/documentos", async (c) => {
  const body = await c.req.parseBody().catch(() => null);
  const archivo = body?.archivo;
  const pacienteId = Number(body?.pacienteId);

  if (!(archivo instanceof File)) return c.json({ error: "Falta el archivo" }, 400);
  if (!Number.isInteger(pacienteId) || pacienteId <= 0) return c.json({ error: "pacienteId inválido" }, 400);

  // Validar tipo y tamaño antes de tocar disco.
  if (!MIMES_PERMITIDOS.has(archivo.type)) {
    return c.json({ error: "Formato no permitido. Solo PDF, PNG o JPG." }, 400);
  }
  if (archivo.size > MAX_BYTES) {
    return c.json({ error: "El archivo supera los 20 MB." }, 400);
  }

  const [paciente] = await db.select({ id: pacientes.id }).from(pacientes).where(eq(pacientes.id, pacienteId));
  if (!paciente) return c.json({ error: "Paciente no encontrado" }, 404);

  await asegurarDir();

  // Nombre aleatorio en disco: el nombre original no se usa como ruta.
  const ext = extname(archivo.name).toLowerCase().slice(0, 8);
  const nombreEnDisco = `${randomUUID()}${ext}`;
  const ruta = join(DIR_DOCS, nombreEnDisco);

  const bytes = new Uint8Array(await archivo.arrayBuffer());
  await writeFile(ruta, bytes, { mode: 0o600 });

  const [nuevo] = await db
    .insert(documentos)
    .values({ pacienteId, nombreArchivo: archivo.name.slice(0, 200), rutaAlmacenamiento: nombreEnDisco })
    .returning({ id: documentos.id });

  c.set("entidadId", nuevo.id);
  return c.json(nuevo, 201);
});

documentosRouter.get("/documentos/:id{\\d+}/archivo", async (c) => {
  const id = Number(c.req.param("id"));
  const [doc] = await db.select().from(documentos).where(eq(documentos.id, id));
  if (!doc) return c.json({ error: "Documento no encontrado" }, 404);

  const ruta = join(DIR_DOCS, doc.rutaAlmacenamiento);
  const bytes = await readFile(ruta).catch(() => null);
  if (!bytes) return c.json({ error: "Archivo no disponible en disco" }, 404);

  const ext = extname(doc.rutaAlmacenamiento).toLowerCase();
  const tipo = ext === ".pdf" ? "application/pdf" : ext === ".png" ? "image/png" : "image/jpeg";

  return c.body(new Uint8Array(bytes), 200, {
    "Content-Type": tipo,
    "Content-Disposition": `inline; filename="${doc.nombreArchivo.replace(/["\\]/g, "")}"`,
  });
});

documentosRouter.delete("/documentos/:id{\\d+}", async (c) => {
  const id = Number(c.req.param("id"));
  const [doc] = await db.select().from(documentos).where(eq(documentos.id, id));
  if (!doc) return c.json({ error: "Documento no encontrado" }, 404);

  // Primero la fila; si el borrado en disco falla, el registro ya no lo referencia.
  await db.delete(documentos).where(eq(documentos.id, id));
  await unlink(join(DIR_DOCS, doc.rutaAlmacenamiento)).catch(() => {});

  c.set("entidadId", id);
  return c.json({ ok: true });
});
