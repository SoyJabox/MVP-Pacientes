<script setup lang="ts">
const usuario = useUsuario();
const ruta = useRoute();

const enlaces = [
  { to: "/", etiqueta: "Inicio" },
  { to: "/pacientes", etiqueta: "Pacientes" },
  { to: "/agenda", etiqueta: "Agenda" },
  // Usuarios y auditoría solo existen para el admin (la API lo impone igual).
  ...(usuario.value?.rol === "admin"
    ? [
        { to: "/usuarios", etiqueta: "Usuarios" },
        { to: "/auditoria", etiqueta: "Auditoría" },
      ]
    : []),
];

const activo = (to: string) => (to === "/" ? ruta.path === "/" : ruta.path.startsWith(to));

async function salir() {
  await $fetch("/api/auth/logout", { method: "POST" });
  usuario.value = null;
  await navigateTo("/login");
}
</script>

<template>
  <div class="app">
    <header class="barra">
      <NuxtLink to="/" class="marca">
        <span class="marca__signo" aria-hidden="true">✚</span>
        <span class="marca__texto">Gestor de Pacientes</span>
      </NuxtLink>

      <nav class="nav" aria-label="Principal">
        <NuxtLink
          v-for="e in enlaces"
          :key="e.to"
          :to="e.to"
          class="nav__enlace"
          :class="{ 'nav__enlace--activo': activo(e.to) }"
          :aria-current="activo(e.to) ? 'page' : undefined"
        >
          {{ e.etiqueta }}
        </NuxtLink>
      </nav>

      <div v-if="usuario" class="sesion">
        <span class="sesion__rol">{{ usuario.rol }}</span>
        <span class="sesion__email">{{ usuario.email }}</span>
        <button class="sesion__salir" @click="salir">Salir</button>
      </div>
    </header>

    <main class="contenido">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.barra {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 0.65rem 1.5rem;
  background: var(--superficie);
  border-bottom: 1px solid var(--borde);
  position: sticky;
  top: 0;
  z-index: 10;
}

.marca {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  text-decoration: none;
  color: var(--texto);
  font-weight: 680;
  font-size: 0.95rem;
  letter-spacing: -0.01em;
  white-space: nowrap;
}

.marca__signo {
  display: grid;
  place-items: center;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 6px;
  background: var(--acento);
  color: #fff;
  font-size: 0.8rem;
  line-height: 1;
}

.nav {
  display: flex;
  gap: 0.25rem;
}

.nav__enlace {
  padding: 0.4rem 0.7rem;
  border-radius: 7px;
  text-decoration: none;
  color: var(--texto-suave);
  font-size: 0.9rem;
  font-weight: 550;
  transition: background-color var(--transicion), color var(--transicion);
}

.nav__enlace:hover {
  background: var(--superficie-alt);
  color: var(--texto);
}

.nav__enlace--activo {
  background: var(--acento-tenue);
  color: var(--acento);
  font-weight: 650;
}

.sesion {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.85rem;
  color: var(--texto-suave);
}

.sesion__rol {
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--acento);
  background: var(--acento-tenue);
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
}

.sesion__email {
  max-width: 16ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sesion__salir {
  padding: 0.3rem 0.65rem;
  font-size: 0.82rem;
  font-weight: 550;
}

.contenido {
  flex: 1;
  width: 100%;
  max-width: 1040px;
  margin: 0 auto;
  padding: 1.75rem 1.5rem 3rem;
}

@media (max-width: 720px) {
  .barra {
    flex-wrap: wrap;
    gap: 0.6rem 1rem;
    padding: 0.6rem 1rem;
  }

  .nav {
    order: 3;
    width: 100%;
    overflow-x: auto;
    padding-bottom: 0.15rem;
  }

  .sesion {
    margin-left: auto;
  }

  .sesion__email {
    display: none;
  }

  .contenido {
    padding: 1.25rem 1rem 2.5rem;
  }
}
</style>
