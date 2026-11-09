<script setup lang="ts">
interface Fila {
  id: number;
  timestamp: string;
  accion: string;
  entidadAfectada: string;
  entidadId: number | null;
  usuario: string;
}

const usuario = useUsuario();
const filas = ref<Fila[]>([]);
const cargando = ref(true);
const error = ref("");
const filtroEntidad = ref("");
const filtroEntidadId = ref("");

const entidades = ["pacientes", "citas", "consultas", "medicacion", "documentos", "usuarios"];

async function cargar() {
  cargando.value = true;
  error.value = "";
  const query: Record<string, string> = { limit: "200" };
  if (filtroEntidad.value) query.entidad = filtroEntidad.value;
  if (filtroEntidadId.value.trim()) query.entidadId = filtroEntidadId.value.trim();
  try {
    filas.value = await $fetch<Fila[]>("/api/auditoria", { query });
  } catch {
    error.value = "No se pudo leer la auditoría.";
  } finally {
    cargando.value = false;
  }
}

onMounted(async () => {
  if (usuario.value?.rol !== "admin") {
    error.value = "Solo el administrador consulta la auditoría.";
    cargando.value = false;
    return;
  }
  await cargar();
});

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
</script>

<template>
  <div class="auditoria">
    <header>
      <h1>Auditoría</h1>
      <p class="auditoria__sub">
        Registro de cada acceso y modificación sobre datos del consultorio. Solo el administrador lo consulta.
      </p>
    </header>

    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>

    <template v-if="usuario?.rol === 'admin'">
      <form class="auditoria__filtros" @submit.prevent="cargar">
        <div class="campo">
          <label for="entidad">Entidad</label>
          <select id="entidad" v-model="filtroEntidad">
            <option value="">Todas</option>
            <option v-for="e in entidades" :key="e" :value="e">{{ e }}</option>
          </select>
        </div>
        <div class="campo">
          <label for="entidadId">ID de la entidad</label>
          <input id="entidadId" v-model="filtroEntidadId" inputmode="numeric" placeholder="p. ej. 12" class="num" />
        </div>
        <button type="submit" class="primario">Filtrar</button>
      </form>

      <p v-if="cargando" class="mensaje-vacio">Cargando…</p>
      <p v-else-if="filas.length === 0" class="mensaje-vacio">Sin registros con ese filtro.</p>

      <div v-else class="tabla-envoltura">
        <table>
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Usuario</th>
              <th scope="col">Acción</th>
              <th scope="col">Entidad</th>
              <th scope="col">ID</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in filas" :key="f.id">
              <td class="num">{{ fecha(f.timestamp) }}</td>
              <td>{{ f.usuario }}</td>
              <td><span class="etiqueta">{{ f.accion }}</span></td>
              <td>{{ f.entidadAfectada }}</td>
              <td class="num">{{ f.entidadId ?? "—" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<style scoped>
.auditoria {
  display: grid;
  gap: 1.25rem;
}

.auditoria__sub {
  color: var(--texto-suave);
  font-size: 0.9rem;
  margin-top: 0.2rem;
  max-width: 60ch;
}

.auditoria__filtros {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.auditoria__filtros .campo {
  min-width: 160px;
}
</style>
