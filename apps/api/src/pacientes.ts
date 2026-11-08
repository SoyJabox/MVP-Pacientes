import { Hono } from "hono";
import { z } from "zod";
import { and, eq, ilike, or } from "drizzle-orm";
import { db } from "./db/client";
import { pacientes } from "./db/schema";
import type { EnvAuth } from "./auth";
import { auditar } from "./auditoria";

const pacienteSchema = z.object({
  cedula: z.string().trim().min(7).max(8).regex(/^\d{7,8}$/, "Cédula uruguaya: 7 u 8 dígitos"),
  nombre: z.string().trim().min(2).max(120),
  fechaNacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha ISO yyyy-mm-dd"),
  contacto: z.string().trim().max(200).default(""),
  consentimientoFirmado: z.boolean().default(false),
});

const pacienteActualizable = pacienteSchema.partial();

export const pacientesRouter = new Hono<EnvAuth>();

pacientesRouter.use("/pacientes", auditar("pacientes"));
pacientesRouter.use("/pacientes/*", auditar("pacientes"));

// Búsqueda por nombre o cédula (q). Solo pacientes activos.
pacientesRouter.get("/pacientes", async (c) => {
  const q = c.req.query("q")?.trim() ?? "";
  const base = db
    .select({
      id: pacientes.id,
      cedula: pacientes.cedula,
      nombre: pacientes.nombre,
      fechaNacimiento: pacientes.fechaNacimiento,
      contacto: pacientes.contacto,
      consentimientoFirmado: pacientes.consentimientoFirmado,
    })
    .from(pacientes);

  const filas = q
    ? await base
        .where(
          and(
            eq(pacientes.activo, true),
            or(ilike(pacientes.nombre, `%${q}%`), ilike(pacientes.cedula, `%${q}%`)),
          ),
        )
        .limit(100)
    : await base.where(eq(pacientes.activo, true)).limit(100);

  return c.json(filas);
});

pacientesRouter.get("/pacientes/:id{\\d+}", async (c) => {
  const id = Number(c.req.param("id"));
  const [fila] = await db
    .select()
    .from(pacientes)
    .where(and(eq(pacientes.id, id), eq(pacientes.activo, true)));
  if (!fila) return c.json({ error: "Paciente no encontrado" }, 404);
  return c.json(fila);
});

pacientesRouter.post("/pacientes", async (c) => {
  const parsed = pacienteSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Datos inválidos", detalles: parsed.error.flatten() }, 400);

  const datos = parsed.data;
  const [existente] = await db.select({ id: pacientes.id }).from(pacientes).where(eq(pacientes.cedula, datos.cedula));
  if (existente) return c.json({ error: "Ya existe un paciente con esa cédula" }, 409);

  const [nuevo] = await db
    .insert(pacientes)
    .values({
      cedula: datos.cedula,
      nombre: datos.nombre,
      fechaNacimiento: datos.fechaNacimiento,
      contacto: datos.contacto ?? "",
      consentimientoFirmado: datos.consentimientoFirmado ?? false,
    })
    .returning({ id: pacientes.id });

  c.set("entidadId", nuevo.id);
  return c.json(nuevo, 201);
});

pacientesRouter.put("/pacientes/:id{\\d+}", async (c) => {
  const id = Number(c.req.param("id"));
  const parsed = pacienteActualizable.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Datos inválidos", detalles: parsed.error.flatten() }, 400);

  const [actualizado] = await db
    .update(pacientes)
    .set(parsed.data)
    .where(eq(pacientes.id, id))
    .returning({ id: pacientes.id });
  if (!actualizado) return c.json({ error: "Paciente no encontrado" }, 404);

  c.set("entidadId", id);
  return c.json(actualizado);
});

// Baja lógica: nunca borrar historia clínica de verdad.
pacientesRouter.delete("/pacientes/:id{\\d+}", async (c) => {
  const id = Number(c.req.param("id"));
  const [dado] = await db
    .update(pacientes)
    .set({ activo: false })
    .where(eq(pacientes.id, id))
    .returning({ id: pacientes.id });
  if (!dado) return c.json({ error: "Paciente no encontrado" }, 404);

  c.set("entidadId", id);
  return c.json({ ok: true });
});
