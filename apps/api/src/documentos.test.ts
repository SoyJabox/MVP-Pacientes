import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { usuarios, pacientes } from "./db/schema";
import { emitirJwt } from "./auth";
import { app } from "./index";
import { generarCdaNivel1 } from "./cda";
import { create } from "xmlbuilder2";

let profesionalId: number;
let recepcionId: number;
let pacienteId: number;
let consultaId: number;

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
  profesionalId = await crearUsuario("prof-docs@test.local", "profesional");
  recepcionId = await crearUsuario("recep-docs@test.local", "recepcion");

  const cedula = String(1_000_000 + Math.floor(Math.random() * 899_999));
  const [pac] = await db
    .insert(pacientes)
    .values({ cedula, nombre: "Paciente Docs Test", fechaNacimiento: "1975-06-20" })
    .returning({ id: pacientes.id });
  pacienteId = pac.id;

  const h = { Authorization: `Bearer ${await emitirJwt(profesionalId, "profesional")}`, "Content-Type": "application/json" };
  const creada = await app.request("/consultas", {
    method: "POST",
    headers: h,
    body: JSON.stringify({ pacienteId, motivo: "Control", evolucion: "Estable", diagnosticoCie10: "Z00.0" }),
  });
  consultaId = (await creada.json<{ id: number }>()).id;
});

const headers = async (id: number, rol: string) => ({
  Authorization: `Bearer ${await emitirJwt(id, rol as "profesional")}`,
});

describe("CDA nivel 1", () => {
  test("genera XML bien formado con cabecera obligatoria", async () => {
    const xml = generarCdaNivel1({
      paciente: { nombre: "Juan Pérez", cedula: "12345678", fechaNacimiento: "1980-04-12" },
      profesional: { nombre: "prof@x.uy", id: 4 },
      consulta: { id: 9, fecha: new Date("2026-11-08T14:30:00Z"), motivo: "Cefalea", evolucion: "", diagnosticoCie10: "G44.2" },
      medicacion: [],
    });

    // Parsear el XML: si no es bien formado, lanza.
    const doc = create(xml);
    const root = doc.root();
    expect(root.node.nodeName).toBe("ClinicalDocument");

    // structuredBody debe colgar de ClinicalDocument, nunca de custodian:
    // aparece despues de cerrar </custodian> y antes de </ClinicalDocument>.
    const iBody = xml.indexOf("<structuredBody>");
    expect(iBody).toBeGreaterThan(xml.indexOf("</custodian>"));
    expect(iBody).toBeLessThan(xml.indexOf("</ClinicalDocument>"));

    // Campos CMD mínimos.
    expect(xml).toContain('realmCode code="UY"');
    expect(xml).toContain('templateId root="2.16.858.2.10000611.1.6"');
    expect(xml).toContain("G44.2");
    expect(xml).toContain("Datos del paciente");
    expect(xml).toContain("Encuentro");
  });

  test("incluye medicación cuando existe", async () => {
    const xml = generarCdaNivel1({
      paciente: { nombre: "A B", cedula: "11111111", fechaNacimiento: "1990-01-01" },
      profesional: { nombre: "p@x.uy", id: 1 },
      consulta: { id: 1, fecha: new Date(), motivo: "m", evolucion: "", diagnosticoCie10: "" },
      medicacion: [{ medicamento: "Paracetamol", dosis: "1g", duracion: "3 días" }],
    });
    expect(xml).toContain("Paracetamol");
    expect(xml).toContain("Medicación");
  });

  test("GET /consultas/:id/cda devuelve XML para profesional", async () => {
    const res = await app.request(`/consultas/${consultaId}/cda`, { headers: await headers(profesionalId, "profesional") });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("xml");
    const xml = await res.text();
    expect(xml).toContain("<ClinicalDocument");
    expect(xml).toContain("Paciente Docs Test");
  });

  test("nivel 3: diagnóstico como entry estructurado con CIE-10", async () => {
    const xml = generarCdaNivel1({
      paciente: { nombre: "Juan Pérez", cedula: "12345678", fechaNacimiento: "1980-04-12" },
      profesional: { nombre: "prof@x.uy", id: 4 },
      consulta: { id: 9, fecha: new Date("2026-11-08T14:30:00Z"), motivo: "Cefalea", evolucion: "", diagnosticoCie10: "G44.2" },
      medicacion: [],
    });
    // La sección Problemas existe con su template y el entry con el CIE-10.
    expect(xml).toContain('code code="11450-4"');
    expect(xml).toContain('templateId root="2.16.840.1.113883.10.20.22.2.3"');
    expect(xml).toContain("templateId root=\"2.16.840.1.113883.10.20.22.2.5\"");
    expect(xml).toContain('xsi:type="CD"');
    expect(xml).toContain('code="G44.2"');
    expect(xml).toContain('codeSystem="2.16.840.1.113883.6.3"'); // ICD-10
    // Sin diagnóstico no hay sección Problemas ni entries.
    const sinDx = generarCdaNivel1({
      paciente: { nombre: "A B", cedula: "11111111", fechaNacimiento: "1990-01-01" },
      profesional: { nombre: "p@x.uy", id: 1 },
      consulta: { id: 1, fecha: new Date(), motivo: "m", evolucion: "", diagnosticoCie10: "" },
      medicacion: [],
    });
    expect(sinDx).not.toContain("Problemas");
    expect(sinDx).not.toContain("<entry>");
  });

  test("estructura CDA R2: cabecera obligatoria, OIDs válidos y texto en cada sección", async () => {
    const xml = generarCdaNivel1({
      paciente: { nombre: "Juan Pérez", cedula: "12345678", fechaNacimiento: "1980-04-12" },
      profesional: { nombre: "Dra. Luisa Prueba", id: 7 },
      consulta: { id: 42, fecha: new Date("2026-11-08T14:30:00Z"), motivo: "Cefalea", evolucion: "Sin signos de alarma", diagnosticoCie10: "G44.2" },
      medicacion: [{ medicamento: "Ibuprofeno 400 mg", dosis: "1 cada 8 h", duracion: "3 días" }],
    });

    const doc = create(xml).root();
    const hijos = (n: typeof doc) => Array.from(n.node.childNodes as unknown as { nodeName: string }[]).map((c) => c.nodeName);

    // Orden obligatorio de la cabecera CDA R2 (HL7 V3).
    const nombres = hijos(doc).filter((n) => !n.startsWith("#"));
    expect(nombres.slice(0, 10)).toEqual([
      "realmCode",
      "typeId",
      "templateId",
      "id",
      "code",
      "title",
      "effectiveTime",
      "confidentialityCode",
      "languageCode",
      "author",
    ]);
    expect(nombres).toContain("custodian");
    expect(nombres).toContain("component");

    // effectiveTime CDA: yyyymmddHHMMSS, 14 dígitos.
    expect(xml).toMatch(/<effectiveTime value="\d{14}"\/>/);

    // Todos los templateId y OIDs declarados son OIDs numéricos válidos.
    const oids = [...xml.matchAll(/(?:root|codeSystem)="([^"]+)"/g)].map((m) => m[1]);
    expect(oids.length).toBeGreaterThan(5);
    for (const oid of oids) expect(oid).toMatch(/^\d+(\.\d+)+$/);

    // Toda sección necesita code + title + text (el texto es obligatorio en CDA).
    const secciones = [...xml.matchAll(/<section>([\s\S]*?)<\/section>/g)].map((m) => m[1]);
    expect(secciones.length).toBeGreaterThanOrEqual(3);
    for (const s of secciones) {
      expect(s).toContain("<code ");
      expect(s).toContain("<title>");
      expect(s).toContain("<text>");
    }

    // CIE-10 declarado con el OID de ICD-10 y el autor es una persona, no un email.
    expect(xml).toContain('codeSystem="2.16.840.1.113883.6.3"');
    expect(xml).toContain("<name>Dra. Luisa Prueba</name>");
  });

  test("recepción NO puede generar CDA (403)", async () => {
    const res = await app.request(`/consultas/${consultaId}/cda`, { headers: await headers(recepcionId, "recepcion") });
    expect(res.status).toBe(403);
  });
});

describe("Documentos", () => {
  const subir = async (nombre: string, tipo: string, bytes: Uint8Array, h: Record<string, string>) => {
    const form = new FormData();
    form.append("pacienteId", String(pacienteId));
    form.append("archivo", new File([bytes], nombre, { type: tipo }));
    return app.request("/documentos", { method: "POST", body: form, headers: h });
  };

  test("profesional sube PDF, lo lista y lo descarga", async () => {
    const h = await headers(profesionalId, "profesional");
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    const res = await subir("informe.pdf", "application/pdf", pdf, h);
    expect(res.status).toBe(201);
    const { id } = await res.json<{ id: number }>();

    const lista = await app.request(`/documentos/paciente/${pacienteId}`, { headers: h });
    const filas = await lista.json<{ id: number; nombreArchivo: string }[]>();
    expect(filas.some((f) => f.id === id && f.nombreArchivo === "informe.pdf")).toBe(true);

    const descarga = await app.request(`/documentos/${id}/archivo`, { headers: h });
    expect(descarga.status).toBe(200);
    expect(descarga.headers.get("content-type")).toBe("application/pdf");
  });

  test("rechaza formato no permitido (ejecutable)", async () => {
    const h = await headers(profesionalId, "profesional");
    const res = await subir("virus.exe", "application/x-msdownload", new Uint8Array([0x4d, 0x5a]), h);
    expect(res.status).toBe(400);
  });

  test("recepción NO puede subir ni listar documentos (403)", async () => {
    const h = await headers(recepcionId, "recepcion");
    const res = await subir("x.pdf", "application/pdf", new Uint8Array([0x25]), h);
    expect(res.status).toBe(403);

    const lista = await app.request(`/documentos/paciente/${pacienteId}`, { headers: h });
    expect(lista.status).toBe(403);
  });
});
