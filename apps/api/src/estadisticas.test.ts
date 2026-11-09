import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { usuarios, pacientes, consultas } from "./db/schema";
import { emitirJwt } from "./auth";
import { app } from "./index";

let ids: Record<"admin" | "profesional" | "recepcion", number>;
let pacienteId: number;

beforeAll(async () => {
  const crearUsuario = async (email: string, rol: "admin" | "profesional" | "recepcion") => {
    const [u] = await db.select().from(usuarios).where(eq(usuarios.email, email));
    if (u) return u.id;
    const [n] = await db
      .insert(usuarios)
      .values({ email, passwordHash: await Bun.password.hash("x12345"), rol })
      .returning({ id: usuarios.id });
    return n.id;
  };
  ids = {
    admin: await crearUsuario("est-admin@test.local", "admin"),
    profesional: await crearUsuario("est-prof@test.local", "profesional"),
    recepcion: await crearUsuario("est-recep@test.local", "recepcion"),
  };
  const [p] = await db
    .insert(pacientes)
    .values({ cedula: String(4_000_000 + Math.floor(Math.random() * 999_999)), nombre: "Paciente Estadisticas", fechaNacimiento: "1990-01-01" })
    .returning({ id: pacientes.id });
  pacienteId = p.id;
  // Asegurar al menos una consulta con CIE-10 para el ranking.
  await db.insert(consultas).values({ pacienteId, profesionalId: ids.profesional, motivo: "Control", diagnosticoCie10: "Z00.0" });
});

const headers = async (rol: keyof typeof ids) => ({
  Authorization: `Bearer ${await emitirJwt(ids[rol], rol)}`,
});

describe("Estadísticas", () => {
  test("profesional ve métricas con conteos y CIE-10 frecuentes", async () => {
    const res = await app.request("/estadisticas", { headers: await headers("profesional") });
    expect(res.status).toBe(200);
    const body = await res.json<{
      totalPacientes: number;
      citasProximas24h: number;
      citasProximas7dias: number;
      cie10Frecuentes: { cie10: string; n: number }[];
      consultasPorProfesional: { profesional: string; n: number }[];
    }>();
    expect(typeof body.totalPacientes).toBe("number");
    expect(body.totalPacientes).toBeGreaterThan(0);
    expect(body.cie10Frecuentes.some((c) => c.cie10 === "Z00.0")).toBe(true);
    expect(body.consultasPorProfesional.length).toBeGreaterThan(0);
  });

  test("admin también ve métricas; recepción recibe 403", async () => {
    expect((await app.request("/estadisticas", { headers: await headers("admin") })).status).toBe(200);
    expect((await app.request("/estadisticas", { headers: await headers("recepcion") })).status).toBe(403);
  });
});
