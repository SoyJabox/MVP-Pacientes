<script setup lang="ts">
interface Profesional {
  id: number;
  nombre: string;
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

interface PacienteOpcion {
  id: number;
  nombre: string;
  cedula: string;
}

const usuario = useUsuario();
const esProfesional = computed(() => usuario.value?.rol === "profesional");
const profesionales = ref<Profesional[]>([]);
const profesionalId = ref<number | null>(null);
const fecha = ref(new Date().toISOString().split("T")[0]);
const citas = ref<Cita[]>([]);
const pacientes = ref<PacienteOpcion[]>([]);
const cargando = ref(true);
const error = ref("");

const nueva = ref({ pacienteId: 0, hora: "09:00" });
const creando = ref(false);
const confirmando = ref<number | null>(null); // cita pendiente de confirmar cancelación

onMounted(async () => {
  try {
    [profesionales.value, pacientes.value] = await Promise.all([
      $fetch<Profesional[]>("/api/profesionales"),
      $fetch<PacienteOpcion[]>("/api/pacientes?limit=1000"),
    ]);

    // Arrancar en el propio usuario si es profesional; si no, el primero de la lista.
    // Un profesional solo ve su agenda: no hay selector.
    const propio = profesionales.value.find((p) => p.id === usuario.value?.id);
    profesionalId.value = propio?.id ?? profesionales.value[0]?.id ?? null;
    await cargarCitas();
  } catch {
    error.value = "No se pudo cargar la agenda.";
    cargando.value = false;
  }
});

async function cargarCitas() {
  if (!profesionalId.value) {
    citas.value = [];
    cargando.value = false;
    return;
  }
  cargando.value = true;
  try {
    citas.value = await $fetch<Cita[]>("/api/citas", {
      query: { profesionalId: profesionalId.value, desde: fecha.value },
    });
  } catch {
    error.value = "No se pudieron cargar las citas.";
  } finally {
    cargando.value = false;
  }
}

watch([profesionalId, fecha], cargarCitas);

async function crearCita() {
  error.value = "";
  if (!profesionalId.value || !nueva.value.pacienteId) {
    error.value = "Elegí un paciente y una hora.";
    return;
  }
  creando.value = true;
  try {
    await $fetch("/api/citas", {
      method: "POST",
      body: {
        pacienteId: nueva.value.pacienteId,
        profesionalId: profesionalId.value,
        fechaHora: new Date(`${fecha.value}T${nueva.value.hora}:00`).toISOString(),
      },
    });
    nueva.value = { pacienteId: 0, hora: "09:00" };
    await cargarCitas();
  } catch (err: unknown) {
    error.value = (err as { data?: { error?: string } }).data?.error || "No se pudo crear la cita.";
  } finally {
    creando.value = false;
  }
}

async function marcarAtendida(id: number) {
  error.value = "";
  try {
    await $fetch(`/api/citas/${id}`, { method: "PATCH", body: { estado: "atendida" } });
    await cargarCitas();
  } catch {
    error.value = "No se pudo marcar la cita como atendida.";
  }
}

async function cancelarCita(id: number) {
  error.value = "";
  try {
    await $fetch(`/api/citas/${id}`, { method: "DELETE" });
    confirmando.value = null;
    await cargarCitas();
  } catch {
    error.value = "No se pudo cancelar la cita.";
  }
}

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });

const fechaLegible = computed(() =>
  new Date(`${fecha.value}T12:00:00`).toLocaleDateString("es-UY", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }),
);

const agendadas = computed(() => citas.value.filter((c) => c.estado === "agendada"));
</script>

<template>
  <div class="agenda">
    <header class="agenda__cabecera">
      <div>
        <h1>Agenda</h1>
        <p class="agenda__subtitulo">{{ fechaLegible }}</p>
      </div>

      <div v-if="!esProfesional" class="agenda__filtros">
        <div class="campo">
          <label for="profesional">Profesional</label>
          <select id="profesional" v-model="profesionalId">
            <option v-for="p in profesionales" :key="p.id" :value="p.id">{{ p.nombre }}</option>
          </select>
        </div>
        <div class="campo">
          <label for="fecha">Fecha</label>
          <input id="fecha" v-model="fecha" type="date" />
        </div>
      </div>
    </header>

    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>

    <section class="seccion">
      <div class="seccion__cabecera">
        <h2>Citas del día</h2>
        <span class="etiqueta etiqueta--gris num">{{ agendadas.length }} agendadas</span>
      </div>

      <p v-if="cargando" class="mensaje-vacio">Cargando citas…</p>
      <p v-else-if="citas.length === 0" class="mensaje-vacio">
        No hay citas para esta fecha. Creá una abajo.
      </p>

      <div v-else class="tabla-envoltura">
        <table>
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
            <tr v-for="c in citas" :key="c.id" :class="{ 'fila--cancelada': c.estado === 'cancelada' }">
              <td class="num">{{ hora(c.fechaHora) }}</td>
              <td>
                <NuxtLink :to="`/pacientes/${c.pacienteId}`" class="agenda__paciente">
                  {{ c.pacienteNombre }}
                </NuxtLink>
              </td>
              <td class="num">{{ c.pacienteCedula }}</td>
              <td>
                <span
                  class="etiqueta"
                  :class="c.estado === 'agendada' ? '' : c.estado === 'atendida' ? 'etiqueta--ok' : 'etiqueta--gris'"
                >
                  {{ c.estado }}
                </span>
              </td>
              <td class="agenda__acciones">
                <template v-if="c.estado === 'agendada'">
                  <template v-if="confirmando === c.id">
                    <button class="peligro" @click="cancelarCita(c.id)">Confirmar</button>
                    <button @click="confirmando = null">No</button>
                  </template>
                  <template v-else>
                    <button class="primario" @click="marcarAtendida(c.id)">Atendida</button>
                    <button @click="confirmando = c.id">Cancelar</button>
                  </template>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="tarjeta nueva">
      <h2>Nueva cita</h2>
      <form class="formulario" @submit.prevent="crearCita">
        <div class="nueva__fila">
          <div class="campo">
            <label for="paciente">Paciente</label>
            <select id="paciente" v-model="nueva.pacienteId" required>
              <option :value="0" disabled>Seleccionar paciente…</option>
              <option v-for="p in pacientes" :key="p.id" :value="p.id">
                {{ p.nombre }} — {{ p.cedula }}
              </option>
            </select>
          </div>
          <div class="campo nueva__hora">
            <label for="hora">Hora</label>
            <input id="hora" v-model="nueva.hora" type="time" required />
          </div>
          <button type="submit" class="primario" :disabled="creando">
            {{ creando ? "Creando…" : "Crear cita" }}
          </button>
        </div>
      </form>
    </section>
  </div>
</template>

<style scoped>
.agenda {
  display: grid;
  gap: 1.75rem;
}

.agenda__cabecera {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.agenda__subtitulo {
  color: var(--texto-suave);
  font-size: 0.9rem;
  text-transform: capitalize;
  margin-top: 0.1rem;
}

.agenda__filtros {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.agenda__paciente {
  font-weight: 600;
  text-decoration: none;
  color: var(--texto);
}

.agenda__paciente:hover {
  color: var(--acento);
  text-decoration: underline;
}

.agenda__acciones {
  display: flex;
  gap: 0.35rem;
  justify-content: flex-end;
}

.agenda__acciones button {
  padding: 0.3rem 0.65rem;
  font-size: 0.82rem;
}

.fila--cancelada td {
  opacity: 0.55;
}

.fila--cancelada .agenda__paciente {
  text-decoration: line-through;
}

.nueva h2 {
  margin-bottom: 0.85rem;
}

.nueva__fila {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.nueva__fila .campo:first-child {
  flex: 1;
  min-width: 220px;
}

.nueva__hora input {
  width: 8rem;
}

@media (max-width: 560px) {
  .nueva__fila .campo:first-child {
    min-width: 100%;
  }
  .nueva__fila button {
    width: 100%;
  }
}
</style>
