# Implementation Plan: Gestor de Pacientes (HCEN Uruguay)

## Overview
Sistema de gestión de pacientes para consultorio médico en Uruguay, con cumplimiento de Historia Clínica Electrónica Nacional (HCEN). Una sola persona construyendo desde cero. Stack: Bun + Hono + Drizzle + PostgreSQL + Nuxt 4 + TypeScript end-to-end.

## Architecture Decisions
- **Nuxt = frontend puro, Hono = API.** Nuxt nunca toca la BD. Toda la lógica y control de acceso vive en Hono.
- **Auth con JWT nativo.** `hono/jwt` firma tokens, Nuxt los guarda en cookie HttpOnly. Sin librerías externas de auth.
- **RBAC en Hono, no en Nuxt.** Middleware de Hono decide quién puede hacer qué. Recepción no ve datos clínicos.
- **Drizzle como ORM.** Sintaxis SQL-like, tipos compartidos con Nuxt sin duplicar.
- **Auditoría obligatoria.** Cada acceso a historia clínica genera fila en tabla `auditoria`.
- **CDA nivel 1 primero.** XML básico con CMD mínimo. Migrar a nivel 3 después.
- **Monorepo simple.** Dos paquetes: `apps/api` (Hono) y `apps/web` (Nuxt), con `packages/shared` para tipos.

## Task List

### Phase 0: Setup y referencia ✅
- [x] Task 1: Mover docs de referencia a carpeta `referencia/` y crear `.gitignore`
- [x] Task 2: Inicializar monorepo (Bun workspaces) con estructura `apps/api`, `apps/web`, `packages/shared`
- [x] Task 3: Configurar PostgreSQL con Docker Compose para desarrollo local

### Checkpoint: Foundation ✅
- [x] `bun install` funciona en la raíz
- [x] Docker compose levanta PostgreSQL
- [x] Estructura de carpetas correcta, docs fuera del git

### Phase 1: Auth + Modelo base (Semana 1)
- [ ] Task 4: Esquema Drizzle — tablas `usuarios` y `pacientes` en `packages/shared`
- [ ] Task 5: API Hono — endpoint POST `/auth/login` con JWT + hash bcrypt (Bun.password)
- [ ] Task 6: API Hono — middleware de autenticación JWT
- [ ] Task 7: API Hono — middleware RBAC (admin, recepcion, profesional)
- [ ] Task 8: Nuxt — pantalla de login + composable de sesión (cookie HttpOnly)
- [ ] Task 9: Nuxt — middleware de protección de rutas

### Checkpoint: Auth funciona
- [ ] Login con curl devuelve JWT
- [ ] Nuxt login guarda cookie y redirige
- [ ] Rutas protegidas bloquean sin token
- [ ] Recepción no puede ejecutar endpoints de profesionales

### Phase 2: Pacientes + Auditoría (Semana 3)
- [ ] Task 10: API Hono — CRUD de pacientes (alta, búsqueda, edición)
- [ ] Task 11: API Hono — middleware de auditoría (log automático en cada acción)
- [ ] Task 12: Nuxt — lista de pacientes con búsqueda
- [ ] Task 13: Nuxt — formulario de alta/edición de paciente

### Checkpoint: Pacientes
- [ ] CRUD completo funciona desde la UI
- [ ] Cada acción genera fila en auditoria
- [ ] Búsqueda por cedula y nombre funciona

### Phase 3: Agenda (Semana 4)
- [ ] Task 14: Esquema Drizzle — tabla `citas`
- [ ] Task 15: API Hono — crear, listar, cancelar citas
- [ ] Task 16: Nuxt — vista diaria de agenda por profesional

### Checkpoint: Agenda
- [ ] Se puede crear/cancelar cita desde la UI
- [ ] Vista diaria muestra citas del profesional

### Phase 4: Consultas + Medicación (Semana 5)
- [ ] Task 17: Esquema Drizzle — tablas `consultas` y `medicacion`
- [ ] Task 18: API Hono — registrar consulta (motivo, evolución, diagnóstico CIE-10)
- [ ] Task 19: API Hono — prescripción de medicación
- [ ] Task 20: Nuxt — formulario de consulta
- [ ] Task 21: Nuxt — vista de historia clínica (solo profesionales y admin)

### Checkpoint: Consultas
- [ ] Consulta se registra con diagnóstico CIE-10
- [ ] Medicación se asocia a consulta
- [ ] Recepción NO ve evolución ni medicación (verificar RBAC)

### Phase 5: Documentos + CDA (Semana 6)
- [ ] Task 22: Esquema Drizzle — tabla `documentos`
- [ ] Task 23: API Hono — subida de archivos (almacenamiento local con permisos restrictivos)
- [ ] Task 24: Generador CDA nivel 1 con xmlbuilder2 (CMD mínimo)
- [ ] Task 25: Nuxt — vista de documentos del paciente

### Checkpoint: Documentos
- [ ] Se puede subir y descargar un PDF
- [ ] CDA nivel 1 valida contra esquema MSP

### Phase 6: Hardening + Backup (Semana 7)
- [ ] Task 26: Verificación exhaustiva de roles (tests de RBAC)
- [ ] Task 27: Script de backup automático (pg_dump diario)
- [ ] Task 28: Prueba de restauración de backup

### Checkpoint: Seguridad
- [ ] Tests de RBAC pasan
- [ ] Backup se ejecuta y restaura correctamente

### Phase 7: Piloto (Semana 8)
- [ ] Task 29: Cargar 5-10 pacientes de prueba
- [ ] Task 30: Correcciones post-piloto

### Checkpoint: Complete
- [ ] Todos los acceptance criteria cumplidos
- [ ] Piloto interno completado
- [ ] Ready for review

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| CDA nivel 1 más complejo de lo esperado | High | Dedicar semana completa a leer Guía de Implementación antes de codificar |
| Nuxt 4 aún inestable | Medium | Fallback a Nuxt 3 si hay blockers; la API no cambia |
| Compartir tipos Drizzle con Nuxt | Low | `packages/shared` exporta tipos planos, no schemas de Drizzle directamente |
| Una persona = un punto de fallo | High | Cada fase deja el sistema funcional; no hay dependencias cruzadas entre fases |

## Open Questions
- ¿Nuxt 4 estable al momento de empezar? Si no, usar Nuxt 3.
- ¿Dónde se almacenan los documentos? ¿Disco local cifrado con LUKS o carpeta con permisos restrictivos suficiente?
- ¿El sistema necesita multi-profesional desde el día 1 o arranca con un solo usuario?
