import { create } from "xmlbuilder2";

// CDA R2 nivel 1 (CMD mínimo de Salud.uy / HCEN).
// Nivel 1 = documento narrativo: cabecera obligatoria + secciones en texto.
// Los `entry` estructurados (nivel 3) quedan para una fase posterior.

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

  const seccion = (codigo: string, titulo: string) =>
    cuerpo.ele("component").ele("section").ele("code", {
      code: codigo,
      codeSystem: "2.16.840.1.113883.6.1",
      displayName: titulo,
    }).up().ele("title").txt(titulo).up().ele("text");

  seccion("10160-0", "Datos del paciente")
    .ele("paragraph")
    .txt(`${paciente.nombre} — CI ${paciente.cedula} — Nacimiento ${paciente.fechaNacimiento}`)
    .up();

  const encuentro = seccion("34109-9", "Encuentro");
  encuentro.ele("paragraph").txt(`Motivo: ${consulta.motivo}`).up();
  if (consulta.evolucion) encuentro.ele("paragraph").txt(`Evolución: ${consulta.evolucion}`).up();
  if (consulta.diagnosticoCie10) {
    encuentro.ele("paragraph").txt(`Diagnóstico CIE-10: ${consulta.diagnosticoCie10}`).up();
  }

  if (medicacion.length > 0) {
    const lista = seccion("10160-0", "Medicación").ele("list");
    for (const m of medicacion) {
      lista.ele("item").txt(`${m.medicamento} — ${m.dosis}${m.duracion ? ` (${m.duracion})` : ""}`).up();
    }
  }

  return doc.end({ prettyPrint: true });
}
