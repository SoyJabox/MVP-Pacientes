import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { usuarios } from "./db/schema";
import { emitirJwt } from "./auth";
import { app } from "./index";

let ids: Record<"admin" | "profesional" | "recepcion", number>;

beforeAll(async () => {
  const crear = async (email: string, rol: "admin" | "profesional" | "recepcion") => {
    const [u] = await db.select().from(usuarios).where(eq(usuarios.email, email));
    if (u) return u.id;
    const [n] = await db
      .insert(usuarios)
      .values({ email, passwordHash: await Bun.password.hash("x12345"), rol })
      .returning({ id: usuarios.id });
    return n.id;
  };
  ids = {
    admin: await crear("usu-admin@test.local", "admin"),
    profesional: await crear("usu-prof@test.local", "profesional"),
    recepcion: await crear("usu-recep@test.local", "recepcion"),
  };
});

const headers = async (rol: keyof typeof ids) => ({
  Authorization: `Bearer ${await emitirJwt(ids[rol], rol)}`,
  "Content-Type": "application/json",
});

describe("Gestión de usuarios", () => {
  test("admin lista y crea usuarios; profesional/recepcion reciben 403", async () => {
    const lista = await app.request("/usuarios", { headers: await headers("admin") });
    expect(lista.status).toBe(200);
    expect(((await lista.json()) as unknown[]).length).toBeGreaterThan(0);

    for (const rol of ["profesional", "recepcion"] as const) {
      const prohibido = await app.request("/usuarios", { headers: await headers(rol) });
      expect(prohibido.status).toBe(403);
      const crearProhibido = await app.request("/usuarios", {
        method: "POST",
        headers: await headers(rol),
        body: JSON.stringify({ email: `no-${rol}@test.local`, password: "123456", rol: "recepcion" }),
      });
      expect(crearProhibido.status).toBe(403);
    }

    const creado = await app.request("/usuarios", {
      method: "POST",
      headers: await headers("admin"),
      body: JSON.stringify({ email: "nuevo-usu@test.local", password: "123456", rol: "profesional", nombre: "Dra. Prueba" }),
    });
    expect(creado.status).toBe(201);
    const body = await creado.json<{ nombre: string; rol: string }>();
    expect(body.nombre).toBe("Dra. Prueba");
    expect(body.rol).toBe("profesional");
  });

  test("email duplicado devuelve 409; email inválido devuelve 400", async () => {
    const dup = await app.request("/usuarios", {
      method: "POST",
      headers: await headers("admin"),
      body: JSON.stringify({ email: "usu-admin@test.local", password: "123456", rol: "recepcion" }),
    });
    expect(dup.status).toBe(409);

    const invalido = await app.request("/usuarios", {
      method: "POST",
      headers: await headers("admin"),
      body: JSON.stringify({ email: "no-es-email", password: "123", rol: "recepcion" }),
    });
    expect(invalido.status).toBe(400);
  });

  test("admin desactiva y reactiva un usuario (su token deja de funcionar)", async () => {
    const h = await headers("admin");
    const creado = await app.request("/usuarios", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ email: "temporal@test.local", password: "123456", rol: "profesional" }),
    });
    const { id } = await creado.json<{ id: number }>();

    const off = await app.request(`/usuarios/${id}`, { method: "PATCH", headers: h, body: JSON.stringify({ activo: false }) });
    expect(off.status).toBe(200);

    const token = await emitirJwt(id, "profesional");
    const trasBaja = await app.request("/pacientes", { headers: { Authorization: `Bearer ${token}` } });
    expect(trasBaja.status).toBe(401);

    const on = await app.request(`/usuarios/${id}`, { method: "PATCH", headers: h, body: JSON.stringify({ activo: true }) });
    expect(on.status).toBe(200);
    const trasAlta = await app.request("/pacientes", { headers: { Authorization: `Bearer ${token}` } });
    expect(trasAlta.status).toBe(200);
  });

  test("nadie puede desactivar su propia cuenta", async () => {
    const h = await headers("admin");
    const res = await app.request(`/usuarios/${ids.admin}`, { method: "PATCH", headers: h, body: JSON.stringify({ activo: false }) });
    expect(res.status).toBe(400);
  });
});
