# Progreso - Gestor de Pacientes

## Estado actual
Proyecto monorepo con API (Hono) y Web (Nuxt 4) **completamente funcional y verificado**. API tests: 81/81. Verificado en navegador real (E2E manual). BD limpia: 10 pacientes. Puertos 3001/8787 cerrados tras prueba en red local.

## Backlog
- [x] Verificar funcionamiento completo end-to-end (API + Web)
- [x] Verificar scripts de backup y restauración
- [x] Revisar cumplimiento HCEN/CDA nivel 1
- [x] Auditar seguridad (JWT, RBAC, auditoría, upload de archivos)
- [x] Corregir hallazgos de auditoría e2e (iteración 4)
- [x] Limpiar BD a máximo 10 pacientes
- [x] Pruebas reales en navegador (E2E manual con agent-browser)
- [x] Tests E2E automatizados persistentes (`scripts/e2e.sh`)
- [x] Campo `nombre` en usuarios (firma del CDA)
- [x] CDA nivel 3: entries estructurados de diagnóstico (CIE-10)
- [ ] Piloto con datos reales (carga por UI/API; el seed cargó datos ficticios)
- [ ] Validar entries CDA nivel 3 contra templates oficiales de Salud.uy
- [ ] **P3** Gestión de usuarios en UI (crear/desactivar) — hoy solo por script
- [ ] **P3** Botones de baja en UI (paciente/documento): endpoints sin UI
- [ ] **P3** Limpieza automática de datos de test (cada `bun test` re-agrega pacientes/usuarios)
- [ ] **P4** Recordatorios de citas; métricas clínicas; búsqueda trigram (>1000 pacientes)

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
- Siguiente paso: ~~implementar correcciones~~ **Hecho.** Iteración 5 ejecutada.

## Iteración 5 — Limpieza a 10 pacientes + pruebas reales en navegador
- Objetivo: reducir la BD a máximo 10 pacientes y empezar pruebas verdaderas E2E en navegador real (no solo tests de API).
- Cambios: backup previo (`gestor_pacientes_2026-11-09_002241.dump`); borrados pacientes de prueba y sus dependientes en cascada manual (medicación, documentos, citas, consultas), conservando los 10 con más historia; renombrados a nombres realistas (María González, Juan Pérez, …) + `Paciente Real E2E`; borrados archivos huérfanos de `data/documentos`; borrados 6 usuarios huérfanos `desactivado-*` (los demás usuarios de test referencian historia conservada, quedan).
- Pruebas ejecutadas y resultado (navegador real, agent-browser, sesión `gestor-94fec84ff9fe`):
  - Login admin OK; login con clave errónea muestra "Email o contraseña incorrectos."; `/pacientes` sin sesión redirige a `/login`; `/login` con sesión redirige a `/`.
  - Lista de pacientes + búsqueda ("González" → 1 resultado).
  - Alta de paciente vía UI → detalle con edad calculada (34 años). [Nota: el input date nativo no toma autocompletado por accesibilidad; con usuario real escribiendo dígitos funciona.]
  - Consulta + medicación vía UI visibles en historia.
  - CDA (XML) abre en pestaña nueva con cabecera HCEN.
  - Subida de PNG real → fila en BD con nombre aleatorio → descarga renderiza la imagen.
  - Agenda: crear cita (10:30 Uruguay = 13:30Z en BD, TZ correcto) → cancelar con confirmación (estado `cancelada`) → crear otra → marcar `atendida`.
  - Recepción: ve pacientes/agenda, historia muestra "Tu rol no tiene acceso a la historia clínica" sin formulario ni documentos (captura verificada).
  - Consola del navegador sin errores en toda la sesión.
  - Suite API tras la limpieza: **81/81 pass**.
- Hallazgos de la auditoría: ninguno nuevo. Nota: cada corrida de `bun test` re-agrega pacientes/usuarios de prueba (por eso el conteo sube de nuevo entre limpiezas).
- Decisiones tomadas: conservar los 10 pacientes con más historia clínica (no los más recientes); no borrar usuarios de test que referencian historia conservada (FK).
- Estado final: 10 pacientes, 2 citas, 28 consultas, 10 medicación, 0 documentos, 17 usuarios.
- Siguiente paso: piloto con datos reales (carga de 5-10 pacientes reales y uso diario), o tests E2E automatizados persistentes si se quiere regresión en navegador.
## Iteración 6 — Backlog recomendado: piloto-seed, E2E, nombre, CDA nivel 3
- Objetivo: implementar en orden: (1) piloto cargado y listo, (2) E2E automatizado persistente, (3) nombre real en usuarios para firma del CDA, (4) CDA nivel 3 con entries estructurados.
- Cambios:
  - `apps/api/scripts/seed-piloto.ts` (nuevo): 8 pacientes ficticios con historia realista (consultas, medicación, citas en 7 días), idempotente por cédula. Ejecutado: 8 creados, re-ejecución salta todo. Nota: los pacientes reales se cargan por UI/API; el seed es el punto de partida del piloto.
  - `scripts/e2e.sh` (nuevo): 11 aserciones en navegador real (redirect sin sesión, login erróneo, login admin, búsqueda que filtra, historia, agenda, logout, recepción bloqueada). Interactúa por id/label vía eval (refs de agent-browser caducan entre páginas).
  - Columna `usuarios.nombre` (default ""), `seed-admin.ts --nombre`, CDA firma con nombre (fallback email), `/me` y login lo exponen, tipo `Usuario` actualizado. Profesionales existentes con nombre real.
  - `cda.ts`: sección Problemas (11450-4, template 2.16.840.1.113883.10.20.22.2.3) con entry observación de problema (template 2.16.840.1.113883.10.20.22.2.5, valor CIE-10 con OID ICD-10); sección Medicación con código LOINC correcto 24326-1 (antes reusaba 10160-0). Medicación sin entry: exige diccionario de fármacos inexistente; queda narrativa, documentado en el código.
- Pruebas ejecutadas y resultado: `bun test` **83/83 pass** (+ test nombre en CDA, + test nivel 3 con/sin diagnóstico); `scripts/e2e.sh` **todo verde** tras corrección (2 fallos iniciales por refs caducadas, corregidos); CDA verificado en vivo (entry Z00.0 con OID ICD-10).
- Hallazgos de la auditoría: apareció un paciente `291 Samira Touch` ajeno a las pruebas del agente; no se tocó. Pacientes totales: 19 (11 previos + 8 del piloto).
- Decisiones tomadas: entries HL7 estándar (C-CDA) pendientes de validar contra templates oficiales de Salud.uy (no disponibles localmente); no inventar OID locales ni códigos de fármaco.
- Siguiente paso: piloto con pacientes reales (carga por el usuario), gestión de usuarios en UI (P3) y baja en UI (P3).
