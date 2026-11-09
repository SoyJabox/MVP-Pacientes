import { Hono } from "hono";
import { z } from "zod";
import { and, eq, between } from "drizzle-orm";
import { db } from "./db/client";
import { citas, pacientes, usuarios } from "./db/schema";
import type { EnvAuth } from "./auth";
import type { Rol } from "@gestor/shared";
import { requiereRol } from "./auth";
import { auditar } from "./auditoria";

// RBAC: recepción NO accede a datos clínicos. Solo admin y profesional.
const soloClinicos = requiereRol("admin", "profesional");

// Cada profesional ve y gestiona SOLO su agenda: "chusmear" la de otro no.
// Admin y recepción (cuyo trabajo es agendar) ven cualquier agenda.
const puedeAgendaDe = (usuario: { sub: number; rol: Rol }, profesionalId: number) =>
  usuario.rol !== "profesional" || usuario.sub === profesionalId;

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
  if (!puedeAgendaDe(c.get("usuario"), profesionalId)) {
    return c.json({ error: "Su rol no tiene acceso a este recurso" }, 403);
  }

  // La agenda es un día local de Uruguay (UTC-3 fijo, sin horario de verano desde 2018).
  // Un rango en UTC escondería las citas nocturnas del día siguiente.
  const OFFSET_URUGUAY_MS = 3 * 60 * 60 * 1000;
  const inicioDelDiaLocal = (f: string) => {
    const [y, m, d] = f.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 3, 0, 0, 0));
  };
  const hoyLocal = new Date(Date.now() - OFFSET_URUGUAY_MS).toISOString().slice(0, 10);
  const desdeDate = desde ? (desde.length === 10 ? inicioDelDiaLocal(desde) : new Date(desde)) : inicioDelDiaLocal(hoyLocal);
  const hastaDate = hasta
    ? hasta.length === 10
      ? new Date(inicioDelDiaLocal(hasta).getTime() + 24 * 60 * 60 * 1000 - 1)
      : new Date(hasta)
    : new Date(desdeDate.getTime() + 24 * 60 * 60 * 1000 - 1);

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

  if (!puedeAgendaDe(c.get("usuario"), profesionalId)) {
    return c.json({ error: "Su rol no tiene acceso a este recurso" }, 403);
  }

  // Validar que el paciente existe y no fue dado de baja.
  const [paciente] = await db.select({ id: pacientes.id }).from(pacientes).where(and(eq(pacientes.id, pacienteId), eq(pacientes.activo, true)));
  if (!paciente) return c.json({ error: "Paciente no encontrado" }, 404);

  // El profesional debe ser un usuario profesional activo (no cualquier usuario).
  const [profesional] = await db.select({ id: usuarios.id }).from(usuarios).where(and(eq(usuarios.id, profesionalId), eq(usuarios.rol, "profesional"), eq(usuarios.activo, true)));
  if (!profesional) return c.json({ error: "Profesional no válido" }, 400);

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

const estadoSchema = z.object({ estado: z.enum(["agendada", "atendida", "cancelada"]) });

// Cambiar estado: agendada -> atendida (el paciente vino) o cancelada.
// "atendida" es terminal: corregir una consulta se hace en la historia, no acá.
// RBAC: solo admin y profesional pueden cambiar el estado.
citasRouter.patch("/citas/:id{\\d+}", soloClinicos, async (c) => {
  const id = Number(c.req.param("id"));
  const parsed = estadoSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Estado inválido" }, 400);

  const [actual] = await db.select({ estado: citas.estado, profesionalId: citas.profesionalId }).from(citas).where(eq(citas.id, id));
  if (!actual) return c.json({ error: "Cita no encontrada" }, 404);
  if (!puedeAgendaDe(c.get("usuario"), actual.profesionalId)) {
    return c.json({ error: "Su rol no tiene acceso a este recurso" }, 403);
  }
  if (actual.estado === "atendida" && parsed.data.estado !== "atendida") {
    return c.json({ error: "Una cita atendida no se puede reabrir" }, 409);
  }

  const [fila] = await db
    .update(citas)
    .set({ estado: parsed.data.estado })
    .where(eq(citas.id, id))
    .returning({ id: citas.id, estado: citas.estado });

  c.set("entidadId", id);
  return c.json(fila);
});

// Cancelar cita: cambia estado a "cancelada" (no se borra).
// RBAC: solo admin y profesional (igual que cambiar estado por PATCH).
citasRouter.delete("/citas/:id{\\d+}", soloClinicos, async (c) => {
  const id = Number(c.req.param("id"));
  const [actual] = await db.select({ profesionalId: citas.profesionalId }).from(citas).where(eq(citas.id, id));
  if (!actual) return c.json({ error: "Cita no encontrada" }, 404);
  if (!puedeAgendaDe(c.get("usuario"), actual.profesionalId)) {
    return c.json({ error: "Su rol no tiene acceso a este recurso" }, 403);
  }
  const [cancelada] = await db
    .update(citas)
    .set({ estado: "cancelada" })
    .where(eq(citas.id, id))
    .returning({ id: citas.id });
  if (!cancelada) return c.json({ error: "Cita no encontrada" }, 404);

  c.set("entidadId", id);
  return c.json({ ok: true });
});
