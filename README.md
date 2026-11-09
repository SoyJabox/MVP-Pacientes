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
bun run scripts/seed-admin.ts prof@clinica.local pass123 --rol profesional
```

## Roles

| Rol | Pacientes | Agenda | Historia clínica | Documentos | CDA |
|---|:--:|:--:|:--:|:--:|:--:|
| `admin` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `profesional` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `recepcion` | ✓ | ✓ | — | — | — |

La decisión siempre la toma la API (`apps/api/src/auth.ts`, `requiereRol`), nunca
el frontend. La matriz está cubierta por `apps/api/src/rbac.test.ts`.

## Estructura

```
apps/api/src/
  index.ts        rutas base, login, /me
  auth.ts         JWT + middleware de auth y RBAC
  auditoria.ts    registro obligatorio de cada acción
  pacientes.ts    citas.ts    consultas.ts    documentos.ts
  cda.ts          generador CDA R2 nivel 1 (CMD mínimo)
apps/web/app/
  layouts/        barra persistente y login
  pages/          inicio, pacientes, historia clínica, agenda
  assets/css/     sistema de estilos
packages/shared/  tipos compartidos
scripts/          backup.sh, restaurar.sh
```

## Operación

```bash
# backups (verifica el dump antes de darlo por bueno)
./scripts/backup.sh /mnt/disco-externo/backups

# prueba de restauración en una base temporal y comparación de conteos
./scripts/restaurar.sh backups/gestor_pacientes_2026-11-08_030000.dump

# tests de la API
cd apps/api && bun test

# build de producción del frontend
cd apps/web && bun run build
```

Cron sugerido para el backup diario:

```
0 3 * * * cd /ruta/gestor-pacientes && ./scripts/backup.sh /mnt/disco-externo/backups
```

## Seguridad

- Contraseñas con `Bun.password` (argon2id), nunca en claro.
- JWT firmado HS256, guardado en cookie `HttpOnly; SameSite=Strict` por el
  servidor de Nuxt: el navegador nunca lee el token.
- Los documentos se guardan fuera del repositorio con nombre aleatorio
  (`apps/api/data/documentos`, dir `0700`, archivos `0600`) y solo se aceptan
  PDF, PNG y JPG hasta 20 MB.
- Validación de contenido real de archivos (magic bytes), no solo extensión.
- Toda acción sobre datos de pacientes queda en la tabla `auditoria`.

## Variables de entorno

| Variable | Uso |
|---|---|
| `DATABASE_URL` | conexión a PostgreSQL |
| `JWT_SECRET` | firma de los tokens (cambiar en producción) |
| `PORT` | puerto de la API (8787 por defecto) |
| `DOCS_DIR` | carpeta de documentos (por defecto `apps/api/data/documentos`) |
| `NUXT_API_BASE` | URL de la API vista por el servidor de Nuxt |

## Verificación completa (checklist)

- [x] API tests: 68/68 pass (`cd apps/api && bun test`)
- [x] Web build: exitoso (`cd apps/web && bun run build`)
- [x] Login end-to-end: admin, profesional, recepcion
- [x] RBAC: recepción bloqueada en datos clínicos, CDA, documentos, cambio estado citas
- [x] CDA nivel 1: XML válido con cabecera HCEN, datos paciente, encuentro, medicación
- [x] Upload documentos: valida tipo (PDF/PNG/JPG), contenido real, permisos 0600
- [x] Agenda: crea cita, marca atendida, cancela (recepción bloqueada)
- [x] Auditoría: cada acción exitosa registra usuario, acción, entidad, ID
- [x] Backup: genera dump verificado con pg_restore --list
- [x] Restore: restaura en base temporal y compara conteos tabla por tabla

## Estado

Fases 0 a 5 del plan completas y verificadas. Pendiente: piloto con datos reales y migración
del CDA a nivel 3 (secciones estructuradas). Ver `tasks/plan.md`.