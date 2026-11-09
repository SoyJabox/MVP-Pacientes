<script setup lang="ts">
interface UsuarioRow {
  id: number;
  email: string;
  nombre: string;
  rol: string;
  activo: boolean;
}

const usuario = useUsuario();
const usuarios = ref<UsuarioRow[]>([]);
const cargando = ref(true);
const error = ref("");

const nuevo = ref({ email: "", nombre: "", password: "", rol: "profesional" });
const creando = ref(false);

onMounted(async () => {
  if (usuario.value?.rol !== "admin") {
    error.value = "Solo el administrador gestiona usuarios.";
    cargando.value = false;
    return;
  }
  await cargar();
});

async function cargar() {
  cargando.value = true;
  try {
    usuarios.value = await $fetch<UsuarioRow[]>("/api/usuarios");
  } catch {
    error.value = "No se pudieron cargar los usuarios.";
  } finally {
    cargando.value = false;
  }
}

async function crear() {
  error.value = "";
  creando.value = true;
  try {
    await $fetch("/api/usuarios", { method: "POST", body: nuevo.value });
    nuevo.value = { email: "", nombre: "", password: "", rol: "profesional" };
    await cargar();
  } catch (err: unknown) {
    error.value = (err as { data?: { error?: string } }).data?.error || "No se pudo crear el usuario.";
  } finally {
    creando.value = false;
  }
}

async function alternar(u: UsuarioRow) {
  error.value = "";
  try {
    await $fetch(`/api/usuarios/${u.id}`, { method: "PATCH", body: { activo: !u.activo } });
    await cargar();
  } catch (err: unknown) {
    error.value = (err as { data?: { error?: string } }).data?.error || "No se pudo cambiar el estado.";
  }
}
</script>

<template>
  <div class="usuarios">
    <header>
      <h1>Usuarios</h1>
      <p class="usuarios__sub">Cuentas de acceso al sistema. Solo el administrador ve esta pantalla.</p>
    </header>

    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>

    <p v-if="cargando" class="mensaje-vacio">Cargando…</p>

    <template v-else-if="usuario?.rol === 'admin'">
      <section class="tarjeta nueva">
        <h2>Nuevo usuario</h2>
        <form class="formulario" @submit.prevent="crear">
          <div class="nueva__fila">
            <div class="campo">
              <label for="email">Email</label>
              <input id="email" v-model="nuevo.email" type="email" required autocomplete="off" />
            </div>
            <div class="campo">
              <label for="nombre">Nombre</label>
              <input id="nombre" v-model="nuevo.nombre" autocomplete="off" placeholder="Dra. Luisa Prueba" />
            </div>
            <div class="campo">
              <label for="rol">Rol</label>
              <select id="rol" v-model="nuevo.rol">
                <option value="profesional">Profesional</option>
                <option value="recepcion">Recepción</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <div class="campo">
              <label for="password">Contraseña (mín. 6)</label>
              <input id="password" v-model="nuevo.password" type="password" required minlength="6" autocomplete="new-password" />
            </div>
            <button type="submit" class="primario" :disabled="creando">
              {{ creando ? "Creando…" : "Crear usuario" }}
            </button>
          </div>
        </form>
      </section>

      <div class="tabla-envoltura">
        <table>
          <thead>
            <tr>
              <th scope="col">Email</th>
              <th scope="col">Nombre</th>
              <th scope="col">Rol</th>
              <th scope="col">Estado</th>
              <th scope="col"><span class="visualmente-oculto">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in usuarios" :key="u.id">
              <td>{{ u.email }}</td>
              <td>{{ u.nombre || "—" }}</td>
              <td><span class="etiqueta">{{ u.rol }}</span></td>
              <td>
                <span class="etiqueta" :class="u.activo ? 'etiqueta--ok' : 'etiqueta--gris'">
                  {{ u.activo ? "Activo" : "Desactivado" }}
                </span>
              </td>
              <td class="usuarios__acciones">
                <button v-if="u.id !== usuario.id" @click="alternar(u)">
                  {{ u.activo ? "Desactivar" : "Reactivar" }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<style scoped>
.usuarios {
  display: grid;
  gap: 1.5rem;
}

.usuarios__sub {
  color: var(--texto-suave);
  font-size: 0.9rem;
  margin-top: 0.15rem;
}

.nueva h2 {
  margin-bottom: 0.85rem;
}

.nueva__fila {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.nueva__fila .campo {
  flex: 1;
  min-width: 160px;
}

.usuarios__acciones {
  display: flex;
  justify-content: flex-end;
}

.usuarios__acciones button {
  padding: 0.3rem 0.65rem;
  font-size: 0.82rem;
}
</style>
