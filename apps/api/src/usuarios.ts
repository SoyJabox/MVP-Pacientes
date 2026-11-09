import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { usuarios } from "./db/schema";
import { requiereRol, type EnvAuth } from "./auth";
import { auditar } from "./auditoria";

// Gestión de usuarios: solo el admin crea, ve y (des)activa cuentas.
const soloAdmin = requiereRol("admin");

const crearUsuarioSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(6).max(100),
  rol: z.enum(["admin", "recepcion", "profesional"]),
  nombre: z.string().trim().max(120).default(""),
});

const editarUsuarioSchema = z.object({
  rol: z.enum(["admin", "recepcion", "profesional"]).optional(),
  nombre: z.string().trim().max(120).optional(),
  activo: z.boolean().optional(),
});

export const usuariosRouter = new Hono<EnvAuth>();

usuariosRouter.use("/usuarios", soloAdmin);
usuariosRouter.use("/usuarios/*", soloAdmin);
usuariosRouter.use("/usuarios", auditar("usuarios"));
usuariosRouter.use("/usuarios/*", auditar("usuarios"));

usuariosRouter.get("/usuarios", async (c) => {
  const filas = await db
    .select({ id: usuarios.id, email: usuarios.email, nombre: usuarios.nombre, rol: usuarios.rol, activo: usuarios.activo })
    .from(usuarios)
    .orderBy(usuarios.id);
  return c.json(filas);
});

usuariosRouter.post("/usuarios", async (c) => {
  const parsed = crearUsuarioSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Datos inválidos", detalles: parsed.error.flatten() }, 400);

  const [existente] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, parsed.data.email));
  if (existente) return c.json({ error: "Ya existe un usuario con ese email" }, 409);

  const passwordHash = await Bun.password.hash(parsed.data.password);
  const [nuevo] = await db
    .insert(usuarios)
    .values({ email: parsed.data.email, passwordHash, rol: parsed.data.rol, nombre: parsed.data.nombre })
    .returning({ id: usuarios.id, email: usuarios.email, nombre: usuarios.nombre, rol: usuarios.rol, activo: usuarios.activo });

  c.set("entidadId", nuevo.id);
  return c.json(nuevo, 201);
});

usuariosRouter.patch("/usuarios/:id{\\d+}", async (c) => {
  const id = Number(c.req.param("id"));
  const parsed = editarUsuarioSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Datos inválidos", detalles: parsed.error.flatten() }, 400);

  // Nadie se desactiva a sí mismo (quedaría sin admin de turno).
  const yo = c.get("usuario");
  if (yo.sub === id && parsed.data.activo === false) {
    return c.json({ error: "No podés desactivar tu propia cuenta" }, 400);
  }

  const [actualizado] = await db
    .update(usuarios)
    .set(parsed.data)
    .where(eq(usuarios.id, id))
    .returning({ id: usuarios.id, email: usuarios.email, nombre: usuarios.nombre, rol: usuarios.rol, activo: usuarios.activo });
  if (!actualizado) return c.json({ error: "Usuario no encontrado" }, 404);

  c.set("entidadId", id);
  return c.json(actualizado);
});
