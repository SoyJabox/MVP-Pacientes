# Task List: Gestor de Pacientes

## Phase 0: Setup y referencia
- [x] Task 1: Mover docs a `referencia/` + crear `.gitignore`
- [x] Task 2: Inicializar monorepo Bun workspaces (`apps/api`, `apps/web`, `packages/shared`)
- [x] Task 3: Docker Compose para PostgreSQL

### Checkpoint: Foundation
- [x] `bun install` funciona
- [x] PostgreSQL levanta con docker compose
- [x] Docs fuera del git

## Phase 1: Auth + Modelo base
- [x] Task 4: Esquema Drizzle — `usuarios` + `pacientes` (de paso: citas, consultas, medicacion, documentos, auditoria)
- [x] Task 5: POST `/auth/login` con JWT + hash nativo de Bun
- [x] Task 6: Middleware autenticación JWT
- [x] Task 7: Middleware RBAC (admin, recepcion, profesional)
- [x] Task 8: Nuxt login + composable sesión (proxy server-side con cookie HttpOnly)
- [x] Task 9: Nuxt middleware protección de rutas

### Checkpoint: Auth
- [x] Login curl → JWT
- [x] Nuxt login → cookie + redirect (verificado en navegador con agent-browser)
- [x] Rutas protegidas bloquean sin token
- [x] Cookie HttpOnly + SameSite=Strict (verificado con curl)
- [x] Proxy /api sin cookie → 401

## Phase 2: Pacientes + Auditoría
- [x] Task 10: CRUD pacientes en Hono (validación Zod, búsqueda, soft delete con `activo`)
- [x] Task 11: Middleware auditoría (crear/editar/eliminar/ver/listar)
- [x] Task 12: Nuxt lista de pacientes + búsqueda
- [x] Task 13: Nuxt formulario alta/edición paciente

### Checkpoint: Pacientes
- [x] CRUD funciona desde UI (verificado con agent-browser)
- [x] Auditoría registra cada acción (crear, editar, listar verificados en BD)
- [x] Búsqueda por cedula/nombre

## Phase 3: Agenda
- [ ] Task 14: Esquema Drizzle — `citas`
- [ ] Task 15: API crear/listar/cancelar citas
- [ ] Task 16: Nuxt vista diaria agenda

### Checkpoint: Agenda
- [ ] Crear/cancelar cita desde UI
- [ ] Vista diaria por profesional

## Phase 4: Consultas + Medicación
- [ ] Task 17: Esquema Drizzle — `consultas` + `medicacion`
- [ ] Task 18: API registrar consulta (CIE-10)
- [ ] Task 19: API prescripción medicación
- [ ] Task 20: Nuxt formulario consulta
- [ ] Task 21: Nuxt vista historia clínica

### Checkpoint: Consultas
- [ ] Consulta con diagnóstico CIE-10
- [ ] Medicación asociada a consulta
- [ ] Recepción NO ve datos clínicos

## Phase 5: Documentos + CDA
- [ ] Task 22: Esquema Drizzle — `documentos`
- [ ] Task 23: API subida de archivos
- [ ] Task 24: Generador CDA nivel 1 (xmlbuilder2)
- [ ] Task 25: Nuxt vista documentos

### Checkpoint: Documentos
- [ ] Subir/descargar PDF
- [ ] CDA nivel 1 válido

## Phase 6: Hardening + Backup
- [ ] Task 26: Tests RBAC exhaustivos
- [ ] Task 27: Script backup pg_dump
- [ ] Task 28: Prueba restauración

### Checkpoint: Seguridad
- [ ] Tests RBAC pasan
- [ ] Backup funciona

## Phase 7: Piloto
- [ ] Task 29: Cargar pacientes de prueba
- [ ] Task 30: Correcciones post-piloto

### Checkpoint: Complete
- [ ] Todo funciona
- [ ] Piloto completado
