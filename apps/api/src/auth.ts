import { createMiddleware } from "hono/factory";
import { sign, verify } from "hono/jwt";
import type { Rol } from "@gestor/shared";

const JWT_SECRET = process.env.JWT_SECRET ?? "cambiar-en-produccion";

export interface PayloadJwt {
  sub: number;
  rol: Rol;
  exp: number;
}

export interface UsuarioAuth extends PayloadJwt {}

// Variables de contexto que los middlewares setean y los handlers leen.
export type EnvAuth = {
  Variables: {
    usuario: UsuarioAuth;
    entidadId?: number;
    // El handler puede precisar la acción cuando el método HTTP no alcanza
    // (por ejemplo una exportación CDA, que viaja como GET).
    accion?: "ver" | "listar" | "crear" | "editar" | "eliminar" | "exportar";
  };
};

export async function emitirJwt(usuarioId: number, rol: Rol): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 8; // 8 horas
  return sign({ sub: usuarioId, rol, exp }, JWT_SECRET);
}

export async function verificarJwt(token: string): Promise<PayloadJwt | null> {
  try {
    return (await verify(token, JWT_SECRET, "HS256")) as PayloadJwt;
  } catch {
    return null;
  }
}

// Middleware: exige JWT válido y carga el usuario en el contexto.
export const requiereAuth = createMiddleware<EnvAuth>(async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return c.json({ error: "No autenticado" }, 401);

  const payload = await verificarJwt(token);
  if (!payload) return c.json({ error: "Token inválido o expirado" }, 401);

  c.set("usuario", payload);
  await next();
});

// Middleware de RBAC: solo los roles listados pasan. La decisión siempre es acá.
export const requiereRol = (...roles: Rol[]) =>
  createMiddleware<EnvAuth>(async (c, next) => {
    const usuario = c.get("usuario");
    if (!usuario) return c.json({ error: "No autenticado" }, 401);
    if (!roles.includes(usuario.rol)) {
      return c.json({ error: "Su rol no tiene acceso a este recurso" }, 403);
    }
    await next();
  });
