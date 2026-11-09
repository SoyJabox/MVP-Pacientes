import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { usuarios, pacientes } from "./db/schema";
import { emitirJwt } from "./auth";
import { app } from "./index";

// Matriz de control de acceso: qué rol puede qué.
// Si este test falla, hay datos clínicos expuestos. No lo relajes.

let ids: Record<"admin" | "profesional" | "recepcion", number> = { admin: 0, profesional: 0, recepcion: 0 };
let pacienteId: number;
let consultaId: number;

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
  ids.admin = await crear("mtx-admin@test.local", "admin");
  ids.profesional = await crear("mtx-prof@test.local", "profesional");
  ids.recepcion = await crear("mtx-recep@test.local", "recepcion");

  const cedula = String(2_000_000 + Math.floor(Math.random() * 799_999));
  const [p] = await db
    .insert(pacientes)
    .values({ cedula, nombre: "Paciente Matriz", fechaNacimiento: "1960-02-02" })
    .returning({ id: pacientes.id });
  pacienteId = p.id;

  const h = { Authorization: `Bearer ${await emitirJwt(ids.profesional, "profesional")}`, "Content-Type": "application/json" };
  const r = await app.request("/consultas", {
    method: "POST",
    headers: h,
    body: JSON.stringify({ pacienteId, motivo: "Matriz" }),
  });
  consultaId = (await r.json<{ id: number }>()).id;
});

const tok = async (rol: keyof typeof ids) => ({
  Authorization: `Bearer ${await emitirJwt(ids[rol], rol)}`,
});

type Caso = {
  nombre: string;
  metodo: string;
  ruta: () => string;
  cuerpo?: unknown;
  permitido: (keyof typeof ids)[];
};

const casos: Caso[] = [
  { nombre: "listar pacientes", metodo: "GET", ruta: () => "/pacientes", permitido: ["admin", "profesional", "recepcion"] },
  { nombre: "crear paciente", metodo: "POST", ruta: () => "/pacientes", cuerpo: { cedula: "99999999", nombre: "Temp", fechaNacimiento: "2000-01-01" }, permitido: ["admin", "profesional", "recepcion"] },
  { nombre: "listar citas", metodo: "GET", ruta: () => `/citas?profesionalId=${ids.profesional}`, permitido: ["admin", "profesional", "recepcion"] },
  { nombre: "listar profesionales", metodo: "GET", ruta: () => "/profesionales", permitido: ["admin", "profesional", "recepcion"] },
  { nombre: "ver historia clínica", metodo: "GET", ruta: () => `/consultas/paciente/${pacienteId}`, permitido: ["admin", "profesional"] },
  { nombre: "crear consulta", metodo: "POST", ruta: () => "/consultas", cuerpo: { pacienteId: 0, motivo: "x" }, permitido: ["admin", "profesional"] },
  { nombre: "prescribir medicación", metodo: "POST", ruta: () => "/medicacion", cuerpo: { consultaId: 0, medicamento: "x", dosis: "1" }, permitido: ["admin", "profesional"] },
  { nombre: "generar CDA", metodo: "GET", ruta: () => `/consultas/${consultaId}/cda`, permitido: ["admin", "profesional"] },
  { nombre: "listar documentos", metodo: "GET", ruta: () => `/documentos/paciente/${pacienteId}`, permitido: ["admin", "profesional"] },
  { nombre: "descargar documento", metodo: "GET", ruta: () => "/documentos/1/archivo", permitido: ["admin", "profesional"] },
  { nombre: "cambiar estado de cita", metodo: "PATCH", ruta: () => `/citas/1`, cuerpo: { estado: "atendida" }, permitido: ["admin", "profesional"] },
  { nombre: "cancelar cita (DELETE)", metodo: "DELETE", ruta: () => `/citas/1`, permitido: ["admin", "profesional"] },
];

describe("Matriz RBAC: rol × endpoint", () => {
  for (const caso of casos) {
    for (const rol of ["admin", "profesional", "recepcion"] as const) {
      const debePasar = caso.permitido.includes(rol);
      test(`${rol} ${debePasar ? "PUEDE" : "NO PUEDE"} ${caso.nombre}`, async () => {
        const headers = await tok(rol);
        const res = await app.request(caso.ruta(), {
          method: caso.metodo,
          headers: { ...headers, "Content-Type": "application/json" },
          body: caso.cuerpo ? JSON.stringify(caso.cuerpo) : undefined,
        });
        if (debePasar) {
          // No exigimos 2xx (puede ser 400/404 por datos), pero nunca 401/403.
          expect([401, 403]).not.toContain(res.status);
        } else {
          expect(res.status).toBe(403);
        }
      });
    }
  }

  test("sin token: todo lo no público es 401", async () => {
    for (const caso of casos) {
      const res = await app.request(caso.ruta(), { method: caso.metodo });
      expect(res.status).toBe(401);
    }
  });
});