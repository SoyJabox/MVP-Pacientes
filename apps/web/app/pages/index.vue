<script setup lang="ts">
const usuario = useUsuario();

async function salir() {
  await $fetch("/api/auth/logout", { method: "POST" });
  useUsuario().value = null;
  await navigateTo("/login");
}
</script>

<template>
  <main class="panel">
    <header>
      <h1>Gestor de Pacientes</h1>
      <div v-if="usuario" class="sesión">
        <span>{{ usuario.email }} · {{ usuario.rol }}</span>
        <button @click="salir">Salir</button>
      </div>
    </header>
    <section class="contenido">
      <p>Sesión iniciada. Las pantallas de pacientes y agenda llegan en las próximas fases.</p>
    </section>
  </main>
</template>

<style scoped>
.panel {
  min-height: 100vh;
  font-family: system-ui, sans-serif;
  color: #1c2430;
  background: #f3f5f7;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.5rem;
  background: #fff;
  border-bottom: 1px solid #dfe3e8;
}
h1 { font-size: 1.1rem; margin: 0; }
.sesión { display: flex; align-items: center; gap: 0.75rem; font-size: 0.9rem; }
button {
  padding: 0.4rem 0.9rem;
  border: 1px solid #cdd4db;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}
button:hover { background: #f0f2f5; }
.contenido { padding: 1.5rem; }
</style>
