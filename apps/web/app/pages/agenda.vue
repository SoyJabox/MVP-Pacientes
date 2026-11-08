<script setup lang="ts">
interface Profesional {
  id: number;
  email: string;
}

interface Cita {
  id: number;
  pacienteId: number;
  profesionalId: number;
  fechaHora: string;
  estado: string;
  pacienteNombre: string;
  pacienteCedula: string;
}

const profesionales = ref<Profesional[]>([]);
const profesionalId = ref<number | null>(null);
const fecha = ref(new Date().toISOString().split("T")[0]);
const citas = ref<Cita[]>([]);
const cargando = ref(false);
const error = ref("");

// Formulario de nueva cita.
const nuevaCita = ref({
  pacienteId: 0,
  fechaHora: "",
  hora: "09:00",
});
const pacientesDisponibles = ref<{ id: number; nombre: string; cedula: string }[]>([]);
const creando = ref(false);

onMounted(async () => {
  try {
    profesionales.value = await $fetch<Profesional[]>("/api/profesionales");
    if (profesionales.value.length > 0) {
      profesionalId.value = profesionales.value[0].id;
      await cargarCitas();
    }
    // Cargar pacientes para el selector.
    pacientesDisponibles.value = await $fetch<{ id: number; nombre: string; cedula: string }[]>("/api/pacientes");
  } catch {
    error.value = "No se pudo cargar la agenda.";
  }
});

async function cargarCitas() {
  if (!profesionalId.value) return;
  cargando.value = true;
  error.value = "";
  try {
    citas.value = await $fetch<Cita[]>("/api/citas", {
      query: { profesionalId: profesionalId.value, desde: fecha.value },
    });
  } catch {
    error.value = "No se pudo cargar las citas.";
  } finally {
    cargando.value = false;
  }
}

watch([profesionalId, fecha], cargarCitas);

async function crearCita() {
  if (!profesionalId.value || !nuevaCita.value.pacienteId || !nuevaCita.value.hora) {
    error.value = "Completá todos los campos.";
    return;
  }
  creando.value = true;
  error.value = "";
  try {
    const fechaHora = new Date(`${fecha.value}T${nuevaCita.value.hora}:00`).toISOString();
    await $fetch("/api/citas", {
      method: "POST",
      body: {
        pacienteId: nuevaCita.value.pacienteId,
        profesionalId: profesionalId.value,
        fechaHora,
      },
    });
    nuevaCita.value = { pacienteId: 0, fechaHora: "", hora: "09:00" };
    await cargarCitas();
  } catch (err: unknown) {
    const msg = (err as { data?: { error?: string } }).data?.error;
    error.value = msg || "No se pudo crear la cita.";
  } finally {
    creando.value = false;
  }
}

async function cancelarCita(id: number) {
  if (!confirm("¿Cancelar esta cita?")) return;
  try {
    await $fetch(`/api/citas/${id}`, { method: "DELETE" });
    await cargarCitas();
  } catch {
    error.value = "No se pudo cancelar la cita.";
  }
}

function formatearHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });
}
</script>

<template>
  <main class="panel">
    <header>
      <h1>Agenda</h1>
    </header>

    <section class="contenido">
      <div class="filtros">
        <label for="profesional">Profesional</label>
        <select id="profesional" v-model="profesionalId">
          <option v-for="p in profesionales" :key="p.id" :value="p.id">{{ p.email }}</option>
        </select>

        <label for="fecha">Fecha</label>
        <input id="fecha" v-model="fecha" type="date" />
      </div>

      <p v-if="error" role="alert" class="error">{{ error }}</p>
      <p v-else-if="cargando">Cargando citas…</p>

      <div v-else class="agenda">
        <h2>Citas del día ({{ citas.length }})</h2>

        <table v-if="citas.length">
          <thead>
            <tr>
              <th scope="col">Hora</th>
              <th scope="col">Paciente</th>
              <th scope="col">Cédula</th>
              <th scope="col">Estado</th>
              <th scope="col"><span class="visualmente-oculto">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in citas" :key="c.id" :class="{ cancelada: c.estado === 'cancelada' }">
              <td>{{ formatearHora(c.fechaHora) }}</td>
              <td>{{ c.pacienteNombre }}</td>
              <td>{{ c.pacienteCedula }}</td>
              <td>{{ c.estado }}</td>
              <td>
                <button
                  v-if="c.estado === 'agendada'"
                  class="boton peligro"
                  @click="cancelarCita(c.id)"
                >
                  Cancelar
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <p v-else>No hay citas para esta fecha.</p>

        <form class="nueva-cita" @submit.prevent="crearCita">
          <h3>Nueva cita</h3>
          <label for="paciente">Paciente</label>
          <select id="paciente" v-model="nuevaCita.pacienteId" required>
            <option :value="0" disabled>Seleccionar paciente…</option>
            <option v-for="p in pacientesDisponibles" :key="p.id" :value="p.id">
              {{ p.nombre }} ({{ p.cedula }})
            </option>
          </select>

          <label for="hora">Hora</label>
          <input id="hora" v-model="nuevaCita.hora" type="time" required />

          <button type="submit" class="primario" :disabled="creando">
            {{ creando ? "Creando…" : "Crear cita" }}
          </button>
        </form>
      </div>
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
h2 { font-size: 1rem; margin: 1.5rem 0 0.75rem; }
h3 { font-size: 0.95rem; margin: 0 0 0.75rem; }
.contenido { padding: 1.5rem; display: grid; gap: 1rem; }
.filtros {
  display: flex; gap: 1rem; align-items: end; flex-wrap: wrap;
}
.filtros label { display: grid; gap: 0.3rem; font-size: 0.85rem; font-weight: 600; }
select, input[type="date"], input[type="time"] {
  padding: 0.55rem 0.75rem; border: 1px solid #cdd4db; border-radius: 8px; font-size: 1rem;
  background: #fff;
}
table { border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; width: 100%; }
th, td { padding: 0.6rem 1rem; text-align: left; border-bottom: 1px solid #eef1f4; font-size: 0.93rem; }
th { background: #f7f9fb; font-weight: 600; }
tr.cancelada { opacity: 0.5; text-decoration: line-through; }
.boton {
  padding: 0.4rem 0.9rem; border: 1px solid #cdd4db; border-radius: 8px;
  background: #fff; cursor: pointer; font-size: 0.9rem;
}
.boton:hover { background: #f0f2f5; }
.boton.peligro { border-color: #dc2626; color: #dc2626; }
.boton.peligro:hover { background: #fef2f2; }
.boton.primario {
  background: #2563eb; border-color: #2563eb; color: #fff; font-weight: 600;
  padding: 0.55rem 1.2rem; margin-top: 0.75rem;
}
.boton.primario:hover { background: #1d4fc4; }
.boton:disabled { opacity: 0.6; cursor: wait; }
.nueva-cita {
  background: #fff; padding: 1.5rem; border-radius: 10px; margin-top: 2rem;
  display: grid; gap: 0.4rem; max-width: 400px;
}
.nueva-cita label { font-size: 0.85rem; font-weight: 600; margin-top: 0.75rem; }
.error { color: #b42318; }
.visualmente-oculto { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
</style>
