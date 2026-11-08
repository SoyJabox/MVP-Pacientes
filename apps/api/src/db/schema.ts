import { pgTable, serial, text, boolean, timestamp, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const usuarios = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  rol: text("rol", { enum: ["admin", "recepcion", "profesional"] })
    .notNull()
    .default("recepcion"),
  activo: boolean("activo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pacientes = pgTable(
  "pacientes",
  {
    id: serial("id").primaryKey(),
    cedula: text("cedula").notNull(),
    nombre: text("nombre").notNull(),
    fechaNacimiento: text("fecha_nacimiento").notNull(), // ISO yyyy-mm-dd
    contacto: text("contacto").notNull().default(""),
    fechaAlta: timestamp("fecha_alta", { withTimezone: true }).notNull().defaultNow(),
    consentimientoFirmado: boolean("consentimiento_firmado").notNull().default(false),
  },
  (t) => [
    uniqueIndex("pacientes_cedula_idx").on(t.cedula),
    index("pacientes_nombre_idx").on(t.nombre),
  ],
);

export const citas = pgTable(
  "citas",
  {
    id: serial("id").primaryKey(),
    pacienteId: integer("paciente_id")
      .notNull()
      .references(() => pacientes.id),
    profesionalId: integer("profesional_id")
      .notNull()
      .references(() => usuarios.id),
    fechaHora: timestamp("fecha_hora", { withTimezone: true }).notNull(),
    estado: text("estado", { enum: ["agendada", "atendida", "cancelada"] })
      .notNull()
      .default("agendada"),
  },
  (t) => [index("citas_fecha_idx").on(t.fechaHora)],
);

export const consultas = pgTable(
  "consultas",
  {
    id: serial("id").primaryKey(),
    pacienteId: integer("paciente_id")
      .notNull()
      .references(() => pacientes.id),
    profesionalId: integer("profesional_id")
      .notNull()
      .references(() => usuarios.id),
    fecha: timestamp("fecha", { withTimezone: true }).notNull().defaultNow(),
    motivo: text("motivo").notNull(),
    evolucion: text("evolucion").notNull().default(""),
    diagnosticoCie10: text("diagnostico_cie10").notNull().default(""),
  },
  (t) => [index("consultas_paciente_idx").on(t.pacienteId)],
);

export const medicacion = pgTable("medicacion", {
  id: serial("id").primaryKey(),
  consultaId: integer("consulta_id")
    .notNull()
    .references(() => consultas.id),
  pacienteId: integer("paciente_id")
    .notNull()
    .references(() => pacientes.id),
  medicamento: text("medicamento").notNull(),
  dosis: text("dosis").notNull(),
  duracion: text("duracion").notNull().default(""),
  fechaInicio: timestamp("fecha_inicio", { withTimezone: true }).notNull().defaultNow(),
});

export const documentos = pgTable("documentos", {
  id: serial("id").primaryKey(),
  pacienteId: integer("paciente_id")
    .notNull()
    .references(() => pacientes.id),
  nombreArchivo: text("nombre_archivo").notNull(),
  rutaAlmacenamiento: text("ruta_almacenamiento").notNull(),
  fechaSubida: timestamp("fecha_subida", { withTimezone: true }).notNull().defaultNow(),
});

export const auditoria = pgTable(
  "auditoria",
  {
    id: serial("id").primaryKey(),
    usuarioId: integer("usuario_id").references(() => usuarios.id),
    accion: text("accion").notNull(), // ver | crear | editar | eliminar | exportar
    entidadAfectada: text("entidad_afectada").notNull(), // pacientes | consultas | ...
    entidadId: integer("entidad_id"),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auditoria_entidad_idx").on(t.entidadAfectada, t.entidadId)],
);

export const consultasRelations = relations(consultas, ({ many, one }) => ({
  medicacion: many(medicacion),
  paciente: one(pacientes, { fields: [consultas.pacienteId], references: [pacientes.id] }),
  profesional: one(usuarios, { fields: [consultas.profesionalId], references: [usuarios.id] }),
}));

export const medicacionRelations = relations(medicacion, ({ one }) => ({
  consulta: one(consultas, { fields: [medicacion.consultaId], references: [consultas.id] }),
}));
