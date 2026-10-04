#!/usr/bin/env bash
#
# Teste de fumaca do WhatsRouter.
#
# Sobe um servidor SMTP local e um servico de transcricao falso, inicia o
# WhatsRouter com o provedor de demonstracao (mock), simula mensagens e
# verifica: e-mail de notificacao, endereco de resposta por conversa,
# transcricao de audio pelo caminho "servico local" e configuracao de rede.
#
# Uso: bash scripts/smoke-test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${SMOKE_PORT:-3211}"
SMTP_PORT="${SMOKE_SMTP_PORT:-2526}"
WHISPER_PORT="${SMOKE_WHISPER_PORT:-9010}"
WORK="$(mktemp -d)"
LOG="$WORK/server.log"
SMTP_LOG="$WORK/smtp.log"
WHISPER_LOG="$WORK/whisper.log"
SERVER_PID=""
SMTP_PID=""
WHISPER_PID=""

cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  [ -n "$SMTP_PID" ] && kill "$SMTP_PID" 2>/dev/null || true
  [ -n "$WHISPER_PID" ] && kill "$WHISPER_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT

echo "== 1/8 servidores de apoio (SMTP em $SMTP_PORT, transcricao em $WHISPER_PORT)"
node "$ROOT/scripts/dev-smtp.mjs" "$SMTP_PORT" "$WORK/smtp" >"$SMTP_LOG" 2>&1 &
SMTP_PID=$!
node "$ROOT/scripts/dev-transcribe.mjs" "$WHISPER_PORT" >"$WHISPER_LOG" 2>&1 &
WHISPER_PID=$!

echo "== 2/8 compilando o servidor"
(cd "$ROOT/server" && pnpm exec tsc -p tsconfig.build.json)

echo "== 3/8 iniciando o WhatsRouter na porta $PORT (provedor mock)"
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

echo "== 4/8 autenticando no painel"
JAR="$WORK/cookies.txt"
curl -fsS -c "$JAR" -H 'content-type: application/json' \
  -d '{"username":"admin","password":"whatsrouter"}' \
  "http://127.0.0.1:$PORT/api/auth/login" >/dev/null

echo "== 5/8 configurando e-mail, janelas e o servico local de transcricao"
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
    "auto_reply.enabled":"true",
    "transcription.enabled":"true",
    "transcription.provider":"service",
    "transcription.service_url":"http://127.0.0.1:'"$WHISPER_PORT"'/v1"
  }}' "http://127.0.0.1:$PORT/api/settings" >/dev/null

echo "-- testando o servico de transcricao"
TRANSCRIPTION_TEST="$(curl -fsS -b "$JAR" -X POST "http://127.0.0.1:$PORT/api/settings/test-transcription")"
echo "   $TRANSCRIPTION_TEST"
echo "$TRANSCRIPTION_TEST" | grep -q '"ok":true' || { echo "FALHA: servico de transcricao nao respondeu"; cat "$WHISPER_LOG"; exit 1; }

echo "== 6/8 mensagem de texto e audio com transcricao"
curl -fsS -b "$JAR" -H 'content-type: application/json' \
  -d '{"chatJid":"5511999999999@s.whatsapp.net","senderName":"Maria Teste","text":"Mensagem do teste de fumaca"}' \
  "http://127.0.0.1:$PORT/api/provider/simulate" >/dev/null

AUDIO_BASE64="$(printf 'audio-de-teste' | base64 -w0)"
curl -fsS -b "$JAR" -H 'content-type: application/json' \
  -d '{"chatJid":"5511999999999@s.whatsapp.net","senderName":"Maria Teste","messageKind":"audio",
       "media":{"base64":"'"$AUDIO_BASE64"'","mimeType":"audio/ogg","fileName":"voz.ogg"}}' \
  "http://127.0.0.1:$PORT/api/provider/simulate" >/dev/null

echo "== 7/8 aguardando os e-mails de notificacao"
EMAILS=0
for _ in $(seq 1 40); do
  EMAILS="$(find "$WORK/smtp" -name '*.eml' 2>/dev/null | wc -l)"
  if [ "$EMAILS" -ge 2 ]; then break; fi
  sleep 1
done

if [ "$EMAILS" -lt 1 ]; then
  echo "FALHA: nenhum e-mail foi gerado"
  echo "--- server.log ---"; tail -40 "$LOG"
  echo "--- smtp.log ---"; tail -20 "$SMTP_LOG"
  exit 1
fi

TEXT_EMAIL="$(grep -l "Mensagem do teste de fumaca" "$WORK"/smtp/*.eml 2>/dev/null | head -1 || true)"
# O corpo usa quoted-printable, que quebra linhas longas com "="; juntamos
# tudo em um arquivo "achatado" para comparar o texto de verdade.
FLAT="$WORK/emails-flat.txt"
: > "$FLAT"
for file in "$WORK"/smtp/*.eml; do
  tr -d '\r' <"$file" | sed -e ':a' -e 'N' -e '$!ba' -e 's/=\n//g' >>"$FLAT"
done

TEXT_EMAIL="$(grep -l "^Reply-To: conv+" "$WORK"/smtp/*.eml 2>/dev/null | head -1 || true)"
if ! grep -q "Mensagem do teste de fumaca" "$FLAT"; then
  echo "FALHA: e-mail sem o texto da mensagem"
  for file in "$WORK"/smtp/*.eml; do
    echo "--- $file ---"
    sed -n '1,40p' "$file"
  done
  exit 1
fi

if ! grep -qi "^Reply-To: conv+" "$TEXT_EMAIL"; then
  echo "FALHA: e-mail sem o endereco de resposta por conversa"
  grep -i "reply-to" "$TEXT_EMAIL" || true
  exit 1
fi

if ! grep -qi "Subject:.*Maria Teste" "$TEXT_EMAIL"; then
  echo "AVISO: assunto nao contem o nome do contato"
  grep -i "^subject" "$TEXT_EMAIL" || true
fi

if ! grep -q "Transcricao de teste do servico local" "$FLAT"; then
  echo "FALHA: o audio nao foi transcrito pelo servico local"
  echo "--- whisper.log ---"; tail -20 "$WHISPER_LOG"
  exit 1
fi

echo "== 8/8 rede, QR Code e endpoints novos"
ADDRESSES="$(curl -fsS -b "$JAR" "http://127.0.0.1:$PORT/api/server/addresses")"
echo "   enderecos: $(echo "$ADDRESSES" | head -c 220)"
echo "$ADDRESSES" | grep -q '"running"' || { echo "FALHA: /api/server/addresses sem dados de execucao"; exit 1; }

QR_RESPONSE="$(curl -s -b "$JAR" -X POST "http://127.0.0.1:$PORT/api/provider/qr")"
echo "   qr com provedor mock: $QR_RESPONSE"
echo "$QR_RESPONSE" | grep -q 'nao gera QR Code' || { echo "FALHA: QR deveria ser recusado no provedor mock"; exit 1; }

SETTINGS_JSON="$(curl -fsS -b "$JAR" "http://127.0.0.1:$PORT/api/settings")"
echo "$SETTINGS_JSON" | grep -q 'transcriptionPresetNames' || { echo "FALHA: presets de transcricao ausentes"; exit 1; }
echo "$SETTINGS_JSON" | grep -q 'server' || { echo "FALHA: informacoes de rede ausentes"; exit 1; }
echo "$SETTINGS_JSON" | grep -q '"running"' || { echo "FALHA: /api/settings sem o endereco em uso"; exit 1; }
echo "$SETTINGS_JSON" | grep -q 'transcriptionDriverLabel' || { echo "FALHA: /api/settings sem o rotulo do motor de transcricao"; exit 1; }

echo
echo "SUCESSO: fluxo completo verificado."
echo "E-mail de texto: $TEXT_EMAIL"
grep -iE "^(from|to|reply-to|subject|message-id|references):" "$TEXT_EMAIL" || true
echo
echo "Trecho do corpo:"
sed -n '/Mensagens novas/,/Como responder/p' "$TEXT_EMAIL" | head -12
echo
echo "Transcricao encontrada no e-mail de audio:"
grep -h "Transcricao de teste do servico local" "$WORK"/smtp/*.eml | head -2
echo "   arquivos temporarios em $WORK"
