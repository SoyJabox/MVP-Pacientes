import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { usuarios, pacientes } from "./db/schema";
import { emitirJwt } from "./auth";
import { app } from "./index";

let profesionalId: number;
let pacienteId: number;

beforeAll(async () => {
  // Crear profesional si no existe.
  const [prof] = await db.select().from(usuarios).where(eq(usuarios.email, "prof@test.local"));
  if (!prof) {
    const [nuevo] = await db
      .insert(usuarios)
      .values({
        email: "prof@test.local",
        passwordHash: await Bun.password.hash("prof123"),
        rol: "profesional",
      })
      .returning({ id: usuarios.id });
    profesionalId = nuevo.id;
  } else {
    profesionalId = prof.id;
  }

  // Crear paciente de prueba.
  const cedula = String(8_000_000 + Math.floor(Math.random() * 999_999));
  const [pac] = await db
    .insert(pacientes)
    .values({
      cedula,
      nombre: "Paciente Citas Test",
      fechaNacimiento: "1985-03-15",
      contacto: "099 111 222",
    })
    .returning({ id: pacientes.id });
  pacienteId = pac.id;
});

const headers = async () => {
  const [u] = await db.select().from(usuarios).where(eq(usuarios.email, "prof@test.local"));
  const token = await emitirJwt(u!.id, u!.rol as "profesional");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
};

describe("CRUD citas", () => {
  test("POST crea cita y devuelve 201", async () => {
    const h = await headers();
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + 10); // día +10 para evitar choques con otras corridas
    fecha.setHours(10, 0, 0, Math.floor(Math.random() * 999)); // milisegundos únicos

    const res = await app.request("/citas", {
      method: "POST",
      headers: h,
      body: JSON.stringify({
        pacienteId,
        profesionalId,
        fechaHora: fecha.toISOString(),
      }),
    });
    expect(res.status).toBe(201);
    const { id } = await res.json<{ id: number }>();
    expect(id).toBeGreaterThan(0);
  });

  test("POST con choque de horario devuelve 409", async () => {
    const h = await headers();
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + 2);
    fecha.setHours(11, 0, 0, 0);

    // Crear primera cita.
    await app.request("/citas", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ pacienteId, profesionalId, fechaHora: fecha.toISOString() }),
    });

    // Intentar crear otra en el mismo horario.
    const res = await app.request("/citas", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ pacienteId, profesionalId, fechaHora: fecha.toISOString() }),
    });
    expect(res.status).toBe(409);
    const body = await res.json<{ error: string }>();
    expect(body.error).toContain("horario");
  });

  test("GET /citas lista por profesional y fecha", async () => {
    const h = await headers();
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + 3);
    fecha.setHours(14, 0, 0, 0);

    await app.request("/citas", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ pacienteId, profesionalId, fechaHora: fecha.toISOString() }),
    });

    const res = await app.request(
      `/citas?profesionalId=${profesionalId}&desde=${fecha.toISOString().split("T")[0]}`,
      { headers: h },
    );
    expect(res.status).toBe(200);
    const filas = await res.json<{ id: number; pacienteNombre: string }[]>();
    expect(filas.length).toBeGreaterThan(0);
    expect(filas[0].pacienteNombre).toBe("Paciente Citas Test");
  });

  test("DELETE cancela cita (cambia estado a cancelada)", async () => {
    const h = await headers();
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + 4);
    fecha.setHours(15, 0, 0, 0);

    const creada = await app.request("/citas", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ pacienteId, profesionalId, fechaHora: fecha.toISOString() }),
    });
    const { id } = await creada.json<{ id: number }>();

    const cancelada = await app.request(`/citas/${id}`, { method: "DELETE", headers: h });
    expect(cancelada.status).toBe(200);

    // Verificar que ya no aparece en la lista de agendadas.
    const lista = await app.request(
      `/citas?profesionalId=${profesionalId}&desde=${fecha.toISOString().split("T")[0]}`,
      { headers: h },
    );
    const filas = await lista.json<{ id: number; estado: string }[]>();
    const encontrada = filas.find((f) => f.id === id);
    expect(encontrada?.estado).toBe("cancelada");
  });

  test("POST con profesionalId de un usuario recepcion devuelve 400", async () => {
    const h = await headers();
    const [recep] = await db.select().from(usuarios).where(eq(usuarios.email, "recep-citas@test.local"));
    const recepId = recep?.id ?? (await db.insert(usuarios).values({ email: "recep-citas@test.local", passwordHash: await Bun.password.hash("x12345"), rol: "recepcion" }).returning({ id: usuarios.id }))[0].id;
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + 6);
    const res = await app.request("/citas", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ pacienteId, profesionalId: recepId, fechaHora: fecha.toISOString() }),
    });
    expect(res.status).toBe(400);
  });

  test("POST con paciente dado de baja devuelve 404", async () => {
    const h = await headers();
    const cedula = String(6_000_000 + Math.floor(Math.random() * 999_999));
    const [baja] = await db.insert(pacientes).values({ cedula, nombre: "Paciente Baja", fechaNacimiento: "1980-01-01", activo: false }).returning({ id: pacientes.id });
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + 7);
    const res = await app.request("/citas", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ pacienteId: baja.id, profesionalId, fechaHora: fecha.toISOString() }),
    });
    expect(res.status).toBe(404);
  });

  test("agenda: cita nocturna local (22:00 Uruguay) aparece en ese día", async () => {
    const h = await headers();
    // 22:00 en Uruguay (UTC-3) = 01:00Z del día siguiente. Fecha aleatoria:
    // la BD persiste entre corridas y una fecha fija chocaría consigo misma.
    const base = new Date();
    base.setDate(base.getDate() + 30 + Math.floor(Math.random() * 60));
    base.setUTCHours(1, 0, 0, Math.floor(Math.random() * 999));
    const diaLocal = new Date(base.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const creada = await app.request("/citas", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ pacienteId, profesionalId, fechaHora: base.toISOString() }),
    });
    expect(creada.status).toBe(201);
    const { id } = await creada.json<{ id: number }>();
    const lista = await app.request(`/citas?profesionalId=${profesionalId}&desde=${diaLocal}`, { headers: h });
    const filas = await lista.json<{ id: number }[]>();
    expect(filas.some((f) => f.id === id)).toBe(true);
  });

  test("POST con paciente inexistente devuelve 404", async () => {
    const h = await headers();
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + 5);

    const res = await app.request("/citas", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ pacienteId: 99999, profesionalId, fechaHora: fecha.toISOString() }),
    });
    expect(res.status).toBe(404);
  });
});

describe("Estado de cita", () => {
  test("agendada -> atendida, y atendida no se reabre", async () => {
    const h = await headers();
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + 12);
    fecha.setHours(16, 0, 0, Math.floor(Math.random() * 999));

    const creada = await app.request("/citas", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ pacienteId, profesionalId, fechaHora: fecha.toISOString() }),
    });
    const { id } = await creada.json<{ id: number }>();

    const ok = await app.request(`/citas/${id}`, {
      method: "PATCH",
      headers: h,
      body: JSON.stringify({ estado: "atendida" }),
    });
    expect(ok.status).toBe(200);

    const reabrir = await app.request(`/citas/${id}`, {
      method: "PATCH",
      headers: h,
      body: JSON.stringify({ estado: "agendada" }),
    });
    expect(reabrir.status).toBe(409);
  });

  test("estado inválido devuelve 400", async () => {
    const h = await headers();
    const res = await app.request("/citas/1", {
      method: "PATCH",
      headers: h,
      body: JSON.stringify({ estado: "inventado" }),
    });
    expect(res.status).toBe(400);
  });
});
