<template>
  <div class="alta">
    <header>
      <NuxtLink to="/pacientes" class="volver">← Pacientes</NuxtLink>
      <h1>Nuevo paciente</h1>
    </header>
    <FormularioPaciente :id="null" />
  </div>
</template>

<style scoped>
.alta {
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
