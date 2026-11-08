// Restaura la sesión desde la cookie HttpOnly.
export default defineEventHandler(async (event) => {
  const token = getCookie(event, "auth_token");
  if (!token) throw createError({ statusCode: 401, statusMessage: "No autenticado" });
  return await apiFetch("/me", { token });
});
