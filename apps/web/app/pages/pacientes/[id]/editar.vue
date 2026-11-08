<script setup lang="ts">
// Una sola página para alta (id = "nuevo") y edición (id numérico).
const route = useRoute();
const esAlta = route.params.id === "nuevo";
const id = esAlta ? null : Number(route.params.id);

const form = ref({ cedula: "", nombre: "", fechaNacimiento: "", contacto: "", consentimientoFirmado: false });
const error = ref("");
const guardando = ref(false);

onMounted(async () => {
  if (id) {
    try {
      const p = await $fetch<typeof form.value & { activo?: boolean }>(`/api/pacientes/${id}`);
      form.value = {
        cedula: p.cedula,
        nombre: p.nombre,
        fechaNacimiento: p.fechaNacimiento,
        contacto: p.contacto,
        consentimientoFirmado: p.consentimientoFirmado,
      };
    } catch {
      error.value = "No se pudo cargar el paciente.";
    }
  }
});

async function guardar() {
  error.value = "";
  guardando.value = true;
  try {
    if (esAlta) {
      await $fetch("/api/pacientes", { method: "POST", body: form.value });
    } else {
      await $fetch(`/api/pacientes/${id}`, { method: "PUT", body: form.value });
    }
    await navigateTo("/pacientes");
  } catch (err: unknown) {
    const detalles = (err as { data?: { detalles?: { fieldErrors?: Record<string, string[]> } } }).data?.detalles?.fieldErrors;
    if (detalles) {
      const msgs = Object.values(detalles).flat().join(" ");
      error.value = `Datos inválidos: ${msgs}`;
    } else if ((err as { statusCode?: number }).statusCode === 409) {
      error.value = "Ya existe un paciente con esa cédula.";
    } else {
      error.value = "No se pudo guardar. Verificá los datos.";
    }
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <main class="panel">
    <header>
      <h1>{{ esAlta ? "Nuevo paciente" : "Editar paciente" }}</h1>
    </header>

    <form class="form" @submit.prevent="guardar">
      <label for="nombre">Nombre completo</label>
      <input id="nombre" v-model="form.nombre" required minlength="2" />

      <label for="cedula">Cédula (7 u 8 dígitos)</label>
      <input id="cedula" v-model="form.cedula" required pattern="\d{7,8}" inputmode="numeric" />

      <label for="fechaNacimiento">Fecha de nacimiento</label>
      <input id="fechaNacimiento" v-model="form.fechaNacimiento" type="date" required />

      <label for="contacto">Contacto (teléfono, email…)</label>
      <input id="contacto" v-model="form.contacto" />

      <label class="checkbox">
        <input v-model="form.consentimientoFirmado" type="checkbox" />
        Consentimiento informado firmado
      </label>

      <p v-if="error" role="alert" class="error">{{ error }}</p>

      <div class="fila-botones">
        <button type="submit" class="primario" :disabled="guardando">
          {{ guardando ? "Guardando…" : "Guardar" }}
        </button>
        <NuxtLink to="/pacientes" class="boton">Cancelar</NuxtLink>
      </div>
    </form>
  </main>
</template>

<style scoped>
.panel { min-height: 100vh; font-family: system-ui, sans-serif; color: #1c2430; background: #f3f5f7; }
header { padding: 0.75rem 1.5rem; background: #fff; border-bottom: 1px solid #dfe3e8; }
h1 { font-size: 1.1rem; margin: 0; }
.form {
  padding: 1.5rem; display: grid; gap: 0.4rem;
  max-width: 420px;
}
label { font-size: 0.85rem; font-weight: 600; margin-top: 0.75rem; }
input:not([type="checkbox"]) {
  padding: 0.55rem 0.75rem; border: 1px solid #cdd4db; border-radius: 8px; font-size: 1rem;
}
input:focus-visible, button:focus-visible, a:focus-visible { outline: 2px solid #2563eb; outline-offset: 1px; }
.checkbox { display: flex; align-items: center; gap: 0.5rem; margin-top: 1rem; font-weight: 500; }
.fila-botones { display: flex; gap: 0.75rem; margin-top: 1.5rem; }
button {
  padding: 0.55rem 1.2rem; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem; font-weight: 600;
}
button.primario { background: #2563eb; color: #fff; }
button.primario:hover { background: #1d4fc4; }
button:disabled { opacity: 0.6; cursor: wait; }
.boton {
  padding: 0.55rem 1rem; border: 1px solid #cdd4db; border-radius: 8px;
  background: #fff; text-decoration: none; color: #1c2430; font-size: 1rem; align-self: center;
}
.error { color: #b42318; font-size: 0.9rem; margin-top: 0.5rem; }
</style>
