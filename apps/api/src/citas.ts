import { Hono } from "hono";
import { z } from "zod";
import { and, eq, between } from "drizzle-orm";
import { db } from "./db/client";
import { citas, pacientes, usuarios } from "./db/schema";
import type { EnvAuth } from "./auth";
import { auditar } from "./auditoria";

const crearCitaSchema = z.object({
  pacienteId: z.number().int().positive(),
  profesionalId: z.number().int().positive(),
  fechaHora: z.string().datetime(),
});

export const citasRouter = new Hono<EnvAuth>();

citasRouter.use("/citas", auditar("citas"));
citasRouter.use("/citas/*", auditar("citas"));

// Listar citas de un profesional en un rango de fecha (vista diaria/semanal).
citasRouter.get("/citas", async (c) => {
  const profesionalId = Number(c.req.query("profesionalId"));
  const desde = c.req.query("desde"); // ISO date o datetime
  const hasta = c.req.query("hasta");

  if (!profesionalId) return c.json({ error: "profesionalId requerido" }, 400);

  // Parsear fechas en UTC para evitar problemas de zona horaria.
  const desdeDate = desde ? new Date(desde + (desde.length === 10 ? "T00:00:00Z" : "")) : new Date();
  desdeDate.setUTCHours(0, 0, 0, 0);
  const hastaDate = hasta ? new Date(hasta + (hasta.length === 10 ? "T23:59:59.999Z" : "")) : new Date(desdeDate);
  hastaDate.setUTCHours(23, 59, 59, 999);

  const filas = await db
    .select({
      id: citas.id,
      pacienteId: citas.pacienteId,
      profesionalId: citas.profesionalId,
      fechaHora: citas.fechaHora,
      estado: citas.estado,
      pacienteNombre: pacientes.nombre,
      pacienteCedula: pacientes.cedula,
    })
    .from(citas)
    .innerJoin(pacientes, eq(citas.pacienteId, pacientes.id))
    .where(
      and(
        eq(citas.profesionalId, profesionalId),
        between(citas.fechaHora, desdeDate, hastaDate),
      ),
    )
    .orderBy(citas.fechaHora);

  return c.json(filas);
});

citasRouter.post("/citas", async (c) => {
  const parsed = crearCitaSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Datos inválidos", detalles: parsed.error.flatten() }, 400);

  const { pacienteId, profesionalId, fechaHora } = parsed.data;

  // Validar que el paciente y profesional existen.
  const [paciente] = await db.select({ id: pacientes.id }).from(pacientes).where(eq(pacientes.id, pacienteId));
  if (!paciente) return c.json({ error: "Paciente no encontrado" }, 404);

  const [profesional] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.id, profesionalId));
  if (!profesional) return c.json({ error: "Profesional no encontrado" }, 404);

  // Chequear choque de horario: misma fecha-hora para el mismo profesional.
  const fecha = new Date(fechaHora);
  const [choque] = await db
    .select({ id: citas.id })
    .from(citas)
    .where(
      and(
        eq(citas.profesionalId, profesionalId),
        eq(citas.fechaHora, fecha),
        eq(citas.estado, "agendada"),
      ),
    );
  if (choque) return c.json({ error: "Ya existe una cita en ese horario para este profesional" }, 409);

  const [nueva] = await db
    .insert(citas)
    .values({ pacienteId, profesionalId, fechaHora: fecha })
    .returning({ id: citas.id });

  c.set("entidadId", nueva.id);
  return c.json(nueva, 201);
});

// Cancelar cita: cambia estado a "cancelada" (no se borra).
citasRouter.delete("/citas/:id{\\d+}", async (c) => {
  const id = Number(c.req.param("id"));
  const [cancelada] = await db
    .update(citas)
    .set({ estado: "cancelada" })
    .where(eq(citas.id, id))
    .returning({ id: citas.id });
  if (!cancelada) return c.json({ error: "Cita no encontrada" }, 404);

  c.set("entidadId", id);
  return c.json({ ok: true });
});
