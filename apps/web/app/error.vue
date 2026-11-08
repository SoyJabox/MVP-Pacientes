<script setup lang="ts">
import type { NuxtError } from "#app";

const props = defineProps<{ error: NuxtError }>();

const esNoEncontrada = computed(() => props.error.statusCode === 404);
const titulo = computed(() => (esNoEncontrada.value ? "Página no encontrada" : "Algo salió mal"));
</script>

<template>
  <div class="error">
    <div class="error__caja">
      <p class="error__codigo num">{{ error.statusCode }}</p>
      <h1>{{ titulo }}</h1>
      <p class="error__texto">
        {{ esNoEncontrada ? "La dirección no existe o fue movida." : error.message }}
      </p>
      <div class="fila">
        <NuxtLink to="/" class="boton primario">Ir al inicio</NuxtLink>
        <button class="boton" @click="clearError({ redirect: '/' })">Reintentar</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.error {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 1.5rem;
}

.error__caja {
  max-width: 380px;
  display: grid;
  gap: 0.6rem;
  text-align: center;
  background: var(--superficie);
  border: 1px solid var(--borde);
  border-radius: 14px;
  box-shadow: var(--sombra);
  padding: 2rem;
}

.error__codigo {
  font-size: 2.4rem;
  font-weight: 700;
  letter-spacing: -0.04em;
  line-height: 1;
  color: var(--acento);
}

.error__texto {
  color: var(--texto-suave);
  font-size: 0.92rem;
}

.fila {
  justify-content: center;
  margin-top: 0.75rem;
}
</style>
