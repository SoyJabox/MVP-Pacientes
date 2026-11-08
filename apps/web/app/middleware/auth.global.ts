// Protección global de rutas: sin sesión válida → /login.
export default defineNuxtRouteMiddleware(async (to) => {
  const usuario = useUsuario();
  if (!usuario.value) {
    try {
      usuario.value = await $fetch("/api/auth/me");
    } catch {
      return to.path === "/login" ? undefined : navigateTo("/login");
    }
  }
  if (to.path === "/login") return navigateTo("/");
});
