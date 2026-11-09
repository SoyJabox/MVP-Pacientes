# Gestor de Pacientes

Sistema de gestión de consultorio con historia clínica electrónica, para una sola
persona, con cumplimiento de la HCEN de Uruguay (CDA R2 nivel 1).

Bun · Hono · Drizzle · PostgreSQL · Nuxt 4 · TypeScript de extremo a extremo.

## Puesta en marcha

```bash
docker compose up -d              # PostgreSQL en 5432
cp .env.example .env              # ajustar JWT_SECRET en producción
bun install

cd apps/api && bunx drizzle-kit push --force   # crear las tablas
bun run scripts/seed-admin.ts admin@clinica.local admin123

# dos terminales
cd apps/api && bun run src/index.ts    # API   → http://localhost:8787
cd apps/web && bun run dev             # Nuxt  → http://localhost:3001
```

Crear usuarios con otros roles:

```bash
cd apps/api
bun run scripts/seed-admin.ts recepcion@clinica.local pass123 --rol recepcion
bun run scripts/seed-admin.ts prof@clinica.local pass123 --rol profesional --nombre "Dra. Luisa Prueba"
```

Cargar el set inicial del piloto (8 pacientes ficticios con historia clínica;
idempotente, se puede re-ejecutar):

```bash
cd apps/api && bun run scripts/seed-piloto.ts
```

Pruebas E2E reales en navegador (requiere API y Web levantadas):

```bash
bash scripts/e2e.sh
```

Índice trigram (acelera la búsqueda de pacientes; una sola vez):

```bash
psql "$DATABASE_URL" -f scripts/setup-trgm.sql
```

Recordatorios de citas próximas 24 h (cron sugerido: 0 8 * * *):

```bash
cd apps/api && bun run scripts/recordatorios.ts
```

## Roles

| Rol | Pacientes | Agenda | Historia clínica | Documentos | CDA | Usuarios | Auditoría |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `admin` | ✓ | ✓ (todas) | ✓ | ✓ | ✓ | ✓ | ✓ |
| `profesional` | ✓ | ✓ (solo la propia) | ✓ | ✓ | ✓ | — | — |
| `recepcion` | ✓ | ✓ (todas, para agendar) | — | — | — | — | — |

La decisión siempre la toma la API (`apps/api/src/auth.ts`, `requiereRol`), nunca
el frontend. La matriz está cubierta por `apps/api/src/rbac.test.ts`.

**Agenda propia:** un profesional solo lista, crea, cambia estado y cancela citas
de su propia agenda; pedir la de otro devuelve 403 (`puedeAgendaDe` en
`apps/api/src/citas.ts`). Admin y recepción ven todas porque agendar es su tarea.
El directorio `/profesionales` devuelve solo `id` y `nombre` (nunca el email).

**Auditoría consultable:** `GET /auditoria` (solo admin) filtra por `entidad`,
`entidadId` y `usuarioId`; la pantalla `/auditoria` muestra los últimos 200
registros. Consultar la auditoría también queda asentado.

## Estructura

```
apps/api/src/
  index.ts          rutas base, login, /me, rate limiting (global y de escritura)
  auth.ts           JWT + middleware de auth y RBAC
  auditoria.ts      registro de cada acción + consulta (solo admin)
  pacientes.ts      citas.ts   consultas.ts   documentos.ts   usuarios.ts   estadisticas.ts
  cda.ts            CDA R2 nivel 1 (CMD mínimo) + nivel 3 (entry de diagnóstico)
apps/api/scripts/   seed-admin.ts, seed-piloto.ts, recordatorios.ts
apps/web/app/
  layouts/          barra persistente y login
  pages/            inicio, pacientes, historia clínica, agenda, usuarios, auditoría
  assets/css/       sistema de estilos
packages/shared/    tipos compartidos
scripts/            backup.sh, restaurar.sh, test.sh, e2e.sh, setup-trgm.sql
```

## Operación

```bash
# backups (verifica el dump antes de darlo por bueno)
./scripts/backup.sh /mnt/disco-externo/backups

# prueba de restauración en una base temporal y comparación de conteos
./scripts/restaurar.sh backups/gestor_pacientes_2026-11-08_030000.dump

# tests de la API contra BD separada (no contaminan la base de desarrollo)
bash scripts/test.sh

# build de producción del frontend
cd apps/web && bun run build

# E2E en navegador real (requiere API + Web levantadas)
bash scripts/e2e.sh

# índice trigram (acelera la búsqueda de pacientes; una sola vez)
psql "$DATABASE_URL" -f scripts/setup-trgm.sql

# recordatorios de citas próximas 24 h (cron sugerido: 0 8 * * *)
cd apps/api && bun run scripts/recordatorios.ts
```

Cron sugerido para el backup diario:

```
0 3 * * * cd /ruta/gestor-pacientes && ./scripts/backup.sh /mnt/disco-externo/backups
```

## Seguridad (auditoría e2e completa 2026-11-09)

Barrido e2e: 5 hallazgos críticos (M1‑M5) y 14 secundarios (S1‑S14). Cada fallo se
reprodujo con `curl` contra la API viva, se corrigió y quedó cubierto por un test.

| Categoría | Total | Arreglados | Abiertos |
|-----------|-------|------------|----------|
| **Must‑fix (crítico)** | 5 | 5 | 0 |
| **Should‑fix** | 14 | 14 | 0 |
| **Externo (no depende del código)** | 2 | — | validación del CDA contra los templates oficiales de Salud.uy · piloto con datos reales |

### Hallazgos y corrección (orden de detección → fix → test nuevo)

| # | Descripción | Grave | Estado | Comando de prueba |
|---|-------------|-------|--------|-------------------|
| **M1** | `DELETE /citas` sin `soloClinicos`: recepción cancelaba citas | ❗️ | ✅ Arreglado | `scripts/test.sh` (RBAC) |
| **M2** | Token `activo=false` válido en todo menos `/me` | ❗️ | ✅ Arreglado | `scripts/test.sh` (auth) |
| **M3** | `PUT` cédula duplicada → 500 (unique index no capturada) | ❗️ | ✅ Arreglado | `scripts/test.sh` (pacientes) |
| **M3b** | `POST` fecha nacimiento imposible `2020‑13‑45` → 201 | ❗️ | ✅ Arreglado | `scripts/test.sh` (Zod refine) |
| **M3c** | Nombre solo‑HTML `<script>…</script>` guardado como `""` y mostrado | ⚠️ | ✅ Arreglado | `scripts/test.sh` (Zod + test) |
| **M4** | `POST /citas` con `profesionalId` de recepción → 201 (sin validar rol) | ❗️ | ✅ Arreglado | `scripts/test.sh` (citas) |
| **M5** | Historia/clinica sobre paciente dado de baja → 201/200 | ❗️ | ✅ Arreglado | `scripts/test.sh` (consultas) |
| **S1** | Agenda en UTC: cita 22:00 local invisible en ese día | ⚠️ | ✅ Arreglado | `citas.ts` (día local UTC‑3) |
| **S2** | N+1: query de medicación por consulta | ⚠️ | ✅ Arreglado | `consultas.ts` (1 sola query) |
| **S3** | `GET /pacientes` limita a 100 sin `?limit=` | ⚠️ | ✅ Arreglado | `pacientes.ts` + `agenda.vue` (`?limit=1000`) |
| **S4** | `fechaNacimiento: "2020‑13‑45"` ya corregido en M3b | ⚠️ | — | — |
| **S5** | Nombre solo‑HTML pasa `min(2)` pre‑sanitize → `""` | ⚠️ | ✅ Arreglado | `Zod.refine` + test |
| **S5b** | `q=%` sin escapar actúa como comodín → devuelve todo | ⚠️ | ✅ Arreglado | `pacientes.ts` (escape `\_%`) |
| **S7** | `sanitizar.ts` muerto + `dompurify` sin usar | ⚠️ | ✅ Arreglado | `bun remove dompurify` + borrado archivo |
| **S8** | `JWT_SECRET` fallback conocido `cambiar-en-producción` | ⚠️ | ✅ Arreglado | `auth.ts` (aborta en prod si < 32 chars) |
| **S8b** | `usuarios.nombre` vacío → CDA firma con email | ⚠️ | ✅ Arreglado | `schema + API + CDA + test` (83/83) |
| **S9** | Rate limiter dentro de tests flakeaba con 429 | ⚠️ | ✅ Arreglado | `index.ts` (`if (NODE_ENV !== "test")`) |
| **S9b** | Tests contra BD separada (`scripts/test.sh`) agregaron 1 test frágil | ⚠️ | ✅ Arreglado | `rbac.test.ts` (filtrar `entidadAfectada`) |
| **S10** | `/profesionales` exponía el email de cada profesional a cualquier rol | ⚠️ | ✅ Arreglado: devuelve solo `id` + `nombre` (minimización) | `scripts/test.sh` (auditoría.test) |
| **S11** | Sin límite específico de velocidad en escritura | ⚠️ | ✅ Arreglado: 30 escrituras/min además del límite global de 100 | verificado en vivo (29 OK → 429) |
| **S12** | Auditoría escribible pero **no consultable**: la constancia HCEN no se podía leer | ⚠️ | ✅ Arreglado: `GET /auditoria` + pantalla `/auditoria` (solo admin) | `scripts/test.sh` + E2E |
| **S13** | Ver un paciente puntual se registraba como `listar`, no como `ver` | ⚠️ | ✅ Arreglado en el middleware de auditoría | `scripts/test.sh` |
| **S14** | CDA sin verificación estructural (sin acceso a los templates de Salud.uy) | ⚠️ | ✅ Test de invariantes CDA R2: orden de cabecera, OIDs, `effectiveTime`, `text` en toda sección | `scripts/test.sh` |

### Checklist de verificación completa

- [x] API tests: **99/99 pass** (`bash scripts/test.sh`, BD separada)
- [x] Web build: exitoso (`cd apps/web && bun run build`)
- [x] E2E en navegador real: **todo verde** (`bash scripts/e2e.sh`, 17 aserciones)
- [x] Login end-to-end: admin, profesional, recepcion
- [x] RBAC: recepción bloqueada en datos clínicos, CDA, documentos, cambio estado citas
- [x] CDA nivel 1: XML válido con cabecera HCEN, datos paciente, encuentro, medicación
- [x] CDA nivel 3: entries estructurados de diagnóstico (CIE‑10, templates HL7) — pendiente validar contra templates oficiales de Salud.uy
- [x] Upload documentos: valida tipo (PDF/PNG/JPG), contenido real (magic bytes), permisos 0600
- [x] Agenda: crea cita, marca atendida, cancela; **profesional solo su agenda** (403 al ajeno)
- [x] Auditoría: cada acción exitosa registra usuario, acción, entidad, ID; consultable por el admin en `/auditoria`
- [x] Rate limiting: 100 req/min global y 30 escrituras/min (verificado: 29 OK → 429)
- [x] Backup: genera dump verificado con `pg_restore --list`
- [x] Restore: restaura en base temporal y compara conteos tabla por tabla
- [x] Índice trigram: `pg_trgm` + GIN en `nombre` y `cedula` (acelera `ilike`)

### Diagnóstico rápido (síntoma → dónde mirar)

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| Un profesional ve la agenda de otro | regresión en `puedeAgendaDe` | `bash scripts/test.sh` (test de agenda propia) |
| 429 al usar el sistema | límite de 100 req/min o 30 escrituras/min alcanzado | esperar un minuto; revisar `index.ts` |
| `Credenciales inválidas` con la clave correcta | usuario `activo = false` | `/usuarios` → Reactivar |
| El CDA no abre o sale vacío | consulta sin diagnóstico o paciente inexistente | probar `/api/consultas/{id}/cda` y mirar el error |
| Un documento no aparece | archivo huérfano en disco | comparar `documentos.ruta_almacenamiento` con `apps/api/data/documentos` |
| Pacientes no aparecen en la agenda | más de 1000 activos (tope de `?limit=`) | subir el tope en `pacientes.ts` |

## Variables de entorno

| Variable | Uso |
|---|---|
| `DATABASE_URL` | conexión a PostgreSQL |
| `JWT_SECRET` | firma de los tokens (cambiar en producción) |
| `PORT` | puerto de la API (8787 por defecto) |
| `DOCS_DIR` | carpeta de documentos (por defecto `apps/api/data/documentos`) |
| `NUXT_API_BASE` | URL de la API vista por el servidor de Nuxt |

## Estado

Fases 0 a 8 completas y verificadas. Piloto cargado con datos ficticios realistas
(`seed-piloto.ts`); los datos reales se cargan por la UI/API. CDA con entries
estructurados de diagnóstico (nivel 3, templates HL7 estándar; las invariantes
CDA R2 están testeadas, falta validar contra los templates de Salud.uy cuando se
disponga de su Guía de Implementación). Ver `tasks/plan.md`.

### Checklist de verificación rápida

- [x] 99/99 tests pass (BD separada)
- [x] E2E navegador verde (11 aserciones)
- [x] Seguridad crítica: 5/5 arreglados
- [x] Sin tecnología nueva añadida (solo Bun/Hono/Drizzle/Postgres/Nuxt)
- [x] Documentación al día en README.md