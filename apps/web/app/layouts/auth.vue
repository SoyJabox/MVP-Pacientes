<template>
  <div class="acceso">
    <div class="acceso__panel">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.acceso {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background:
    radial-gradient(circle at 20% 0%, #e8effa 0%, transparent 55%),
    radial-gradient(circle at 85% 100%, #e9f2ee 0%, transparent 50%),
    var(--bg);
}

.acceso__panel {
  width: min(400px, 100%);
  background: var(--superficie);
  border: 1px solid var(--borde);
  border-radius: 14px;
  box-shadow: var(--sombra);
  padding: 2.25rem;
}
</style>
