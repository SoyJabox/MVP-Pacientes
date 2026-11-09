// Crea un usuario si no existe.
// Uso: bun run scripts/seed-admin.ts <email> <password> [--rol admin|recepcion|profesional] [--nombre "Nombre Apellido"]
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { usuarios } from "../src/db/schema";
import type { Rol } from "@gestor/shared";

const args = process.argv.slice(2);
const rolIdx = args.indexOf("--rol");
let rol: Rol = "admin";
if (rolIdx !== -1) {
  const v = args[rolIdx + 1];
  if (v !== "admin" && v !== "recepcion" && v !== "profesional") {
    console.error("Rol inválido. Opciones: admin, recepcion, profesional");
    process.exit(1);
  }
  rol = v;
  args.splice(rolIdx, 2);
}
const nomIdx = args.indexOf("--nombre");
let nombre = "";
if (nomIdx !== -1) {
  nombre = (args[nomIdx + 1] ?? "").trim().slice(0, 120);
  args.splice(nomIdx, 2);
}
const [email, password] = args;
if (!email || !password) {
  console.error("Uso: bun run scripts/seed-admin.ts <email> <password> [--rol admin|recepcion|profesional] [--nombre \"Nombre Apellido\"]");
  process.exit(1);
}

const [existente] = await db.select().from(usuarios).where(eq(usuarios.email, email));
if (existente) {
  console.log(`El usuario ${email} ya existe (rol: ${existente.rol}). Nada que hacer.`);
  process.exit(0);
}

const passwordHash = await Bun.password.hash(password);
await db.insert(usuarios).values({ email: email.toLowerCase().trim(), passwordHash, rol, nombre });
console.log(`Usuario ${email} creado (rol: ${rol}${nombre ? `, nombre: ${nombre}` : ""}).`);
process.exit(0);
