import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "./db/client";
import { consultas, medicacion, pacientes, usuarios } from "./db/schema";
import { requiereRol, type EnvAuth } from "./auth";
import { auditar } from "./auditoria";

const consultaSchema = z.object({
  pacienteId: z.number().int().positive(),
  motivo: z.string().trim().min(3).max(500),
  evolucion: z.string().trim().max(5000).default(""),
  diagnosticoCie10: z
    .string()
    .trim()
    .regex(/^[A-Z]\d{2}(\.\d{1,2})?$/, "Formato CIE-10: A00, A00.1, B99.9…")
    .default(""),
});

const medicacionSchema = z.object({
  consultaId: z.number().int().positive(),
  medicamento: z.string().trim().min(2).max(200),
  dosis: z.string().trim().min(1).max(200),
  duracion: z.string().trim().max(100).default(""),
});

export const consultasRouter = new Hono<EnvAuth>();

// RBAC: recepción NO accede a datos clínicos. Solo admin y profesional.
const soloClinicos = requiereRol("admin", "profesional");

consultasRouter.use("/consultas", soloClinicos);
consultasRouter.use("/consultas/*", soloClinicos);
consultasRouter.use("/consultas", auditar("consultas"));
consultasRouter.use("/consultas/*", auditar("consultas"));
consultasRouter.use("/medicacion", soloClinicos);
consultasRouter.use("/medicacion/*", soloClinicos);
consultasRouter.use("/medicacion", auditar("medicacion"));
consultasRouter.use("/medicacion/*", auditar("medicacion"));

// Historia clínica: todas las consultas de un paciente, con su medicación.
consultasRouter.get("/consultas/paciente/:pacienteId{\\d+}", async (c) => {
  const pacienteId = Number(c.req.param("pacienteId"));

  const [paciente] = await db
    .select({ id: pacientes.id })
    .from(pacientes)
    .where(eq(pacientes.id, pacienteId));
  if (!paciente) return c.json({ error: "Paciente no encontrado" }, 404);

  const filas = await db
    .select({
      id: consultas.id,
      fecha: consultas.fecha,
      motivo: consultas.motivo,
      evolucion: consultas.evolucion,
      diagnosticoCie10: consultas.diagnosticoCie10,
      profesional: usuarios.email,
    })
    .from(consultas)
    .innerJoin(usuarios, eq(consultas.profesionalId, usuarios.id))
    .where(eq(consultas.pacienteId, pacienteId))
    .orderBy(desc(consultas.fecha));

  const conMedicacion = await Promise.all(
    filas.map(async (consulta) => ({
      ...consulta,
      medicacion: await db
        .select({
          id: medicacion.id,
          medicamento: medicacion.medicamento,
          dosis: medicacion.dosis,
          duracion: medicacion.duracion,
          fechaInicio: medicacion.fechaInicio,
        })
        .from(medicacion)
        .where(eq(medicacion.consultaId, consulta.id)),
    })),
  );

  return c.json(conMedicacion);
});

consultasRouter.post("/consultas", async (c) => {
  const parsed = consultaSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Datos inválidos", detalles: parsed.error.flatten() }, 400);

  const { pacienteId, motivo, evolucion, diagnosticoCie10 } = parsed.data;

  const [paciente] = await db.select({ id: pacientes.id }).from(pacientes).where(eq(pacientes.id, pacienteId));
  if (!paciente) return c.json({ error: "Paciente no encontrado" }, 404);

  const usuario = c.get("usuario");
  const [nueva] = await db
    .insert(consultas)
    .values({
      pacienteId,
      profesionalId: usuario.sub, // la consulta la firma quien la registra
      motivo,
      evolucion: evolucion ?? "",
      diagnosticoCie10: diagnosticoCie10 ?? "",
    })
    .returning({ id: consultas.id });

  c.set("entidadId", nueva.id);
  return c.json(nueva, 201);
});

consultasRouter.post("/medicacion", async (c) => {
  const parsed = medicacionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Datos inválidos", detalles: parsed.error.flatten() }, 400);

  const { consultaId, medicamento, dosis, duracion } = parsed.data;

  const [consulta] = await db
    .select({ id: consultas.id, pacienteId: consultas.pacienteId })
    .from(consultas)
    .where(eq(consultas.id, consultaId));
  if (!consulta) return c.json({ error: "Consulta no encontrada" }, 404);

  const [nueva] = await db
    .insert(medicacion)
    .values({ consultaId, pacienteId: consulta.pacienteId, medicamento, dosis, duracion: duracion ?? "" })
    .returning({ id: medicacion.id });

  c.set("entidadId", nueva.id);
  return c.json(nueva, 201);
});
