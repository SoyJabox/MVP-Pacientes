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

interface Metricas {
  totalPacientes: number;
  citasProximas24h: number;
  citasProximas7dias: number;
  cie10Frecuentes: { cie10: string; n: number }[];
  consultasPorProfesional: { profesional: string; n: number }[];
}
const esClinico = computed(() => usuario.value?.rol === "admin" || usuario.value?.rol === "profesional");
const metricas = ref<Metricas | null>(null);

onMounted(async () => {
  try {
    const hoy = new Date().toISOString().split("T")[0];
    const [pacientes, citas] = await Promise.all([
      $fetch<unknown[]>("/api/pacientes"),
      usuario.value ? $fetch<Cita[]>("/api/citas", { query: { profesionalId: usuario.value.id, desde: hoy } }) : [],
    ]);
    totalPacientes.value = pacientes.length;
    citasHoy.value = citas;
    if (esClinico.value) {
      metricas.value = await $fetch<Metricas>("/api/estadisticas").catch(() => null);
    }
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

    <div v-if="metricas" class="resumen">
      <div class="resumen__tarjeta resumen__tarjeta--fija">
        <span class="resumen__valor num">{{ metricas.citasProximas24h }}</span>
        <span class="resumen__rotulo">Citas próximas 24 h</span>
      </div>
      <div class="resumen__tarjeta resumen__tarjeta--fija">
        <span class="resumen__valor num">{{ metricas.citasProximas7dias }}</span>
        <span class="resumen__rotulo">Citas próximos 7 días</span>
      </div>
      <div class="resumen__tarjeta resumen__tarjeta--fija">
        <span class="resumen__rotulo resumen__rotulo--marca">CIE-10 frecuentes</span>
        <ul class="metricas__lista">
          <li v-for="c in metricas.cie10Frecuentes" :key="c.cie10">
            <span class="num">{{ c.cie10 }}</span><span class="num">{{ c.n }}</span>
          </li>
        </ul>
      </div>
      <div class="resumen__tarjeta resumen__tarjeta--fija">
        <span class="resumen__rotulo resumen__rotulo--marca">Consultas por profesional</span>
        <ul class="metricas__lista">
          <li v-for="c in metricas.consultasPorProfesional" :key="c.profesional">
            <span>{{ c.profesional }}</span><span class="num">{{ c.n }}</span>
          </li>
        </ul>
      </div>
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

.resumen__tarjeta--fija {
  cursor: default;
}

.resumen__rotulo--marca {
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 0.72rem;
}

.metricas__lista {
  list-style: none;
  margin: 0.35rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.25rem;
  font-size: 0.88rem;
}

.metricas__lista li {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
}
</style>
