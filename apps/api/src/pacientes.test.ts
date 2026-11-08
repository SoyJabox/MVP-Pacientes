import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { usuarios, auditoria, pacientes } from "./db/schema";
import { emitirJwt } from "./auth";
import { app } from "./index";

const ADMIN_EMAIL = "admin@test.local";
const cedula = () => String(7_000_000 + Math.floor(Math.random() * 999_999)); // 7 dígitos únicos por corrida

beforeAll(async () => {
  const [u] = await db.select().from(usuarios).where(eq(usuarios.email, ADMIN_EMAIL));
  if (!u) {
    await db.insert(usuarios).values({
      email: ADMIN_EMAIL,
      passwordHash: await Bun.password.hash("admin123"),
      rol: "admin",
    });
  }
});

// Helper: token real contra el usuario admin de la BD.
async function token(): Promise<string> {
  const [u] = await db.select().from(usuarios).where(eq(usuarios.email, ADMIN_EMAIL));
  return emitirJwt(u!.id, u!.rol as "admin");
}

const cuerpo = () => ({
  cedula: cedula(),
  nombre: `Test Paciente ${Math.floor(Math.random() * 1000)}`,
  fechaNacimiento: "1990-05-10",
  contacto: "099 000 000",
  consentimientoFirmado: true,
});

describe("CRUD pacientes", () => {
  test("POST crea paciente y escribe auditoría", async () => {
    const t = await token();
    const c = cuerpo();
    const res = await app.request("/pacientes", {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify(c),
    });
    expect(res.status).toBe(201);
    const { id } = await res.json<{ id: number }>();

    const [reg] = await db
      .select()
      .from(auditoria)
      .where(eq(auditoria.entidadId, id));
    expect(reg?.accion).toBe("crear");
    expect(reg?.entidadAfectada).toBe("pacientes");
  });

  test("POST con cédula inválida devuelve 400", async () => {
    const t = await token();
    const res = await app.request("/pacientes", {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...cuerpo(), cedula: "abc" }),
    });
    expect(res.status).toBe(400);
  });

  test("POST con cédula duplicada devuelve 409", async () => {
    const t = await token();
    const c = cuerpo();
    await app.request("/pacientes", {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify(c),
    });
    const res = await app.request("/pacientes", {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify(c),
    });
    expect(res.status).toBe(409);
  });

  test("GET ?q= busca por nombre y por cédula", async () => {
    const t = await token();
    const c = cuerpo();
    const creada = await app.request("/pacientes", {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify(c),
    });
    const { id } = await creada.json<{ id: number }>();

    for (const q of [c.nombre, c.cedula]) {
      const res = await app.request(`/pacientes?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      const filas = (await res.json()) as { id: number }[];
      expect(filas.some((f) => f.id === id)).toBe(true);
    }
  });

  test("PUT edita y DELETE da de baja (soft delete)", async () => {
    const t = await token();
    const c = cuerpo();
    const creada = await app.request("/pacientes", {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify(c),
    });
    const { id } = await creada.json<{ id: number }>();

    const put = await app.request(`/pacientes/${id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify({ contacto: "nuevo contacto" }),
    });
    expect(put.status).toBe(200);

    const del = await app.request(`/pacientes/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${t}` },
    });
    expect(del.status).toBe(200);

    const [fila] = await db.select().from(pacientes).where(eq(pacientes.id, id));
    expect(fila?.activo).toBe(false);
  });

  test("401 sin token", async () => {
    const res = await app.request("/pacientes");
    expect(res.status).toBe(401);
  });
});
