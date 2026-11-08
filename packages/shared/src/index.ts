// Tipos compartidos entre API (Hono) y frontend (Nuxt).
// Los schemas de Drizzle viven en apps/api; aquí solo tipos planos.
export type Rol = "admin" | "recepcion" | "profesional";

export interface Usuario {
  id: number;
  email: string;
  rol: Rol;
  activo: boolean;
}

export interface Paciente {
  id: number;
  cedula: string;
  nombre: string;
  fechaNacimiento: string;
  contacto: string;
  fechaAlta: string;
  consentimientoFirmado: boolean;
}
