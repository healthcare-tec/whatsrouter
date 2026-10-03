#!/usr/bin/env bash
#
# Teste de fumaca do WhatsRouter.
#
# Sobe um servidor SMTP local, inicia o WhatsRouter com o provedor de
# demonstracao (mock), simula uma mensagem recebida e verifica se o e-mail de
# notificacao foi gerado com o endereco de resposta correto.
#
# Uso: bash scripts/smoke-test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${SMOKE_PORT:-3211}"
SMTP_PORT="${SMOKE_SMTP_PORT:-2526}"
WORK="$(mktemp -d)"
LOG="$WORK/server.log"
SMTP_LOG="$WORK/smtp.log"
SERVER_PID=""
SMTP_PID=""

cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  [ -n "$SMTP_PID" ] && kill "$SMTP_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT

echo "== 1/6 servidor SMTP local na porta $SMTP_PORT"
node "$ROOT/scripts/dev-smtp.mjs" "$SMTP_PORT" "$WORK/smtp" >"$SMTP_LOG" 2>&1 &
SMTP_PID=$!

echo "== 2/6 compilando o servidor"
(cd "$ROOT/server" && pnpm exec tsc -p tsconfig.build.json)

echo "== 3/6 iniciando o WhatsRouter na porta $PORT (provedor mock)"
PORT="$PORT" \
DATA_DIR="$WORK/data" \
DATABASE_PATH="$WORK/data/whatsrouter.sqlite" \
WHATSAPP_PROVIDER=mock \
ADMIN_USERNAME=admin \
ADMIN_PASSWORD=whatsrouter \
LOG_LEVEL=warn \
node "$ROOT/server/dist/index.js" >"$LOG" 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$PORT/api/healthz" >/dev/null 2>&1; then break; fi
  sleep 0.5
done
curl -fsS "http://127.0.0.1:$PORT/api/healthz" >/dev/null || { echo "FALHA: API nao respondeu"; cat "$LOG"; exit 1; }
echo "   API respondendo em /api/healthz"

echo "== 4/6 autenticando no painel"
JAR="$WORK/cookies.txt"
curl -fsS -c "$JAR" -H 'content-type: application/json' \
  -d '{"username":"admin","password":"whatsrouter"}' \
  "http://127.0.0.1:$PORT/api/auth/login" >/dev/null

echo "== 5/6 configurando e-mail e janelas"
curl -fsS -b "$JAR" -X PUT -H 'content-type: application/json' \
  -d '{"values":{
    "mail.system_email":"bot@example.com",
    "mail.system_name":"WhatsRouter",
    "mail.owner_email":"dono@example.com",
    "mail.reply_domain":"example.com",
    "mail.smtp_host":"127.0.0.1",
    "mail.smtp_port":"'"$SMTP_PORT"'",
    "mail.smtp_secure":"false",
    "consolidation.dm_minutes":"0",
    "consolidation.tick_seconds":"2",
    "auto_reply.enabled":"true"
  }}' "http://127.0.0.1:$PORT/api/settings" >/dev/null

curl -fsS -b "$JAR" -H 'content-type: application/json' \
  -d '{"chatJid":"5511999999999@s.whatsapp.net","senderName":"Maria Teste","text":"Mensagem do teste de fumaca"}' \
  "http://127.0.0.1:$PORT/api/provider/simulate" >/dev/null

echo "== 6/6 aguardando o e-mail de notificacao"
FOUND=""
for _ in $(seq 1 30); do
  FOUND="$(ls "$WORK/smtp"/*.eml 2>/dev/null | head -1 || true)"
  [ -n "$FOUND" ] && break
  sleep 1
done

if [ -z "$FOUND" ]; then
  echo "FALHA: nenhum e-mail foi gerado"
  echo "--- server.log ---"; tail -40 "$LOG"
  echo "--- smtp.log ---"; tail -20 "$SMTP_LOG"
  exit 1
fi

if ! grep -q "Mensagem do teste de fumaca" "$FOUND"; then
  echo "FALHA: e-mail gerado sem o texto da mensagem"
  cat "$FOUND"
  exit 1
fi

if ! grep -qi "^Reply-To: conv+" "$FOUND"; then
  echo "FALHA: e-mail gerado sem o endereco de resposta por conversa"
  grep -i "reply-to" "$FOUND" || true
  exit 1
fi

if ! grep -qi "Subject:.*Maria Teste" "$FOUND"; then
  echo "AVISO: assunto nao contem o nome do contato"
  grep -i "^subject" "$FOUND" || true
fi

echo
echo "SUCESSO: fluxo completo verificado."
echo "E-mail gerado: $FOUND"
grep -iE "^(from|to|reply-to|subject|message-id|references):" "$FOUND" || true
echo
echo "Trecho do corpo:"
sed -n '/Mensagens novas/,/Como responder/p' "$FOUND" | head -12