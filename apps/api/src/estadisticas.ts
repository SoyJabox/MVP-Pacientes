import { Hono } from "hono";
import { and, count, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "./db/client";
import { pacientes, citas, consultas, usuarios } from "./db/schema";
import { requiereRol, type EnvAuth } from "./auth";

// Métricas del consultorio para el inicio. Solo roles clínicos: recepción no
// ve ni conteos de actividad clínica (mismo criterio que la historia).
const soloClinicos = requiereRol("admin", "profesional");

export const estadisticasRouter = new Hono<EnvAuth>();

estadisticasRouter.use("/estadisticas", soloClinicos);

estadisticasRouter.get("/estadisticas", async (c) => {
  const ahora = new Date();
  const manana = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
  const en7dias = new Date(ahora.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [[totalPacientes], [citasHoy], [proximas], cie10, consultasPorProfesional] = await Promise.all([
    db.select({ n: count() }).from(pacientes).where(eq(pacientes.activo, true)),
    db
      .select({ n: count() })
      .from(citas)
      .where(and(eq(citas.estado, "agendada"), gte(citas.fechaHora, ahora), lte(citas.fechaHora, manana))),
    db
      .select({ n: count() })
      .from(citas)
      .where(and(eq(citas.estado, "agendada"), gte(citas.fechaHora, ahora), lte(citas.fechaHora, en7dias))),
    db
      .select({ cie10: consultas.diagnosticoCie10, n: count() })
      .from(consultas)
      .where(sql`${consultas.diagnosticoCie10} <> ''`)
      .groupBy(consultas.diagnosticoCie10)
      .orderBy(sql`count(*) DESC`)
      .limit(5),
    db
      .select({
        email: usuarios.email,
        nombre: usuarios.nombre,
        n: count(),
      })
      .from(consultas)
      .innerJoin(usuarios, eq(consultas.profesionalId, usuarios.id))
      .groupBy(usuarios.email, usuarios.nombre)
      .orderBy(sql`count(*) DESC`)
      .limit(5),
  ]);

  return c.json({
    totalPacientes: totalPacientes.n,
    citasProximas24h: citasHoy.n,
    citasProximas7dias: proximas.n,
    cie10Frecuentes: cie10,
    consultasPorProfesional: consultasPorProfesional.map((r) => ({
      profesional: r.nombre || r.email,
      n: r.n,
    })),
  });
});
