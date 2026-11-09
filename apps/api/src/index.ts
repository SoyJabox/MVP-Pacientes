import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { rateLimiter } from "hono-rate-limiter";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { usuarios } from "./db/schema";
import { emitirJwt, requiereAuth, type EnvAuth } from "./auth";
import { pacientesRouter } from "./pacientes";
import { citasRouter } from "./citas";
import { consultasRouter } from "./consultas";
import { documentosRouter } from "./documentos";

const app = new Hono<EnvAuth>();

// Security headers en todas las respuestas.
app.use(
  "*",
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  }),
);

// CORS: solo el frontend de Nuxt puede llamar a la API.
app.use(
  "*",
  cors({
    origin: [process.env.NUXT_URL || "http://localhost:3001"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400,
  }),
);

// Rate limiting: 100 requests por minuto por IP. Previene brute force y DoS.
// Fuera de los tests: en test cada app.request cuenta y el límite flakea.
if (process.env.NODE_ENV !== "test") {
app.use(
  "*",
  rateLimiter({
    windowMs: 60 * 1000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (c) => c.req.header("x-forwarded-for") || c.req.header("host") || "unknown",
    handler: (c) => c.json({ error: "Demasiadas requests. Intentá de nuevo en un minuto." }, 429),
  }),
);
}

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
  return c.json({ token, usuario: { id: usuario.id, email: usuario.email, nombre: usuario.nombre, rol: usuario.rol } });
});

// Todo lo demás requiere sesión.
app.use("*", requiereAuth);

app.route("/", pacientesRouter);
app.route("/", citasRouter);
app.route("/", consultasRouter);
app.route("/", documentosRouter);

// Quién soy: Nuxt lo usa para restaurar la sesión al recargar.
app.get("/me", async (c) => {
  const u = c.get("usuario");
  const [fila] = await db
    .select({ id: usuarios.id, email: usuarios.email, nombre: usuarios.nombre, rol: usuarios.rol, activo: usuarios.activo })
    .from(usuarios)
    .where(eq(usuarios.id, u.sub));

  // Si la cuenta se desactivó después de emitir el token, la sesión muere acá.
  if (!fila || !fila.activo) return c.json({ error: "Sesión no válida" }, 401);

  return c.json({ id: fila.id, email: fila.email, nombre: fila.nombre, rol: fila.rol });
});

export { app };
export default { fetch: app.fetch, port: Number(process.env.PORT) || 8787 };
