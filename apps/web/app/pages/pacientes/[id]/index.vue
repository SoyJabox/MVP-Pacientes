<script setup lang="ts">
interface Medicacion {
  id: number;
  medicamento: string;
  dosis: string;
  duracion: string;
  fechaInicio: string;
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

const route = useRoute();
const id = Number(route.params.id);
const usuario = useUsuario();
const esClinico = usuario.value?.rol === "admin" || usuario.value?.rol === "profesional";

const consultas = ref<Consulta[]>([]);
const cargando = ref(true);
const error = ref("");

// Documentos del paciente.
interface Documento {
  id: number;
  nombreArchivo: string;
  fechaSubida: string;
}
const documentos = ref<Documento[]>([]);
const subiendo = ref(false);
const inputArchivo = ref<HTMLInputElement | null>(null);

// Formulario de nueva consulta (solo roles clínicos).
const nueva = ref({ motivo: "", evolucion: "", diagnosticoCie10: "" });
const guardando = ref(false);
const expandeda = ref<number | null>(null); // consulta con formulario de medicación abierto
const nuevaMed = ref({ medicamento: "", dosis: "", duracion: "" });

onMounted(async () => {
  if (!esClinico) {
    cargando.value = false;
    return;
  }
  try {
    consultas.value = await $fetch<Consulta[]>(`/api/consultas/paciente/${id}`);
    documentos.value = await $fetch<Documento[]>(`/api/documentos/paciente/${id}`);
  } catch {
    error.value = "No se pudo cargar la historia clínica.";
  } finally {
    cargando.value = false;
  }
});

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

async function guardarConsulta() {
  guardando.value = true;
  error.value = "";
  try {
    await $fetch("/api/consultas", { method: "POST", body: { pacienteId: id, ...nueva.value } });
    nueva.value = { motivo: "", evolucion: "", diagnosticoCie10: "" };
    consultas.value = await $fetch<Consulta[]>(`/api/consultas/paciente/${id}`);
  } catch (err: unknown) {
    const detalles = (err as { data?: { detalles?: { fieldErrors?: Record<string, string[]> } } }).data?.detalles?.fieldErrors;
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
    await $fetch("/api/medicacion", {
      method: "POST",
      body: { consultaId, ...nuevaMed.value },
    });
    nuevaMed.value = { medicamento: "", dosis: "", duracion: "" };
    expandeda.value = null;
    consultas.value = await $fetch<Consulta[]>(`/api/consultas/paciente/${id}`);
  } catch {
    error.value = "No se pudo registrar la medicación.";
  }
}
</script>

<template>
  <main class="panel">
    <header>
      <h1>Historia clínica</h1>
      <NuxtLink to="/pacientes" class="boton">← Volver</NuxtLink>
    </header>

    <section class="contenido">
      <p v-if="error" role="alert" class="error">{{ error }}</p>

      <template v-if="esClinico">
        <p v-if="cargando">Cargando…</p>

        <form v-else class="nueva-consulta" @submit.prevent="guardarConsulta">
          <h2>Nueva consulta</h2>
          <label for="motivo">Motivo</label>
          <textarea id="motivo" v-model="nueva.motivo" required minlength="3" rows="2" />
          <label for="evolucion">Evolución</label>
          <textarea id="evolucion" v-model="nueva.evolucion" rows="3" />
          <label for="cie10">Diagnóstico CIE-10 (ej: M54.5)</label>
          <input id="cie10" v-model="nueva.diagnosticoCie10" placeholder="M54.5" />
          <button type="submit" class="primario" :disabled="guardando">
            {{ guardando ? "Guardando…" : "Guardar consulta" }}
          </button>
        </form>

        <section class="documentos">
          <h2>Documentos ({{ documentos.length }})</h2>
          <input
            ref="inputArchivo"
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            :disabled="subiendo"
            aria-label="Subir documento"
            @change="subirDocumento"
          />
          <p v-if="subiendo">Subiendo…</p>
          <ul v-if="documentos.length">
            <li v-for="d in documentos" :key="d.id">
              <a :href="`/api/documentos/${d.id}/archivo`" target="_blank" rel="noopener">
                {{ d.nombreArchivo }}
              </a>
              <span class="fecha-doc">{{ new Date(d.fechaSubida).toLocaleDateString("es-UY") }}</span>
            </li>
          </ul>
        </section>

        <h2>Consultas ({{ consultas.length }})</h2>
        <p v-if="!cargando && consultas.length === 0">Sin consultas registradas.</p>

        <article v-for="c in consultas" :key="c.id" class="consulta">
          <div class="cabecera-consulta">
            <strong>{{ new Date(c.fecha).toLocaleDateString("es-UY") }}</strong>
            <span class="diagnostico">{{ c.diagnosticoCie10 || "— sin diagnóstico —" }}</span>
            <span class="profesional">{{ c.profesional }}</span>
          </div>
          <p class="motivo">{{ c.motivo }}</p>
          <p v-if="c.evolucion" class="evolucion">{{ c.evolucion }}</p>

          <div v-if="c.medicacion.length" class="medicacion">
            <h4>Medicación</h4>
            <ul>
              <li v-for="m in c.medicacion" :key="m.id">
                <strong>{{ m.medicamento }}</strong> — {{ m.dosis }}
                <span v-if="m.duracion"> ({{ m.duracion }})</span>
              </li>
            </ul>
          </div>

          <div class="acciones-consulta">
            <button
              v-if="expandeda !== c.id"
              class="boton"
              @click="expandeda = c.id; nuevaMed = { medicamento: '', dosis: '', duracion: '' }"
            >
              + Prescribir medicación
            </button>
            <a :href="`/api/consultas/${c.id}/cda`" target="_blank" rel="noopener" class="boton">
              CDA (XML)
            </a>
          </div>
          <form v-if="expandeda === c.id" class="nueva-med" @submit.prevent="guardarMedicacion(c.id)">
            <input v-model="nuevaMed.medicamento" placeholder="Medicamento" required />
            <input v-model="nuevaMed.dosis" placeholder="Dosis (ej: 1 cápsula cada 8h)" required />
            <input v-model="nuevaMed.duracion" placeholder="Duración (ej: 7 días)" />
            <div class="fila">
              <button type="submit" class="primario">Prescribir</button>
              <button type="button" class="boton" @click="expandeda = null">Cancelar</button>
            </div>
          </form>
        </article>
      </template>

      <p v-else class="aviso">Tu rol no tiene acceso a la historia clínica.</p>
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
h4 { margin: 0 0 0.4rem; font-size: 0.9rem; }
.contenido { padding: 1.5rem; display: grid; gap: 0.5rem; max-width: 760px; }
.nueva-consulta {
  background: #fff; padding: 1.5rem; border-radius: 10px;
  display: grid; gap: 0.4rem; margin-bottom: 1rem;
}
label { font-size: 0.85rem; font-weight: 600; margin-top: 0.5rem; }
input, textarea {
  padding: 0.55rem 0.75rem; border: 1px solid #cdd4db; border-radius: 8px; font-size: 1rem;
  font-family: inherit; resize: vertical;
}
button {
  padding: 0.5rem 1.1rem; border: none; border-radius: 8px; cursor: pointer; font-size: 0.95rem;
}
button.primario { background: #2563eb; color: #fff; font-weight: 600; }
button.primario:hover { background: #1d4fc4; }
button:disabled { opacity: 0.6; cursor: wait; }
.boton {
  border: 1px solid #cdd4db; background: #fff; color: #1c2430; text-decoration: none; font-size: 0.9rem;
}
.boton:hover { background: #f0f2f5; }
.consulta {
  background: #fff; border-radius: 10px; padding: 1.25rem; margin-bottom: 0.75rem;
  display: grid; gap: 0.5rem;
}
.cabecera-consulta { display: flex; gap: 1rem; align-items: baseline; flex-wrap: wrap; }
.diagnostico { color: #2563eb; font-weight: 600; font-size: 0.9rem; }
.profesional { color: #66727f; font-size: 0.85rem; margin-left: auto; }
.motivo { margin: 0; }
.evolucion { margin: 0; color: #3d4652; font-size: 0.93rem; white-space: pre-wrap; }
.medicacion { background: #f7f9fb; border-radius: 8px; padding: 0.9rem; }
.medicacion ul { margin: 0; padding-left: 1.2rem; font-size: 0.93rem; }
.nueva-med { display: grid; gap: 0.5rem; background: #f7f9fb; border-radius: 8px; padding: 0.9rem; }
.fila { display: flex; gap: 0.5rem; }
.error { color: #b42318; }
.aviso { color: #66727f; }
.documentos { background: #fff; border-radius: 10px; padding: 1.25rem; }
.documentos h2 { margin-top: 0; }
.documentos ul { margin: 0.75rem 0 0; padding-left: 1.2rem; font-size: 0.93rem; }
.fecha-doc { color: #66727f; font-size: 0.85rem; margin-left: 0.75rem; }
.acciones-consulta { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.acciones-consulta a.boton { padding: 0.5rem 1.1rem; display: inline-block; }
</style>
