// Crea el usuario admin inicial si no existe.
// Uso: bun run scripts/seed-admin.ts <email> <password>
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { usuarios } from "../src/db/schema";

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error("Uso: bun run scripts/seed-admin.ts <email> <password>");
  process.exit(1);
}

const [existente] = await db.select().from(usuarios).where(eq(usuarios.email, email));
if (existente) {
  console.log(`El usuario ${email} ya existe (rol: ${existente.rol}). Nada que hacer.`);
  process.exit(0);
}

const passwordHash = await Bun.password.hash(password);
await db.insert(usuarios).values({ email: email.toLowerCase().trim(), passwordHash, rol: "admin" });
console.log(`Admin ${email} creado.`);
process.exit(0);
