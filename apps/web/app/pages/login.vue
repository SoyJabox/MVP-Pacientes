<script setup lang="ts">
const usuario = useUsuario();
const email = ref("");
const password = ref("");
const error = ref("");
const cargando = ref(false);

async function entrar() {
  error.value = "";
  cargando.value = true;
  try {
    const res = await $fetch<{ usuario: { id: number; email: string; rol: string } }>("/api/auth/login", {
      method: "POST",
      body: { email: email.value, password: password.value },
    });
    usuario.value = res.usuario;
    await navigateTo("/");
  } catch {
    error.value = "Email o contraseña incorrectos.";
  } finally {
    cargando.value = false;
  }
}
</script>

<template>
  <main class="login">
    <form class="tarjeta" @submit.prevent="entrar">
      <h1>Gestor de Pacientes</h1>
      <p class="subtítulo">Acceso al sistema clínico</p>

      <label for="email">Email</label>
      <input
        id="email"
        v-model="email"
        type="email"
        autocomplete="email"
        required
        placeholder="nombre@clinica.local"
      />

      <label for="password">Contraseña</label>
      <input
        id="password"
        v-model="password"
        type="password"
        autocomplete="current-password"
        required
      />

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <button type="submit" :disabled="cargando">
        {{ cargando ? "Ingresando…" : "Ingresar" }}
      </button>
    </form>
  </main>
</template>

<style scoped>
.login {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #f3f5f7;
  font-family: system-ui, sans-serif;
  color: #1c2430;
}
.tarjeta {
  background: #fff;
  border: 1px solid #dfe3e8;
  border-radius: 12px;
  padding: 2.5rem;
  width: min(380px, 90vw);
  display: grid;
  gap: 0.5rem;
}
h1 { font-size: 1.35rem; margin: 0; }
.subtítulo { margin: 0 0 1rem; color: #66727f; font-size: 0.9rem; }
label { font-size: 0.85rem; font-weight: 600; margin-top: 0.75rem; }
input {
  padding: 0.6rem 0.75rem;
  border: 1px solid #cdd4db;
  border-radius: 8px;
  font-size: 1rem;
}
input:focus-visible, button:focus-visible { outline: 2px solid #2563eb; outline-offset: 1px; }
button {
  margin-top: 1.25rem;
  padding: 0.65rem;
  border: none;
  border-radius: 8px;
  background: #2563eb;
  color: #fff;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
}
button:hover { background: #1d4fc4; }
button:disabled { opacity: 0.6; cursor: wait; }
.error {
  margin: 0.5rem 0 0;
  color: #b42318;
  font-size: 0.88rem;
}
</style>
