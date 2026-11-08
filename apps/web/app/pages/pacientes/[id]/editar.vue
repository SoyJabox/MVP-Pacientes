<script setup lang="ts">
const route = useRoute();
const id = Number(route.params.id);
</script>

<template>
  <div class="edicion">
    <header>
      <NuxtLink :to="`/pacientes/${id}`" class="volver">← Historia clínica</NuxtLink>
      <h1>Editar paciente</h1>
    </header>
    <FormularioPaciente :id="id" />
  </div>
</template>

<style scoped>
.edicion {
  display: grid;
  gap: 1.25rem;
  max-width: 560px;
}

.volver {
  display: inline-block;
  margin-bottom: 0.35rem;
  font-size: 0.85rem;
  text-decoration: none;
  color: var(--texto-suave);
}

.volver:hover {
  color: var(--acento);
}
</style>
