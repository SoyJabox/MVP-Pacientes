import { describe, test, expect, beforeAll } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "./db/client";
import { usuarios, pacientes, auditoria } from "./db/schema";
import { emitirJwt } from "./auth";
import { app } from "./index";

let profesionalId: number;
let recepcionId: number;
let pacienteId: number;

beforeAll(async () => {
  const crearUsuario = async (email: string, rol: "profesional" | "recepcion") => {
    const [u] = await db.select().from(usuarios).where(eq(usuarios.email, email));
    if (u) return u.id;
    const [nuevo] = await db
      .insert(usuarios)
      .values({ email, passwordHash: await Bun.password.hash("x12345"), rol })
      .returning({ id: usuarios.id });
    return nuevo.id;
  };
  profesionalId = await crearUsuario("prof-consultas@test.local", "profesional");
  recepcionId = await crearUsuario("recep-consultas@test.local", "recepcion");

  const cedula = String(9_000_000 + Math.floor(Math.random() * 999_999));
  const [pac] = await db
    .insert(pacientes)
    .values({ cedula, nombre: "Paciente Consultas Test", fechaNacimiento: "1970-01-01" })
    .returning({ id: pacientes.id });
  pacienteId = pac.id;
});

const headers = async (userId: number, rol: string) => ({
  Authorization: `Bearer ${await emitirJwt(userId, rol as "profesional")}`,
  "Content-Type": "application/json",
});

describe("Consultas y medicación", () => {
  test("profesional crea consulta con CIE-10", async () => {
    const h = await headers(profesionalId, "profesional");
    const res = await app.request("/consultas", {
      method: "POST",
      headers: h,
      body: JSON.stringify({
        pacienteId,
        motivo: "Dolor lumbar",
        evolucion: "Dolor mecánico, sin irradiación.",
        diagnosticoCie10: "M54.5",
      }),
    });
    expect(res.status).toBe(201);
    const { id } = await res.json<{ id: number }>();

    const historia = await app.request(`/consultas/paciente/${pacienteId}`, { headers: h });
    const filas = await historia.json<{ id: number; diagnosticoCie10: string; medicacion: unknown[] }[]>();
    const consulta = filas.find((f) => f.id === id);
    expect(consulta?.diagnosticoCie10).toBe("M54.5");
    expect(consulta?.medicacion).toEqual([]);
  });

  test("CIE-10 inválido devuelve 400", async () => {
    const h = await headers(profesionalId, "profesional");
    const res = await app.request("/consultas", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ pacienteId, motivo: "Control", diagnosticoCie10: "XX99" }),
    });
    expect(res.status).toBe(400);
  });

  test("profesional prescribe medicación y aparece en la historia", async () => {
    const h = await headers(profesionalId, "profesional");
    const creada = await app.request("/consultas", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ pacienteId, motivo: "Infección respiratoria", diagnosticoCie10: "J06.9" }),
    });
    const { id } = await creada.json<{ id: number }>();

    const res = await app.request("/medicacion", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ consultaId: id, medicamento: "Amoxicilina 500mg", dosis: "1 cápsula cada 8h", duracion: "7 días" }),
    });
    expect(res.status).toBe(201);

    const historia = await app.request(`/consultas/paciente/${pacienteId}`, { headers: h });
    const filas = await historia.json<{ id: number; medicacion: { medicamento: string }[] }[]>();
    const consulta = filas.find((f) => f.id === id);
    expect(consulta?.medicacion[0]?.medicamento).toBe("Amoxicilina 500mg");
  });

  test("RECEPCIÓN bloqueada en consultas (403): datos clínicos protegidos", async () => {
    const h = await headers(recepcionId, "recepcion");
    const res = await app.request(`/consultas/paciente/${pacienteId}`, { headers: h });
    expect(res.status).toBe(403);
  });

  test("RECEPCIÓN bloqueada en medicación (403)", async () => {
    const h = await headers(recepcionId, "recepcion");
    const res = await app.request("/medicacion", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ consultaId: 1, medicamento: "X", dosis: "1" }),
    });
    expect(res.status).toBe(403);
  });

  test("RECEPCIÓN tampoco puede crear consultas", async () => {
    const h = await headers(recepcionId, "recepcion");
    const res = await app.request("/consultas", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ pacienteId, motivo: "intento" }),
    });
    expect(res.status).toBe(403);
  });
});

describe("Paciente dado de baja", () => {
  test("crear consulta y ver historia de un dado de baja devuelve 404", async () => {
    const h = await headers(profesionalId, "profesional");
    const cedula = String(5_000_000 + Math.floor(Math.random() * 999_999));
    const [baja] = await db.insert(pacientes).values({ cedula, nombre: "Paciente Baja Consultas", fechaNacimiento: "1970-01-01", activo: false }).returning({ id: pacientes.id });

    const crear = await app.request("/consultas", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ pacienteId: baja.id, motivo: "No debería entrar" }),
    });
    expect(crear.status).toBe(404);

    const historia = await app.request(`/consultas/paciente/${baja.id}`, { headers: h });
    expect(historia.status).toBe(404);
  });
});

describe("Auditoría de exportación", () => {
  test("generar CDA deja accion 'exportar' en auditoría", async () => {
    const h = await headers(profesionalId, "profesional");
    // Crear una consulta propia para no depender de otros tests.
    const creada = await app.request("/consultas", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ pacienteId, motivo: "Para exportar" }),
    });
    const { id: consultaId } = await creada.json<{ id: number }>();
    await app.request(`/consultas/${consultaId}/cda`, { headers: h });

    const [reg] = await db
      .select()
      .from(auditoria)
      .where(
        and(
          eq(auditoria.entidadAfectada, "consultas"),
          eq(auditoria.accion, "exportar"),
          eq(auditoria.entidadId, consultaId),
        ),
      );
    expect(reg).toBeTruthy();
  });
});
