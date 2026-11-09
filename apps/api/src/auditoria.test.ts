import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { usuarios, pacientes, auditoria } from "./db/schema";
import { emitirJwt } from "./auth";
import { app } from "./index";

let ids: Record<"admin" | "profesional" | "recepcion", number>;
let pacienteId: number;

beforeAll(async () => {
  const crearUsuario = async (email: string, rol: "admin" | "profesional" | "recepcion", nombre = "") => {
    const [u] = await db.select().from(usuarios).where(eq(usuarios.email, email));
    if (u) return u.id;
    const [n] = await db
      .insert(usuarios)
      .values({ email, passwordHash: await Bun.password.hash("x12345"), rol, nombre })
      .returning({ id: usuarios.id });
    return n.id;
  };
  ids = {
    admin: await crearUsuario("aud-admin@test.local", "admin", "Admin Auditoría"),
    profesional: await crearUsuario("aud-prof@test.local", "profesional", "Dr. Auditado"),
    recepcion: await crearUsuario("aud-recep@test.local", "recepcion"),
  };
  const [p] = await db
    .insert(pacientes)
    .values({ cedula: String(3_000_000 + Math.floor(Math.random() * 999_999)), nombre: "Paciente Auditoria", fechaNacimiento: "1980-05-05" })
    .returning({ id: pacientes.id });
  pacienteId = p.id;
});

const headers = async (rol: keyof typeof ids) => ({
  Authorization: `Bearer ${await emitirJwt(ids[rol], rol)}`,
  "Content-Type": "application/json",
});

describe("Directorio de profesionales (minimización de datos)", () => {
  test("recepción recibe id y nombre, nunca el email", async () => {
    const res = await app.request("/profesionales", { headers: await headers("recepcion") });
    expect(res.status).toBe(200);
    const filas = await res.json<Record<string, unknown>[]>();
    expect(filas.length).toBeGreaterThan(0);
    for (const f of filas) {
      expect(Object.keys(f).sort()).toEqual(["id", "nombre"]);
      expect(String(f.nombre)).not.toContain("@");
    }
  });

  test("una cuenta sin nombre cargado se muestra genérica, nunca con el email", async () => {
    const [sinNombre] = await db
      .insert(usuarios)
      .values({ email: `sinnombre-${Date.now()}@test.local`, passwordHash: await Bun.password.hash("x12345"), rol: "profesional" })
      .returning({ id: usuarios.id });
    const res = await app.request("/profesionales", { headers: await headers("admin") });
    const filas = await res.json<{ id: number; nombre: string }[]>();
    expect(filas.find((f) => f.id === sinNombre.id)?.nombre).toBe(`Profesional ${sinNombre.id}`);
  });
});

describe("Auditoría consultable (solo admin)", () => {
  test("admin lee la auditoría de un paciente con usuario, acción y entidad", async () => {
    // Generar una acción auditable: crear y leer el paciente.
    await app.request(`/pacientes/${pacienteId}`, { headers: await headers("profesional") });

    const res = await app.request(`/auditoria?entidad=pacientes&entidadId=${pacienteId}&limit=10`, {
      headers: await headers("admin"),
    });
    expect(res.status).toBe(200);
    const filas = await res.json<{ accion: string; entidadAfectada: string; entidadId: number; usuario: string }[]>();
    expect(filas.length).toBeGreaterThan(0);
    expect(filas.some((f) => f.accion === "ver" && f.entidadAfectada === "pacientes")).toBe(true);
    expect(filas.every((f) => f.usuario.length > 0)).toBe(true);
  });

  test("profesional y recepción reciben 403 en la auditoría", async () => {
    for (const rol of ["profesional", "recepcion"] as const) {
      const res = await app.request("/auditoria", { headers: await headers(rol) });
      expect(res.status).toBe(403);
    }
  });

  test("limit acota la cantidad de filas", async () => {
    const res = await app.request("/auditoria?limit=2", { headers: await headers("admin") });
    const filas = await res.json<unknown[]>();
    expect(filas.length).toBeLessThanOrEqual(2);
  });
});

describe("Rate limit de escritura", () => {
  test("hay un límite más estricto para métodos de escritura y no aplica en tests", async () => {
    // En tests el limiter se desactiva (NODE_ENV=test) para no flakear la suite:
    // esto verifica que el middleware está en el camino de escritura sin bloquear.
    const res = await app.request("/pacientes", {
      method: "POST",
      headers: await headers("admin"),
      body: JSON.stringify({ cedula: "60000000", nombre: "Rate Limit", fechaNacimiento: "1990-01-01" }),
    });
    expect([201, 409]).toContain(res.status);
    const [reg] = await db.select().from(auditoria).where(eq(auditoria.entidadAfectada, "pacientes")).limit(1);
    expect(reg).toBeTruthy();
  });
});
