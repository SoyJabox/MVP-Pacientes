// Proxy del login: la API devuelve el JWT, este servidor lo guarda en
// cookie HttpOnly (el navegador no puede leerla ni robarla con XSS).
export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string; password?: string }>(event);
  if (!body?.email || !body?.password) {
    throw createError({ statusCode: 400, statusMessage: "Email y contraseña requeridos" });
  }

  try {
    const res = await apiFetch<{ token: string; usuario: { id: number; email: string; rol: string } }>(
      "/auth/login",
      { method: "POST", body },
    );
    setCookie(event, "auth_token", res.token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 8,
      path: "/",
    });
    return { usuario: res.usuario };
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode ?? 401;
    throw createError({ statusCode: status === 400 ? 400 : 401, statusMessage: "Credenciales inválidas" });
  }
});
