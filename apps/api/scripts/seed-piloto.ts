// Carga inicial para el piloto (Fase 7): 8 pacientes ficticios con historia
// clínica realista (consultas, medicación, citas próximas). Idempotente:
// si la cédula ya existe, se salta al paciente.
// Uso: bun run scripts/seed-piloto.ts
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { pacientes, usuarios, consultas, medicacion, citas } from "../src/db/schema";

interface PacientePiloto {
  cedula: string;
  nombre: string;
  fechaNacimiento: string;
  contacto: string;
  consultas: { motivo: string; evolucion: string; cie10: string; meds?: { medicamento: string; dosis: string; duracion: string }[] }[];
}

const PILOTO: PacientePiloto[] = [
  {
    cedula: "51234568",
    nombre: "Rosa María Duarte",
    fechaNacimiento: "1958-04-12",
    contacto: "099 412 876",
    consultas: [
      { motivo: "Control de presión arterial", evolucion: "TA 150/90. Se ajusta enalapril a 10 mg cada 12 h. Dieta baja en sodio.", cie10: "I10", meds: [{ medicamento: "Enalapril 10 mg", dosis: "1 comprimido cada 12 h", duracion: "30 días" }] },
      { motivo: "Control mensual", evolucion: "TA 130/80. Continúa tratamiento. Sin síntomas.", cie10: "I10" },
    ],
  },
  {
    cedula: "53456789",
    nombre: "Pedro Antonio Sosa",
    fechaNacimiento: "1965-09-03",
    contacto: "099 555 201",
    consultas: [
      { motivo: "Dolor lumbar", evolucion: "Lumbalgia mecánica de 5 días, sin irradiación ni déficit neurológico. Paracetamol 1 g cada 8 h por 5 días, calor local.", cie10: "M54.5", meds: [{ medicamento: "Paracetamol 500 mg", dosis: "2 comprimidos cada 8 h", duracion: "5 días" }] },
    ],
  },
  {
    cedula: "56789012",
    nombre: "Carmen Elena Vidal",
    fechaNacimiento: "1972-01-27",
    contacto: "099 867 340",
    consultas: [
      { motivo: "Control anual", evolucion: "Examen físico completo sin hallazgos. Mamografía al día. Se solicita hemograma y glicemia.", cie10: "Z00.0" },
      { motivo: "Resfrío común", evolucion: "Rinorrea y odinofagia leve, afebril. Sintomáticos.", cie10: "J06.9" },
    ],
  },
  {
    cedula: "59890123",
    nombre: "Jorge Luis Moreira",
    fechaNacimiento: "1980-06-15",
    contacto: "099 223 456",
    consultas: [
      { motivo: "Dolor abdominal", evolucion: "Epigastralgia posprandial de 2 semanas. Omeprazol 20 mg antes del desayuno por 14 días. Solicito ecografía abdominal.", cie10: "R10.1", meds: [{ medicamento: "Omeprazol 20 mg", dosis: "1 cápsula antes del desayuno", duracion: "14 días" }] },
    ],
  },
  {
    cedula: "50123456",
    nombre: "Lucía Fernanda Castro",
    fechaNacimiento: "1990-11-08",
    contacto: "099 901 234",
    consultas: [
      { motivo: "Control de embarazo", evolucion: "Embarazo de 12 semanas, confirmado por ecografía. FUM según amenorrea. Ácido fólico 400 mcg diario. Controles mensuales.", cie10: "Z34.0", meds: [{ medicamento: "Ácido fólico 400 mcg", dosis: "1 comprimido diario", duracion: "30 días" }] },
    ],
  },
  {
    cedula: "52345678",
    nombre: "Miguel Ángel Torres",
    fechaNacimiento: "1949-03-22",
    contacto: "099 345 678",
    consultas: [
      { motivo: "Control de diabetes", evolucion: "HbA1c 7,8%. Se agrega metformina 850 mg cada 12 h con las comidas. Indicaciones dietéticas y de pie diabético.", cie10: "E11" },
      { motivo: "Control mensual", evolucion: "Glicemia en ayunas 128 mg/dL. Tolerancia correcta a metformina. Continúa.", cie10: "E11" },
    ],
  },
  {
    cedula: "54567890",
    nombre: "Silvia Beatriz Núñez",
    fechaNacimiento: "1968-08-30",
    contacto: "099 678 901",
    consultas: [
      { motivo: "Cefalea", evolucion: "Cefalea tensional frecuente, asociada a tensión cervical. Relajantes y ergonomía. Ibuprofeno 400 mg por crisis.", cie10: "G44.2" },
    ],
  },
  {
    cedula: "55678901",
    nombre: "Héctor Omar Pintos",
    fechaNacimiento: "1955-12-05",
    contacto: "099 102 938",
    consultas: [
      { motivo: "Control post ECV", evolucion: "Secuela leve de ECV isquémico, deambula sin ayuda. Continúa antiagregación. Derivado a Fisioterapia.", cie10: "I63.9" },
      { motivo: "Control mensual", evolucion: "Evolución estable. TA 120/75. Sin nuevos eventos.", cie10: "I63.9" },
    ],
  },
];

const [prof] = await db
  .select({ id: usuarios.id })
  .from(usuarios)
  .where(eq(usuarios.activo, true))
  .orderBy(usuarios.id)
  .limit(1);
if (!prof) {
  console.error("No hay usuarios activos. Creá uno con seed-admin.ts primero.");
  process.exit(1);
}

let creados = 0;
let saltados = 0;
for (const p of PILOTO) {
  const [existente] = await db.select({ id: pacientes.id }).from(pacientes).where(eq(pacientes.cedula, p.cedula));
  if (existente) {
    console.log(`Salta ${p.nombre} (ya existe)`);
    saltados++;
    continue;
  }
  const [nuevo] = await db
    .insert(pacientes)
    .values({ cedula: p.cedula, nombre: p.nombre, fechaNacimiento: p.fechaNacimiento, contacto: p.contacto, consentimientoFirmado: true })
    .returning({ id: pacientes.id });

  for (const c of p.consultas) {
    const [consulta] = await db
      .insert(consultas)
      .values({ pacienteId: nuevo.id, profesionalId: prof.id, motivo: c.motivo, evolucion: c.evolucion, diagnosticoCie10: c.cie10 })
      .returning({ id: consultas.id });
    for (const m of c.meds ?? []) {
      await db.insert(medicacion).values({ consultaId: consulta.id, pacienteId: nuevo.id, ...m });
    }
  }

  // Una cita de control en 7 días, para que la agenda no esté vacía en el piloto.
  const fecha = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  fecha.setUTCHours(13, 0, 0, 0);
  await db.insert(citas).values({ pacienteId: nuevo.id, profesionalId: prof.id, fechaHora: fecha });

  console.log(`Creado ${p.nombre} (${p.consultas.length} consultas)`);
  creados++;
}

console.log(`Listo: ${creados} creados, ${saltados} ya existían.`);
process.exit(0);
