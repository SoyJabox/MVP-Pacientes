import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { usuarios } from "./db/schema";
import { emitirJwt, verificarJwt, requiereRol } from "./auth";
import { app } from "./index";

const ADMIN_EMAIL = "admin@test.local";

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

describe("auth", () => {
  test("login correcto devuelve token y rol", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: ADMIN_EMAIL, password: "admin123" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ token: string; usuario: { rol: string } }>();
    expect(body.usuario.rol).toBe("admin");
    expect(body.token).toContain(".");
  });

  test("login con contraseña incorrecta devuelve 401 genérico", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: ADMIN_EMAIL, password: "mala" }),
    });
    expect(res.status).toBe(401);
    expect((await res.json<{ error: string }>()).error).toBe("Credenciales inválidas");
  });

  test("usuario inexistente devuelve el mismo 401 (no filtra cuentas)", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "nadie@test.local", password: "x" }),
    });
    expect(res.status).toBe(401);
  });
});

describe("middleware", () => {
  test("/me sin token devuelve 401", async () => {
    const res = await app.request("/me");
    expect(res.status).toBe(401);
  });

  test("/me con token válido devuelve id y rol", async () => {
    const login = await app.request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: ADMIN_EMAIL, password: "admin123" }),
    });
    const { token } = await login.json<{ token: string }>();

    const res = await app.request("/me", { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const body = await res.json<{ id: number; rol: string }>();
    expect(body.rol).toBe("admin");
  });

  test("token firmado pasa por verificarJwt", async () => {
    const token = await emitirJwt(1, "profesional");
    const payload = await verificarJwt(token);
    expect(payload?.rol).toBe("profesional");
  });

  test("requiereRol bloquea a roles no autorizados con 403", async () => {
    const token = await emitirJwt(1, "recepcion");
    const middleware = requiereRol("admin", "profesional");
    const ctx = {
      get: () => ({ sub: 1, rol: "recepcion" }),
      json: (body: unknown, status: number) => ({ body, status }),
    };
    let paso = false;
    const next = () => {
      paso = true;
      return Promise.resolve();
    };
    // @ts-expect-error ctx parcial para el test
    const res = await middleware({ get: ctx.get, json: ctx.json, req: {} } as never, next);
    expect(paso).toBe(false);
    expect(res.status).toBe(403);
  });
});
