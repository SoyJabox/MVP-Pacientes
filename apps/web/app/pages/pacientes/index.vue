<script setup lang="ts">
import type { Paciente } from "@gestor/shared";

const q = ref("");
const pacientes = ref<Paciente[]>([]);
const cargando = ref(true);
const error = ref("");
const busco = ref(false);

async function buscar() {
  busco.value = true;
  error.value = "";
  try {
    pacientes.value = await $fetch<Paciente[]>("/api/pacientes", {
      query: q.value.trim() ? { q: q.value.trim() } : undefined,
    });
  } catch {
    error.value = "No se pudo cargar la lista de pacientes.";
  } finally {
    cargando.value = false;
    busco.value = false;
  }
}

// Búsqueda con retardo: no golpear la API en cada tecla.
let timer: ReturnType<typeof setTimeout> | undefined;
watch(q, () => {
  clearTimeout(timer);
  timer = setTimeout(buscar, 300);
});

onMounted(buscar);
</script>

<template>
  <div class="lista">
    <header class="lista__cabecera">
      <div>
        <h1>Pacientes</h1>
        <p class="lista__conteo num">
          {{ cargando ? "Cargando…" : `${pacientes.length} ${pacientes.length === 1 ? "paciente" : "pacientes"}` }}
        </p>
      </div>
      <NuxtLink to="/pacientes/nuevo" class="boton primario">+ Nuevo paciente</NuxtLink>
    </header>

    <div class="lista__filtro">
      <input
        v-model="q"
        type="search"
        placeholder="Buscar por nombre o cédula…"
        aria-label="Buscar paciente"
      />
      <span v-if="busco" class="lista__buscando" aria-live="polite">Buscando…</span>
    </div>

    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>

    <div v-else-if="!cargando && pacientes.length" class="tabla-envoltura">
      <table>
        <thead>
          <tr>
            <th scope="col">Nombre</th>
            <th scope="col">Cédula</th>
            <th scope="col" class="col-sec">Contacto</th>
            <th scope="col" class="col-sec">Consentimiento</th>
            <th scope="col"><span class="visualmente-oculto">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in pacientes" :key="p.id">
            <td>
              <NuxtLink :to="`/pacientes/${p.id}`" class="lista__nombre">{{ p.nombre }}</NuxtLink>
            </td>
            <td class="num">{{ p.cedula }}</td>
            <td class="col-sec">{{ p.contacto || "—" }}</td>
            <td class="col-sec">
              <span class="etiqueta" :class="p.consentimientoFirmado ? 'etiqueta--ok' : 'etiqueta--gris'">
                {{ p.consentimientoFirmado ? "Firmado" : "Pendiente" }}
              </span>
            </td>
            <td class="lista__acciones">
              <NuxtLink :to="`/pacientes/${p.id}`" class="boton accion-ver">Ver</NuxtLink>
              <NuxtLink :to="`/pacientes/${p.id}/editar`" class="boton">Editar</NuxtLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-else-if="!cargando" class="mensaje-vacio">
      {{ q.trim() ? `Ningún paciente coincide con “${q}”.` : "Todavía no hay pacientes registrados." }}
    </p>
  </div>
</template>

<style scoped>
.lista {
  display: grid;
  gap: 1.1rem;
}

.lista__cabecera {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.lista__conteo {
  color: var(--texto-suave);
  font-size: 0.85rem;
  margin-top: 0.15rem;
}

.lista__filtro {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.lista__filtro input {
  flex: 1;
  max-width: 380px;
}

.lista__buscando {
  font-size: 0.82rem;
  color: var(--texto-suave);
}

.lista__nombre {
  font-weight: 600;
  text-decoration: none;
  color: var(--texto);
}

.lista__nombre:hover {
  color: var(--acento);
  text-decoration: underline;
}

.lista__acciones {
  display: flex;
  gap: 0.4rem;
  justify-content: flex-end;
}

.lista__acciones .boton {
  padding: 0.3rem 0.7rem;
  font-size: 0.82rem;
}

@media (max-width: 560px) {
  .lista__filtro input {
    max-width: none;
  }
}

/* En pantallas chicas: solo lo esencial. El nombre ya enlaza al paciente. */
@media (max-width: 720px) {
  .col-sec {
    display: none;
  }

  .accion-ver {
    display: none;
  }

  .lista__acciones .boton {
    padding: 0.35rem 0.8rem;
  }
}
</style>
