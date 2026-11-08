import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { usuarios } from "./db/schema";
import { emitirJwt, requiereAuth, type EnvAuth } from "./auth";
import { pacientesRouter } from "./pacientes";
import { citasRouter } from "./citas";
import { consultasRouter } from "./consultas";
import { documentosRouter } from "./documentos";

const app = new Hono<EnvAuth>();

// Salud
app.get("/", (c) => c.json({ ok: true, servicio: "gestor-pacientes-api" }));

// Login: valida credenciales y emite JWT firmado.
app.post("/auth/login", async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>().catch(() => null);
  if (!body?.email || !body?.password) {
    return c.json({ error: "Email y contraseña requeridos" }, 400);
  }

  const [usuario] = await db
    .select()
    .from(usuarios)
    .where(eq(usuarios.email, body.email.toLowerCase().trim()));

  // Contraseña inválida y usuario inexistente devuelven lo mismo: no filtrar cuentas.
  if (!usuario || !usuario.activo) return c.json({ error: "Credenciales inválidas" }, 401);

  const valido = await Bun.password.verify(body.password, usuario.passwordHash);
  if (!valido) return c.json({ error: "Credenciales inválidas" }, 401);

  const token = await emitirJwt(usuario.id, usuario.rol);
  return c.json({ token, usuario: { id: usuario.id, email: usuario.email, rol: usuario.rol } });
});

// Todo lo demás requiere sesión.
app.use("*", requiereAuth);

app.route("/", pacientesRouter);
app.route("/", citasRouter);
app.route("/", consultasRouter);
app.route("/", documentosRouter);

// Quién soy: Nuxt lo usa para restaurar la sesión al recargar.
app.get("/me", (c) => {
  const u = c.get("usuario");
  return c.json({ id: u.sub, rol: u.rol });
});

export { app };
export default { fetch: app.fetch, port: Number(process.env.PORT) || 8787 };
