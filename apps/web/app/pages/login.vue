<script setup lang="ts">
definePageMeta({ layout: "auth" });

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
  <div class="entrar">
    <div class="entrar__marca">
      <span class="entrar__signo" aria-hidden="true">✚</span>
      <h1>Gestor de Pacientes</h1>
    </div>
    <p class="entrar__ayuda">Acceso al sistema clínico</p>

    <form class="formulario" @submit.prevent="entrar">
      <div class="campo">
        <label for="email">Email</label>
        <input
          id="email"
          v-model="email"
          type="email"
          autocomplete="email"
          required
          placeholder="nombre@clinica.local"
        />
      </div>

      <div class="campo">
        <label for="password">Contraseña</label>
        <input
          id="password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
        />
      </div>

      <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>

      <button type="submit" class="primario" :disabled="cargando">
        {{ cargando ? "Ingresando…" : "Ingresar" }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.entrar {
  display: grid;
  gap: 0.35rem;
}

.entrar__marca {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.entrar__signo {
  display: grid;
  place-items: center;
  width: 1.9rem;
  height: 1.9rem;
  border-radius: 7px;
  background: var(--acento);
  color: #fff;
  font-size: 0.95rem;
  line-height: 1;
}

h1 {
  font-size: 1.15rem;
  font-weight: 680;
}

.entrar__ayuda {
  color: var(--texto-suave);
  font-size: 0.88rem;
  margin-bottom: 1.1rem;
}

.entrar button {
  margin-top: 0.35rem;
  padding: 0.62rem;
}
</style>
