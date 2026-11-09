<script setup lang="ts">
interface Medicacion {
  id: number;
  medicamento: string;
  dosis: string;
  duracion: string;
}

interface Consulta {
  id: number;
  fecha: string;
  motivo: string;
  evolucion: string;
  diagnosticoCie10: string;
  profesional: string;
  medicacion: Medicacion[];
}

interface Documento {
  id: number;
  nombreArchivo: string;
  fechaSubida: string;
}

const route = useRoute();
const id = Number(route.params.id);
const usuario = useUsuario();
const esClinico = computed(
  () => usuario.value?.rol === "admin" || usuario.value?.rol === "profesional",
);

const paciente = ref<{ nombre: string; cedula: string; fechaNacimiento: string } | null>(null);
const consultas = ref<Consulta[]>([]);
const documentos = ref<Documento[]>([]);
const cargando = ref(true);
const error = ref("");
const noEncontrado = ref(false);

const nueva = ref({ motivo: "", evolucion: "", diagnosticoCie10: "" });
const guardando = ref(false);
const expandida = ref<number | null>(null);
const nuevaMed = ref({ medicamento: "", dosis: "", duracion: "" });
const subiendo = ref(false);

async function cargarTodo() {
  if (!esClinico.value) {
    cargando.value = false;
    return;
  }
  try {
    [consultas.value, documentos.value] = await Promise.all([
      $fetch<Consulta[]>(`/api/consultas/paciente/${id}`),
      $fetch<Documento[]>(`/api/documentos/paciente/${id}`),
    ]);
  } catch {
    error.value = "No se pudo cargar la historia clínica.";
  } finally {
    cargando.value = false;
  }
}

onMounted(async () => {
  // El paciente sí lo puede ver recepción: son datos administrativos.
  try {
    paciente.value = await $fetch<typeof paciente.value>(`/api/pacientes/${id}`);
  } catch {
    noEncontrado.value = true;
    cargando.value = false;
    return;
  }
  await cargarTodo();
});

async function guardarConsulta() {
  error.value = "";
  guardando.value = true;
  try {
    await $fetch("/api/consultas", { method: "POST", body: { pacienteId: id, ...nueva.value } });
    nueva.value = { motivo: "", evolucion: "", diagnosticoCie10: "" };
    await cargarTodo();
  } catch (err: unknown) {
    const detalles = (err as { data?: { detalles?: { fieldErrors?: Record<string, string[]> } } })
      .data?.detalles?.fieldErrors;
    error.value = detalles
      ? `Datos inválidos: ${Object.values(detalles).flat().join(" ")}`
      : "No se pudo guardar la consulta.";
  } finally {
    guardando.value = false;
  }
}

async function guardarMedicacion(consultaId: number) {
  error.value = "";
  try {
    await $fetch("/api/medicacion", { method: "POST", body: { consultaId, ...nuevaMed.value } });
    nuevaMed.value = { medicamento: "", dosis: "", duracion: "" };
    expandida.value = null;
    await cargarTodo();
  } catch {
    error.value = "No se pudo registrar la medicación.";
  }
}

const eliminarDoc = async (docId: number) => {
  if (!confirm("¿Eliminar este documento? Esta acción no se puede deshacer.")) return;
  error.value = "";
  try {
    await $fetch(`/api/documentos/${docId}`, { method: "DELETE" });
    documentos.value = await $fetch<Documento[]>(`/api/documentos/paciente/${id}`);
  } catch {
    error.value = "No se pudo eliminar el documento.";
  }
};

const darDeBaja = async () => {
  if (!confirm("¿Dar de baja a este paciente? Su historia clínica se conserva, pero deja de listar.")) return;
  error.value = "";
  try {
    await $fetch(`/api/pacientes/${id}`, { method: "DELETE" });
    await navigateTo("/pacientes");
  } catch {
    error.value = "No se pudo dar de baja al paciente.";
  }
};

async function subirDocumento(event: Event) {
  const input = event.target as HTMLInputElement;
  const archivo = input.files?.[0];
  if (!archivo) return;

  subiendo.value = true;
  error.value = "";
  const body = new FormData();
  body.append("pacienteId", String(id));
  body.append("archivo", archivo);

  try {
    await $fetch("/api/documentos", { method: "POST", body });
    documentos.value = await $fetch<Documento[]>(`/api/documentos/paciente/${id}`);
    input.value = "";
  } catch (err: unknown) {
    error.value = (err as { data?: { error?: string } }).data?.error || "No se pudo subir el documento.";
  } finally {
    subiendo.value = false;
  }
}

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" });

const edad = computed(() => {
  if (!paciente.value?.fechaNacimiento) return null;
  const n = new Date(paciente.value.fechaNacimiento);
  const hoy = new Date();
  let a = hoy.getFullYear() - n.getFullYear();
  const m = hoy.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < n.getDate())) a--;
  return a;
});
</script>

<template>
  <div class="historia">
    <header class="historia__cabecera">
      <div>
        <NuxtLink to="/pacientes" class="historia__volver">← Pacientes</NuxtLink>
        <h1>{{ paciente?.nombre || "Historia clínica" }}</h1>
        <p v-if="paciente" class="historia__meta num">
          CI {{ paciente.cedula }}
          <template v-if="edad !== null"> · {{ edad }} años</template>
        </p>
      </div>
      <div class="fila">
        <NuxtLink v-if="paciente" :to="`/pacientes/${id}/editar`" class="boton">Editar datos</NuxtLink>
        <button v-if="paciente" class="peligro" @click="darDeBaja">Dar de baja</button>
      </div>
    </header>

    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>

    <div v-if="noEncontrado" class="tarjeta no-encontrado">
      <h2>Paciente no encontrado</h2>
      <p class="historia__ayuda">El paciente no existe o fue dado de baja.</p>
      <NuxtLink to="/pacientes" class="boton">Volver a la lista</NuxtLink>
    </div>

    <!-- Recepción: solo datos administrativos, sin contenido clínico. -->
    <p v-else-if="!esClinico" class="mensaje-vacio">
      Tu rol no tiene acceso a la historia clínica. Podés editar los datos administrativos del paciente.
    </p>

    <template v-else>
      <p v-if="cargando" class="mensaje-vacio">Cargando historia clínica…</p>

      <template v-else>
        <div class="historia__columnas">
          <!-- Columna clínica -->
          <div class="historia__principal">
            <section class="tarjeta">
              <h2>Nueva consulta</h2>
              <form class="formulario" @submit.prevent="guardarConsulta">
                <div class="campo">
                  <label for="motivo">Motivo de consulta</label>
                  <textarea id="motivo" v-model="nueva.motivo" required minlength="3" rows="2" />
                </div>
                <div class="campo">
                  <label for="evolucion">Evolución</label>
                  <textarea id="evolucion" v-model="nueva.evolucion" rows="3" />
                </div>
                <div class="campo">
                  <label for="cie10">Diagnóstico CIE-10</label>
                  <input id="cie10" v-model="nueva.diagnosticoCie10" placeholder="M54.5" class="num" />
                </div>
                <div class="fila">
                  <button type="submit" class="primario" :disabled="guardando">
                    {{ guardando ? "Guardando…" : "Guardar consulta" }}
                  </button>
                </div>
              </form>
            </section>

            <section class="seccion">
              <div class="seccion__cabecera">
                <h2>Consultas</h2>
                <span class="etiqueta etiqueta--gris num">{{ consultas.length }}</span>
              </div>

              <p v-if="consultas.length === 0" class="mensaje-vacio">
                Sin consultas registradas todavía.
              </p>

              <article v-for="c in consultas" :key="c.id" class="tarjeta consulta">
                <div class="consulta__cabecera">
                  <span class="consulta__fecha num">{{ fechaCorta(c.fecha) }}</span>
                  <span v-if="c.diagnosticoCie10" class="etiqueta">{{ c.diagnosticoCie10 }}</span>
                  <span v-else class="etiqueta etiqueta--gris">sin diagnóstico</span>
                  <span class="consulta__prof">{{ c.profesional }}</span>
                </div>

                <p class="consulta__motivo">{{ c.motivo }}</p>
                <p v-if="c.evolucion" class="consulta__evolucion">{{ c.evolucion }}</p>

                <div v-if="c.medicacion.length" class="consulta__meds">
                  <h4>Medicación</h4>
                  <ul>
                    <li v-for="m in c.medicacion" :key="m.id">
                      <strong>{{ m.medicamento }}</strong> — {{ m.dosis }}
                      <span v-if="m.duracion"> · {{ m.duracion }}</span>
                    </li>
                  </ul>
                </div>

                <div class="consulta__acciones">
                  <button
                    v-if="expandida !== c.id"
                    class="boton"
                    @click="expandida = c.id; nuevaMed = { medicamento: '', dosis: '', duracion: '' }"
                  >
                    + Medicación
                  </button>
                  <a :href="`/api/consultas/${c.id}/cda`" target="_blank" rel="noopener" class="boton">
                    CDA (XML)
                  </a>
                </div>

                <form
                  v-if="expandida === c.id"
                  class="consulta__nueva-med"
                  @submit.prevent="guardarMedicacion(c.id)"
                >
                  <input v-model="nuevaMed.medicamento" placeholder="Medicamento" required />
                  <input v-model="nuevaMed.dosis" placeholder="Dosis (1 cápsula cada 8h)" required />
                  <input v-model="nuevaMed.duracion" placeholder="Duración (7 días)" />
                  <div class="fila">
                    <button type="submit" class="primario">Prescribir</button>
                    <button type="button" class="boton" @click="expandida = null">Cancelar</button>
                  </div>
                </form>
              </article>
            </section>
          </div>

          <!-- Columna de documentos -->
          <aside class="historia__lateral">
            <section class="tarjeta">
              <h2>Documentos</h2>
              <p class="historia__ayuda">PDF, PNG o JPG hasta 20 MB.</p>
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                :disabled="subiendo"
                aria-label="Subir documento"
                @change="subirDocumento"
              />
              <p v-if="subiendo" class="historia__ayuda">Subiendo…</p>

              <ul v-if="documentos.length" class="docs">
                <li v-for="d in documentos" :key="d.id" class="docs__fila">
                  <a :href="`/api/documentos/${d.id}/archivo`" target="_blank" rel="noopener">
                    {{ d.nombreArchivo }}
                  </a>
                  <span class="docs__fecha num">{{ fechaCorta(d.fechaSubida) }}</span>
                  <button class="peligro docs__eliminar" @click="eliminarDoc(d.id)">Eliminar</button>
                </li>
              </ul>
              <p v-else class="historia__ayuda">Sin documentos.</p>
            </section>
          </aside>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.historia {
  display: grid;
  gap: 1.5rem;
}

.historia__cabecera {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.historia__volver {
  display: inline-block;
  margin-bottom: 0.35rem;
  font-size: 0.85rem;
  text-decoration: none;
  color: var(--texto-suave);
}

.historia__volver:hover {
  color: var(--acento);
}

.historia__meta {
  color: var(--texto-suave);
  font-size: 0.9rem;
  margin-top: 0.15rem;
}

.historia__columnas {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 1.5rem;
  align-items: start;
  min-width: 0;
}

.historia__principal {
  display: grid;
  gap: 1.5rem;
  min-width: 0;
}

.historia__lateral {
  display: grid;
  gap: 1rem;
  position: sticky;
  top: 4.5rem;
  min-width: 0;
}

.no-encontrado {
  display: grid;
  gap: 0.6rem;
  justify-items: start;
  max-width: 420px;
}

.historia__ayuda {
  font-size: 0.82rem;
  color: var(--texto-suave);
  margin: 0.5rem 0;
}

.tarjeta h2 {
  margin-bottom: 0.9rem;
}

.consulta {
  display: grid;
  gap: 0.6rem;
  padding: 1.1rem 1.25rem;
}

.consulta__cabecera {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.consulta__fecha {
  font-weight: 650;
  font-size: 0.9rem;
}

.consulta__prof {
  margin-left: auto;
  color: var(--texto-suave);
  font-size: 0.8rem;
}

.consulta__motivo {
  font-weight: 550;
}

.consulta__evolucion {
  color: var(--texto-suave);
  font-size: 0.92rem;
  white-space: pre-wrap;
}

.consulta__meds {
  background: var(--superficie-alt);
  border-radius: var(--radio-chico);
  padding: 0.7rem 0.9rem;
}

.consulta__meds ul {
  margin: 0.35rem 0 0;
  padding-left: 1.1rem;
  font-size: 0.9rem;
}

.consulta__acciones {
  display: flex;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.consulta__acciones .boton {
  padding: 0.35rem 0.75rem;
  font-size: 0.82rem;
}

.consulta__nueva-med {
  display: grid;
  gap: 0.5rem;
  background: var(--superficie-alt);
  border-radius: var(--radio-chico);
  padding: 0.9rem;
}

.docs {
  list-style: none;
  margin: 0.75rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
  font-size: 0.88rem;
}

.docs li {
  display: grid;
}

.docs__fila {
  gap: 0.15rem;
}

.docs__eliminar {
  justify-self: start;
  padding: 0.2rem 0.55rem;
  font-size: 0.78rem;
  margin-top: 0.2rem;
}

.docs a {
  overflow-wrap: anywhere;
}

.docs__fecha {
  color: var(--texto-suave);
  font-size: 0.78rem;
}

@media (max-width: 880px) {
  .historia__columnas {
    grid-template-columns: minmax(0, 1fr);
  }

  .historia__lateral {
    position: static;
  }
}
</style>
