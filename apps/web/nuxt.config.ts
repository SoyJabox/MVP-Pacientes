export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: false },
  // SPA: toda la pantalla viva tras login; la API decide el acceso.
  ssr: false,
  runtimeConfig: {
    apiBase: process.env.NUXT_API_BASE || "http://localhost:8787",
  },
});
