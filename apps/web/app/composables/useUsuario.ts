import type { Usuario } from "@gestor/shared";

// Estado global de sesión, compartido entre páginas y middleware.
export function useUsuario() {
  return useState<Usuario | null>("usuario", () => null);
}
