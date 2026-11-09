import { Hono } from "hono";
import { z } from "zod";
import DOMPurify from "isomorphic-dompurify";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "./db/client";
import { consultas, medicacion, pacientes, usuarios } from "./db/schema";
import { requiereRol, type EnvAuth } from "./auth";
import { auditar } from "./auditoria";
import { generarCdaNivel1 } from "./cda";

const consultaSchema = z.object({
  pacienteId: z.number().int().positive(),
  motivo: z
    .string()
    .trim()
    .transform((s) => DOMPurify.sanitize(s, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }))
    // Longitud post-sanitize, igual que en pacientes.
    .refine((s) => s.length >= 3 && s.length <= 500, "Motivo inválido"),
  evolucion: z
    .string()
    .trim()
    .max(5000)
    .default("")
    .transform((s) => DOMPurify.sanitize(s, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })),
  diagnosticoCie10: z
    .string()
    .trim()
    .regex(/^[A-Z]\d{2}(\.\d{1,2})?$/, "Formato CIE-10: A00, A00.1, B99.9…")
    .default(""),
});

const medicacionSchema = z.object({
  consultaId: z.number().int().positive(),
  medicamento: z.string().trim().transform((s) => DOMPurify.sanitize(s, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })).refine((s) => s.length >= 2 && s.length <= 200, "Medicamento inválido"),
  dosis: z.string().trim().transform((s) => DOMPurify.sanitize(s, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })).refine((s) => s.length >= 1 && s.length <= 200, "Dosis inválida"),
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
    .where(and(eq(pacientes.id, pacienteId), eq(pacientes.activo, true)));
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

  // Una sola query de medicación para todas las consultas (no N+1).
  const idsConsultas = filas.map((f) => f.id);
  const todasMeds = idsConsultas.length
    ? await db
        .select({
          consultaId: medicacion.consultaId,
          id: medicacion.id,
          medicamento: medicacion.medicamento,
          dosis: medicacion.dosis,
          duracion: medicacion.duracion,
          fechaInicio: medicacion.fechaInicio,
        })
        .from(medicacion)
        .where(inArray(medicacion.consultaId, idsConsultas))
    : [];
  const porConsulta = new Map<number, typeof todasMeds>();
  for (const m of todasMeds) {
    const lista = porConsulta.get(m.consultaId) ?? [];
    lista.push(m);
    porConsulta.set(m.consultaId, lista);
  }
  const conMedicacion = filas.map((consulta) => ({
    ...consulta,
    medicacion: porConsulta.get(consulta.id) ?? [],
  }));

  return c.json(conMedicacion);
});

// CDA R2 nivel 1 de una consulta (CMD mínimo HCEN).
consultasRouter.get("/consultas/:id{\\d+}/cda", async (c) => {
  const id = Number(c.req.param("id"));

  const [fila] = await db
    .select({
      id: consultas.id,
      fecha: consultas.fecha,
      motivo: consultas.motivo,
      evolucion: consultas.evolucion,
      diagnosticoCie10: consultas.diagnosticoCie10,
      pacienteNombre: pacientes.nombre,
      pacienteCedula: pacientes.cedula,
      pacienteNacimiento: pacientes.fechaNacimiento,
      profesionalId: usuarios.id,
      profesionalEmail: usuarios.email,
    })
    .from(consultas)
    .innerJoin(pacientes, eq(consultas.pacienteId, pacientes.id))
    .innerJoin(usuarios, eq(consultas.profesionalId, usuarios.id))
    .where(eq(consultas.id, id));

  if (!fila) return c.json({ error: "Consulta no encontrada" }, 404);

  const meds = await db
    .select({ medicamento: medicacion.medicamento, dosis: medicacion.dosis, duracion: medicacion.duracion })
    .from(medicacion)
    .where(eq(medicacion.consultaId, id));

  const xml = generarCdaNivel1({
    paciente: {
      nombre: fila.pacienteNombre,
      cedula: fila.pacienteCedula,
      fechaNacimiento: fila.pacienteNacimiento,
    },
    profesional: { nombre: fila.profesionalEmail, id: fila.profesionalId },
    consulta: {
      id: fila.id,
      fecha: fila.fecha,
      motivo: fila.motivo,
      evolucion: fila.evolucion,
      diagnosticoCie10: fila.diagnosticoCie10,
    },
    medicacion: meds,
  });

  c.set("entidadId", id);
  c.set("accion", "exportar");
  return c.body(xml, 200, {
    "Content-Type": "application/xml; charset=utf-8",
    "Content-Disposition": `inline; filename="cda-consulta-${id}.xml"`,
  });
});

consultasRouter.post("/consultas", async (c) => {
  const parsed = consultaSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Datos inválidos", detalles: parsed.error.flatten() }, 400);

  const { pacienteId, motivo, evolucion, diagnosticoCie10 } = parsed.data;

  const [paciente] = await db.select({ id: pacientes.id }).from(pacientes).where(and(eq(pacientes.id, pacienteId), eq(pacientes.activo, true)));
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
