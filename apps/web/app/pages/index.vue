<script setup lang="ts">
const usuario = useUsuario();

interface Cita {
  id: number;
  fechaHora: string;
  estado: string;
  pacienteNombre: string;
  pacienteCedula: string;
}

const citasHoy = ref<Cita[]>([]);
const totalPacientes = ref<number | null>(null);
const cargando = ref(true);


onMounted(async () => {
  try {
    const hoy = new Date().toISOString().split("T")[0];
    const [pacientes, citas] = await Promise.all([
      $fetch<unknown[]>("/api/pacientes"),
      usuario.value ? $fetch<Cita[]>("/api/citas", { query: { profesionalId: usuario.value.id, desde: hoy } }) : [],
    ]);
    totalPacientes.value = pacientes.length;
    citasHoy.value = citas;
  } catch {
    // El resumen es informativo: si falla, la navegación sigue disponible.
  } finally {
    cargando.value = false;
  }
});

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });
</script>

<template>
  <div class="inicio">
    <header class="inicio__cabecera">
      <h1>Hola{{ usuario ? `, ${usuario.email.split("@")[0]}` : "" }}</h1>
      <p class="inicio__fecha num">
        {{ new Date().toLocaleDateString("es-UY", { weekday: "long", day: "numeric", month: "long" }) }}
      </p>
    </header>

    <div class="resumen">
      <NuxtLink to="/pacientes" class="resumen__tarjeta">
        <span class="resumen__valor num">{{ totalPacientes ?? "—" }}</span>
        <span class="resumen__rotulo">Pacientes registrados</span>
      </NuxtLink>

      <NuxtLink to="/agenda" class="resumen__tarjeta">
        <span class="resumen__valor num">{{ citasHoy.length }}</span>
        <span class="resumen__rotulo">Citas hoy</span>
      </NuxtLink>
    </div>

    <section class="seccion">
      <div class="seccion__cabecera">
        <h2>Agenda de hoy</h2>
        <NuxtLink to="/agenda" class="boton">Ir a la agenda</NuxtLink>
      </div>

      <p v-if="cargando" class="mensaje-vacio">Cargando…</p>
      <p v-else-if="citasHoy.length === 0" class="mensaje-vacio">
        No hay citas agendadas para hoy.
      </p>

      <div v-else class="tabla-envoltura">
        <table>
          <thead>
            <tr>
              <th scope="col">Hora</th>
              <th scope="col">Paciente</th>
              <th scope="col">Cédula</th>
              <th scope="col">Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in citasHoy" :key="c.id">
              <td class="num">{{ hora(c.fechaHora) }}</td>
              <td>{{ c.pacienteNombre }}</td>
              <td class="num">{{ c.pacienteCedula }}</td>
              <td>
                <span class="etiqueta" :class="c.estado === 'cancelada' ? 'etiqueta--gris' : 'etiqueta--ok'">
                  {{ c.estado }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.inicio {
  display: grid;
  gap: 1.75rem;
}

.inicio__cabecera {
  display: grid;
  gap: 0.2rem;
}

.inicio__fecha {
  color: var(--texto-suave);
  font-size: 0.9rem;
  text-transform: capitalize;
}

.resumen {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.9rem;
}

.resumen__tarjeta {
  display: grid;
  gap: 0.15rem;
  padding: 1.1rem 1.25rem;
  background: var(--superficie);
  border: 1px solid var(--borde);
  border-radius: var(--radio);
  text-decoration: none;
  color: inherit;
  box-shadow: var(--sombra);
  transition: border-color var(--transicion);
}

.resumen__tarjeta:hover {
  border-color: var(--acento);
}

.resumen__valor {
  font-size: 1.6rem;
  font-weight: 680;
  letter-spacing: -0.03em;
  line-height: 1.1;
  color: var(--acento);
}

.resumen__rotulo {
  font-size: 0.82rem;
  color: var(--texto-suave);
}
</style>
