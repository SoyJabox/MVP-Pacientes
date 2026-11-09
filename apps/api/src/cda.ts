import { create } from "xmlbuilder2";

// CDA R2: CMD mínimo de Salud.uy / HCEN.
// Nivel 1 = documento narrativo (cabecera + secciones en texto).
// Nivel 3 = además, `entry` estructurados: acá el diagnóstico (observación de
// problema con CIE-10). La medicación queda narrativa: un entry de fármaco
// exige un diccionario de drogas (p. ej. RxNorm) que el consultorio no tiene.
// Los templates de entry son HL7 estándar (C-CDA); validar contra los
// templates propios de Salud.uy cuando se disponga de su Guía de Implementación.

export interface DatosCda {
  paciente: { nombre: string; cedula: string; fechaNacimiento: string };
  profesional: { nombre: string; id: number };
  consulta: {
    id: number;
    fecha: Date;
    motivo: string;
    evolucion: string;
    diagnosticoCie10: string;
  };
  medicacion: { medicamento: string; dosis: string; duracion: string }[];
}

const OID_HCEN = "2.16.858.2.10000611"; // raíz de Salud.uy

// CDA usa yyyymmddHHMMSS sin separadores.
const fechaCda = (d: Date) => d.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);

export function generarCdaNivel1(datos: DatosCda): string {
  const { paciente, profesional, consulta, medicacion } = datos;
  const ts = fechaCda(consulta.fecha);

  const doc = create({ version: "1.0", encoding: "UTF-8" })
    .ele("ClinicalDocument", {
      xmlns: "urn:hl7-org:v3",
      "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
    })
    .ele("realmCode", { code: "UY" }).up()
    .ele("typeId", { root: "2.16.840.1.113883.1.3", extension: "POCD_MT000040" }).up()
    .ele("templateId", { root: `${OID_HCEN}.1.6` }).up() // CMD mínimo
    .ele("id", { root: `${OID_HCEN}.${consulta.id}` }).up() // estable: reenviar no duplica
    .ele("code", {
      code: "34133-9",
      codeSystem: "2.16.840.1.113883.6.1",
      displayName: "Summarization of episode note",
    }).up()
    .ele("title").txt(`Consulta de ${paciente.nombre}`).up()
    .ele("effectiveTime", { value: ts }).up()
    .ele("confidentialityCode", { code: "N", codeSystem: "2.16.840.1.113883.5.25" }).up()
    .ele("languageCode", { code: "es-UY" }).up()
    .ele("author")
    .ele("time", { value: ts }).up()
    .ele("assignedAuthor")
    .ele("id", { root: OID_HCEN, extension: String(profesional.id) }).up()
    .ele("assignedPerson")
    .ele("name").txt(profesional.nombre).up()
    .up()
    .up()
    .up()
    .ele("custodian")
    .ele("assignedCustodian")
    .ele("representedCustodianOrganization")
    .ele("id", { root: OID_HCEN }).up()
    .ele("name").txt("Consultorio").up()
    .up() // representedCustodianOrganization
    .up() // assignedCustodian
    .up(); // custodian → de vuelta en ClinicalDocument

  const cuerpo = doc.ele("component").ele("structuredBody");

  // Devuelve la <section> (código + título). El caller agrega <text> y, si aplica, <entry>.
  const seccion = (codigo: string, titulo: string, templateId?: string) => {
    const s = cuerpo.ele("component").ele("section");
    if (templateId) s.ele("templateId", { root: templateId }).up();
    s.ele("code", {
      code: codigo,
      codeSystem: "2.16.840.1.113883.6.1",
      displayName: titulo,
    }).up().ele("title").txt(titulo).up();
    return s;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const texto = (s: ReturnType<typeof seccion>, contenido: (t: any) => void) => {
    const t = s.ele("text");
    contenido(t);
  };

  // Datos del paciente (solo texto, nivel 1).
  {
    const s = seccion("10160-0", "Datos del paciente");
    texto(s, (t) =>
      t.ele("paragraph").txt(`${paciente.nombre} — CI ${paciente.cedula} — Nacimiento ${paciente.fechaNacimiento}`).up(),
    );
  }

  // Encuentro (solo texto, nivel 1).
  {
    const s = seccion("34109-9", "Encuentro");
    texto(s, (t) => {
      t.ele("paragraph").txt(`Motivo: ${consulta.motivo}`).up();
      if (consulta.evolucion) t.ele("paragraph").txt(`Evolución: ${consulta.evolucion}`).up();
      if (consulta.diagnosticoCie10) {
        t.ele("paragraph").txt(`Diagnóstico CIE-10: ${consulta.diagnosticoCie10}`).up();
      }
    });
  }

  // Problemas: texto + entry estructurado de diagnóstico (nivel 3).
  if (consulta.diagnosticoCie10) {
    const s = seccion("11450-4", "Problemas", "2.16.840.1.113883.10.20.22.2.3");
    texto(s, (t) => t.ele("paragraph").txt(`Diagnóstico: ${consulta.diagnosticoCie10}`).up());
    s.ele("entry")
      .ele("observation")
      .ele("templateId", { root: "2.16.840.1.113883.10.20.22.2.5" }).up()
      .ele("code", {
        code: "55607000",
        codeSystem: "2.16.840.1.113883.6.96",
        displayName: "Problem",
      }).up()
      .ele("statusCode", { code: "completed", codeSystem: "2.16.840.1.113883.5.14" }).up()
      .ele("effectiveTime", { value: ts }).up()
      .ele("value", {
        "xsi:type": "CD",
        code: consulta.diagnosticoCie10,
        codeSystem: "2.16.840.1.113883.6.3", // ICD-10
        displayName: consulta.diagnosticoCie10,
      }).up();
  }

  // Medicación: narrativa (ver nota de arriba). Código LOINC correcto: 24326-1.
  if (medicacion.length > 0) {
    const s = seccion("24326-1", "Medicación", "2.16.840.1.113883.10.20.22.2.1");
    texto(s, (t) => {
      const lista = t.ele("list");
      for (const m of medicacion) {
        lista.ele("item").txt(`${m.medicamento} — ${m.dosis}${m.duracion ? ` (${m.duracion})` : ""}`).up();
      }
    });
  }

  return doc.end({ prettyPrint: true });
}
