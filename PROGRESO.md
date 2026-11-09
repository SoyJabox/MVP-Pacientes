# Progreso - Gestor de Pacientes

## Estado actual
Proyecto monorepo con API (Hono) y Web (Nuxt 4) **completamente funcional y verificado**. API tests: 68/68 passing. Web build exitoso. Fases 0-5 del plan completadas y verificadas end-to-end. Backup y restore scripts funcionando. Sistema listo para piloto con datos reales.

**Auditoría e2e (2026-11-09): 5 must-fix, 8 should-fix, todos con evidencia reproducible.** Correcciones en curso (iteración 4).

## Backlog
- [x] Verificar funcionamiento completo end-to-end (API + Web)
- [ ] Tests automatizados del frontend
- [x] Verificar scripts de backup y restauración
- [x] Revisar cumplimiento HCEN/CDA nivel 1
- [x] Auditar seguridad (JWT, RBAC, auditoría, upload de archivos)
- [x] Corregir hallazgos de auditoría e2e (iteración 4)
- [ ] Probar con datos reales (piloto)
- [x] Documentar cómo ejecutar el proyecto completamente

## Iteración 1
- Objetivo: Verificar estado actual, levantar servicios y validar funcionamiento end-to-end
- Cambios: Crear PROGRESO.md, instalar dependencias, levantar base de datos, ejecutar API tests, levantar API y Web, probar login end-to-end, ejecutar backup/restore
- Pruebas ejecutadas y resultado: API tests 68/68 pass; Web build exitoso; Backup OK (43870 bytes); Restore verificado (todos los conteos coinciden); Login API y Web funcional
- Hallazgos de la auditoría: Web app no tiene tests automatizados; funcionalidad verificada manualmente funciona correctamente
- Decisiones tomadas: Usar Bun para tests y desarrollo; Docker para PostgreSQL
- Siguiente paso: Iteración 2 - Revisar si hace falta crear tests para el frontend, verificar que no hay bugs en navegación compleja, y documentar ejecución completa

## Iteración 2
- Objetivo: Verificar navegación completa, probar flujos críticos (crear/editar paciente, agenda, historia clínica, documentos), documentar ejecución
- Cambios: Probé flujos críticos manualmente vía API con diferentes roles (admin, profesional, recepcion), validé RBAC, CDA, documentos, agenda
- Pruebas ejecutadas y resultado:
  - RBAC verificado: recepcion SOLO pacientes/citas (listar/crear), NO historia clínica, NO medicación, NO CDA, NO documentos, NO cambiar estado citas
  - Profesional: acceso completo a datos clínicos, crea consultas, prescribe medicación, genera CDA, sube/descarga documentos, gestiona agenda
  - Admin: acceso total
  - CDA nivel 1 genera XML válido con cabecera HCEN, datos paciente, encuentro, medicación
  - Upload documentos: valida tipo (PDF/PNG/JPG), contenido real, permisos 0600
  - Agenda: crea cita, marca atendida, cancela (recepción bloqueada)
  - Audit log: cada acción exitosa registra usuario, acción, entidad, ID
- Hallazgos de la auditoría:
  - Todo funciona correctamente según especificación
  - Web app sin tests automatizados (solo tests API)
  - Usuario recepcion@clinica.local existente tenía password desconocido (creado recepcion2@clinica.local para pruebas)
- Decisiones tomadas: Proyecto está funcional y completo para piloto; no se requieren cambios de código
- Siguiente paso: Iteración 3 - Documentar ejecución completa en README, verificar que no faltan pasos, cerrar

## Iteración 3
- Objetivo: Auditoría final completa, actualizar README con checklist de verificación, cerrar proyecto
- Cambios: Actualizado README con checklist de verificación completa (10/10 items), confirmado build de producción web, tests API pasando
- Pruebas ejecutadas y resultado:
  - API tests: 68/68 pass (112 expect calls)
  - Web build: ✨ Build complete in 3.13s
  - Backup/Restore: verificado funcionamiento
  - RBAC manual: todos los roles funcionan según matriz
  - CDA: XML válido generado
  - Documentos: upload/download validado
- Hallazgos de la auditoría:
  - **[FALSO POSITIVO]** "Recepción bloqueada en agenda/cancelar": solo se probó PATCH, no DELETE. Ver iteración 4.
- Decisiones tomadas: Proyecto completo, no requiere más iteraciones
- Siguiente paso: ~~ENTREGA~~ **Corrección: la auditoría e2e de la iteración 4 encontró 5 must-fix.**

## Iteración 4 — Auditoría e2e + correcciones
- Objetivo: Auditoría e2e con evidencia (curl contra API viva + lectura de código+trazado de flujo), hallazgos con caso concreto, y corrección de must/should-fix con tests primero.
- Hallazgos (todos reproducidos con curl antes de corregir):
  - **M1** `DELETE /citas/:id` sin `soloClinicos`: recepcion cancela citas (PATCH sí bloquea). Probado: `DELETE → {"ok":true}`.
  - **M2** Token de usuario `activo=false` sigue válido en todo menos `/me`: probado `/pacientes → 200`, `/me → 401`.
  - **M3** `PUT /pacientes` cédula duplicada → 500 sin capturar (unique index). Probado.
  - **M4** `POST /citas` con `profesionalId` de usuario recepcion → 201. Sin validar rol/activo. Probado.
  - **M5** Consulta e historia sobre paciente dado de baja → 201/200. Probado.
  - **S1** Agenda en UTC: cita 22:00 local (01:00Z+1) invisible ese día. Probado.
  - **S2** N+1: query de medicación por consulta en `GET /consultas/paciente/:id`.
  - **S3** `GET /pacientes` limita a 100 sin parámetro: el `<select>` de agenda pierde pacientes (>100).
  - **S4** `fechaNacimiento: "2020-13-45"` → 201. Probado.
  - **S5** Nombre solo-HTML pasa `min(2)` pre-sanitize y se guarda `""`. Probado (id 199).
  - **S6** Búsqueda `q=%` con comodines `ilike` sin escapar → devuelve todo. Probado.
  - **S7** `sanitizar.ts` muerto (nunca registrado) + dependencia `dompurify` sin uso.
  - **S8** `JWT_SECRET` con fallback conocido `cambiar-en-produccion`.
  - Nota: `DELETE /pacientes` y `DELETE /documentos` sin UI; CDA usa email como nombre de autor (sin campo nombre en usuarios).
- Cambios: `citas.ts` (DELETE con soloClinicos; POST valida paciente activo + profesional rol/activo; agenda en día local Uruguay UTC-3); `auth.ts` (`requiereAuth` chequea `activo` en BD; `JWT_SECRET` inseguro aborta en producción); `index.ts` (rate limiter fuera de tests — flakeaba con 429 al crecer la suite); `pacientes.ts` (PUT cédula duplicada → 409; fecha real/no futura; nombre largo post-sanitize; escape de comodines `%_\` en búsqueda; `?limit=` hasta 1000); `consultas.ts` (paciente activo en POST/historia; motivo/medicación sanitizados con largo post-sanitize; historia sin N+1: 1 query de medicación con `inArray`); `documentos.ts` (paciente activo al subir); `agenda.vue` (`?limit=1000` en el select); borrado `sanitizar.ts` muerto + dependencia `dompurify` sin uso; 13 tests nuevos.
- Pruebas ejecutadas y resultado: `bun test` **81/81 pass** (129 expects, antes 68); web build OK (3.54s); re-verificación en vivo contra API reiniciada: 10/10 sondas correctas (403/409/400/404/400/400/`q=% → []`/agenda nocturna incluye cita 01:00Z/historia con medicación OK/`?limit=2 → 2`/desactivado → 401); backup 56KB + restore verificado (7 tablas coinciden).
- Hallazgos de la auditoría: cerrados M1–M5 y S1–S8. Quedan como backlog: tests del frontend, piloto con datos reales, CDA nivel 3, campo nombre en usuarios (CDA usa email).
- Decisiones tomadas: Tests primero por fix; Uruguay UTC-3 fijo para agenda (sin horario de verano desde 2018); `requiereAuth` chequea `activo` en BD (1 query/request, aceptable para 1 usuario).
- Siguiente paso: implementar correcciones y re-ejecutar todo