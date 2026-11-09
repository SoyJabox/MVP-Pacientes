// Lista las citas agendadas de las próximas 24 h con el contacto del paciente,
// para recordarlas (llamada/WhatsApp). Pensado para cron diario:
//   0 8 * * * cd /ruta/gestor-pacientes/apps/api && bun run scripts/recordatorios.ts
// Sin dependencias nuevas: los canales de envío (mail/WhatsApp) quedan para
// cuando se elija uno; esto produce la lista lista para copiar.
import { and, asc, between, eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { citas, pacientes, usuarios } from "../src/db/schema";

const ahora = new Date();
const manana = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);

const filas = await db
  .select({
    id: citas.id,
    fechaHora: citas.fechaHora,
    estado: citas.estado,
    pacienteNombre: pacientes.nombre,
    pacienteContacto: pacientes.contacto,
    profesionalEmail: usuarios.email,
    profesionalNombre: usuarios.nombre,
  })
  .from(citas)
  .innerJoin(pacientes, eq(citas.pacienteId, pacientes.id))
  .innerJoin(usuarios, eq(citas.profesionalId, usuarios.id))
  .where(and(eq(citas.estado, "agendada"), between(citas.fechaHora, ahora, manana)))
  .orderBy(asc(citas.fechaHora));

if (filas.length === 0) {
  console.log("Sin citas agendadas en las próximas 24 h.");
  process.exit(0);
}

console.log(`Recordatorios (${filas.length} citas en próximas 24 h):\n`);
for (const f of filas) {
  const hora = f.fechaHora.toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  // Los contactos tipo "099 412 876" se copian tal cual al WhatsApp/teléfono.
  console.log(`- ${hora} — ${f.pacienteNombre} (${f.pacienteContacto || "sin contacto"}) — ${f.profesionalNombre || f.profesionalEmail}`);
}

process.exit(0);
