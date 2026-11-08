<script setup lang="ts">
// Formulario de alta y edición de pacientes. `id` null = alta.
const props = defineProps<{ id: number | null }>();
const esAlta = computed(() => props.id === null);

const form = ref({
  cedula: "",
  nombre: "",
  fechaNacimiento: "",
  contacto: "",
  consentimientoFirmado: false,
});
const error = ref("");
const guardando = ref(false);
const cargando = ref(false);

onMounted(async () => {
  if (props.id === null) return;
  cargando.value = true;
  try {
    const p = await $fetch<typeof form.value>(`/api/pacientes/${props.id}`);
    form.value = {
      cedula: p.cedula,
      nombre: p.nombre,
      fechaNacimiento: p.fechaNacimiento,
      contacto: p.contacto,
      consentimientoFirmado: p.consentimientoFirmado,
    };
  } catch {
    error.value = "No se pudo cargar el paciente.";
  } finally {
    cargando.value = false;
  }
});

async function guardar() {
  error.value = "";
  guardando.value = true;
  try {
    if (esAlta.value) {
      const nuevo = await $fetch<{ id: number }>("/api/pacientes", {
        method: "POST",
        body: form.value,
      });
      await navigateTo(`/pacientes/${nuevo.id}`);
    } else {
      await $fetch(`/api/pacientes/${props.id}`, { method: "PUT", body: form.value });
      await navigateTo(`/pacientes/${props.id}`);
    }
  } catch (err: unknown) {
    const detalles = (err as { data?: { detalles?: { fieldErrors?: Record<string, string[]> } } })
      .data?.detalles?.fieldErrors;
    if (detalles) {
      error.value = `Datos inválidos: ${Object.values(detalles).flat().join(" ")}`;
    } else if ((err as { statusCode?: number }).statusCode === 409) {
      error.value = "Ya existe un paciente con esa cédula.";
    } else {
      error.value = "No se pudo guardar. Revisá los datos.";
    }
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <p v-if="cargando" class="mensaje-vacio">Cargando…</p>

  <div v-else class="tarjeta formulario-paciente">
    <form class="formulario" @submit.prevent="guardar">
      <div class="campo">
        <label for="nombre">Nombre completo</label>
        <input id="nombre" v-model="form.nombre" required minlength="2" autocomplete="name" />
      </div>

      <div class="par">
        <div class="campo">
          <label for="cedula">Cédula (7 u 8 dígitos)</label>
          <input id="cedula" v-model="form.cedula" required pattern="\d{7,8}" inputmode="numeric" class="num" />
        </div>
        <div class="campo">
          <label for="fechaNacimiento">Fecha de nacimiento</label>
          <input id="fechaNacimiento" v-model="form.fechaNacimiento" type="date" required />
        </div>
      </div>

      <div class="campo">
        <label for="contacto">Contacto (teléfono, email…)</label>
        <input id="contacto" v-model="form.contacto" autocomplete="tel" />
      </div>

      <label class="checkbox">
        <input v-model="form.consentimientoFirmado" type="checkbox" />
        Consentimiento informado firmado
      </label>

      <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>

      <div class="fila">
        <button type="submit" class="primario" :disabled="guardando">
          {{ guardando ? "Guardando…" : "Guardar" }}
        </button>
        <NuxtLink :to="esAlta ? '/pacientes' : `/pacientes/${id}`" class="boton">Cancelar</NuxtLink>
      </div>
    </form>
  </div>
</template>

<style scoped>
.formulario-paciente {
  padding: 1.5rem;
}

.par {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.9rem;
}

@media (max-width: 520px) {
  .par {
    grid-template-columns: 1fr;
  }
}
</style>
