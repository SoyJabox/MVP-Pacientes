#!/usr/bin/env bash
# Pruebas E2E reales en navegador con agent-browser (regresión automatizada).
# Requiere API y Web levantadas (ver README). Uso: bash scripts/e2e.sh
# No depende de refs @eN (caducan entre páginas): interactúa por id/label vía eval.
set -u

BASE="${E2E_BASE:-http://localhost:3001}"
SESS=$(agent-browser session id --scope worktree --prefix e2e)
FALLOS=0

ab() { agent-browser --session "$SESS" "$@" >/dev/null 2>&1; }
ok()   { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; FALLOS=$((FALLOS+1)); }
check_snap() {
  if agent-browser --session "$SESS" snapshot 2>/dev/null | grep -q "$1"; then ok "$2"; else fail "$2"; fi
}
check_url() {
  local u
  u=$(agent-browser --session "$SESS" get url 2>/dev/null | tail -1)
  if [[ "$u" == *"$1"* ]]; then ok "$2 ($u)"; else fail "$2 (url=$u)"; fi
}
go() { ab open "$BASE$1"; sleep 2; }
# set_input <id-o-selector> <valor>: fija valor disparando input/change (Vue v-model)
set_input() {
  agent-browser --session "$SESS" eval --stdin >/dev/null 2>&1 <<EOF
(function(){ var el = document.querySelector("$1"); if(!el) return "no";
el.focus(); el.value = "$2";
el.dispatchEvent(new Event('input',{bubbles:true}));
el.dispatchEvent(new Event('change',{bubbles:true})); return el.value; })();
EOF
  sleep 1
}

echo "Sesión E2E: $SESS"

echo "1. Sin sesión: /pacientes redirige a /login"
go /pacientes
check_url "/login" "redirect a login"

echo "2. Login con clave errónea muestra error"
set_input "#email" "admin@clinica.local"
set_input "#password" "clave-equivocada"
ab eval "document.querySelector('form').requestSubmit()"
ab wait --text "incorrectos"
check_snap "Email o contraseña incorrectos" "mensaje de error visible"

echo "3. Login admin → dashboard"
set_input "#email" "admin@clinica.local"
set_input "#password" "admin123"
ab eval "document.querySelector('form').requestSubmit()"
ab wait --text "Hola, admin"
check_snap "Hola, admin" "dashboard admin"

echo "4. Pacientes: lista + búsqueda"
go /pacientes
ab wait --text "Pacientes"
check_snap "Pacientes" "lista de pacientes"
set_input "input[type=search]" "González"
sleep 2
check_snap "María González" "búsqueda encuentra a María González"
if agent-browser --session "$SESS" snapshot 2>/dev/null | grep -q "Juan Pérez"; then
  fail "búsqueda filtra (Juan Pérez no debería aparecer)"
else
  ok "búsqueda filtra (Juan Pérez no aparece)"
fi

echo "5. Detalle de paciente: historia clínica"
go /pacientes/290
ab wait --text "Nueva consulta"
check_snap "Nueva consulta" "formulario de consulta (admin)"

echo "6. Agenda"
go /agenda
ab wait --text "Citas del día"
check_snap "Citas del día" "agenda carga"

echo "6b. Usuarios (solo admin) + métricas en inicio"
go /usuarios
ab wait --text "Nuevo usuario"
check_snap "Nuevo usuario" "página de usuarios admin"
go /
ab wait --text "CIE-10 FRECUENTES"
check_snap "CIE-10 FRECUENTES" "métricas clínicas en inicio"

echo "7. Logout + recepción bloqueada en historia clínica"
agent-browser --session "$SESS" eval --stdin >/dev/null 2>&1 <<'EOF'
(function(){ var b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === 'Salir'); if (b) b.click(); return !!b; })();
EOF
ab wait --url "**/login"
check_url "/login" "logout vuelve a login"
set_input "#email" "recepcion2@clinica.local"
set_input "#password" "pass123"
ab eval "document.querySelector('form').requestSubmit()"
ab wait --url "**/"
go /pacientes/290
ab wait --text "Tu rol no tiene acceso"
check_snap "Tu rol no tiene acceso" "recepción bloqueada en UI"
if agent-browser --session "$SESS" snapshot 2>/dev/null | grep -q "Nueva consulta"; then
  fail "recepción no ve formulario de consulta"
else
  ok "recepción no ve formulario de consulta"
fi

ab close

if [ "$FALLOS" -eq 0 ]; then
  echo "E2E: todo verde"
  exit 0
else
  echo "E2E: $FALLOS fallos"
  exit 1
fi
