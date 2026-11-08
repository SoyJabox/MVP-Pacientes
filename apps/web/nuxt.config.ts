export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: false },
  // SPA: toda la pantalla vive tras login; la API decide el acceso.
  ssr: false,
  css: ["~/assets/css/main.css"],
  runtimeConfig: {
    apiBase: process.env.NUXT_API_BASE || "http://localhost:8787",
  },
  app: {
    head: {
      htmlAttrs: { lang: "es" },
      title: "Gestor de Pacientes",
      meta: [
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { name: "color-scheme", content: "light" },
      ],
    },
  },
});
