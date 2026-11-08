<script setup lang="ts">
import type { Paciente } from "@gestor/shared";

const q = ref("");
const pacientes = ref<Paciente[]>([]);
const cargando = ref(false);
const error = ref("");

async function buscar() {
  cargando.value = true;
  error.value = "";
  try {
    pacientes.value = await $fetch<Paciente[]>("/api/pacientes", {
      query: q.value.trim() ? { q: q.value.trim() } : undefined,
    });
  } catch {
    error.value = "No se pudo cargar la lista de pacientes.";
  } finally {
    cargando.value = false;
  }
}

// Búsqueda con retardo: no llamamos a la API en cada tecla.
let timer: ReturnType<typeof setTimeout> | undefined;
watch(q, () => {
  clearTimeout(timer);
  timer = setTimeout(buscar, 300);
});

onMounted(buscar);
</script>

<template>
  <main class="panel">
    <header>
      <h1>Pacientes</h1>
      <div class="acciones">
        <NuxtLink to="/pacientes/nuevo" class="boton primario">+ Nuevo paciente</NuxtLink>
      </div>
    </header>

    <section class="contenido">
      <input
        v-model="q"
        type="search"
        class="busqueda"
        placeholder="Buscar por nombre o cédula…"
        aria-label="Buscar paciente"
      />

      <p v-if="error" role="alert" class="error">{{ error }}</p>
      <p v-else-if="cargando">Cargando…</p>

      <table v-else-if="pacientes.length">
        <thead>
          <tr>
            <th scope="col">Nombre</th>
            <th scope="col">Cédula</th>
            <th scope="col">Contacto</th>
            <th scope="col">Consentimiento</th>
            <th scope="col"><span class="visualmente-oculto">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in pacientes" :key="p.id">
            <td><NuxtLink :to="`/pacientes/${p.id}`" class="enlace">{{ p.nombre }}</NuxtLink></td>
            <td>{{ p.cedula }}</td>
            <td>{{ p.contacto }}</td>
            <td>{{ p.consentimientoFirmado ? "Firmado" : "Pendiente" }}</td>
            <td><NuxtLink :to="`/pacientes/${p.id}/editar`" class="boton">Editar</NuxtLink></td>
          </tr>
        </tbody>
      </table>

      <p v-else-if="!cargando">No hay pacientes que coincidan.</p>
    </section>
  </main>
</template>

<style scoped>
.panel { min-height: 100vh; font-family: system-ui, sans-serif; color: #1c2430; background: #f3f5f7; }
header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.75rem 1.5rem; background: #fff; border-bottom: 1px solid #dfe3e8;
}
h1 { font-size: 1.1rem; margin: 0; }
.contenido { padding: 1.5rem; display: grid; gap: 1rem; }
.busqueda {
  max-width: 380px; padding: 0.55rem 0.75rem;
  border: 1px solid #cdd4db; border-radius: 8px; font-size: 1rem;
}
table { border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; }
th, td { padding: 0.6rem 1rem; text-align: left; border-bottom: 1px solid #eef1f4; font-size: 0.93rem; }
th { background: #f7f9fb; font-weight: 600; }
.boton {
  padding: 0.4rem 0.9rem; border: 1px solid #cdd4db; border-radius: 8px;
  background: #fff; cursor: pointer; text-decoration: none; color: #1c2430; font-size: 0.9rem;
}
.boton:hover { background: #f0f2f5; }
.boton.primario { background: #2563eb; border-color: #2563eb; color: #fff; font-weight: 600; }
.boton.primario:hover { background: #1d4fc4; }
.error { color: #b42318; }
.enlace { color: #2563eb; text-decoration: none; }
.enlace:hover { text-decoration: underline; }
.visualmente-oculto { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
</style>
