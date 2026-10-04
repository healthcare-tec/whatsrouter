#!/usr/bin/env bash
#
# Instala e sobe o servico local de transcricao (faster-whisper) usado pelo
# WhatsRouter. Nada de audio sai da maquina: o WhatsRouter envia o arquivo
# apenas para este servico, que roda em 127.0.0.1.
#
# Uso:
#   bash scripts/install-transcription.sh
#
# Variaveis opcionais:
#   WHISPER_PORT   porta exposta na maquina (padrao 9000)
#   WHISPER_MODEL  tiny | base | small | medium | large-v3 (padrao small)
#   WHISPER_IMAGE  imagem Docker (padrao fedirz/faster-whisper-server:latest-cpu)
#
# Depois de rodar, no painel do WhatsRouter:
#   Configuracoes > Midia e transcricao > "Servico local (faster-whisper)"
#   e clique em "Testar transcricao".
set -euo pipefail

PORT="${WHISPER_PORT:-9000}"
MODEL="${WHISPER_MODEL:-small}"
IMAGE="${WHISPER_IMAGE:-fedirz/faster-whisper-server:latest-cpu}"
NAME="whatsrouter-whisper"

echo "== Servico local de transcricao =="
echo "   modelo: $MODEL | porta: $PORT"

if ! command -v docker >/dev/null 2>&1; then
  cat <<'FALLBACK'

Docker nao encontrado nesta maquina. Duas alternativas:

1) Instalar o Docker e rodar este script novamente:
     curl -fsSL https://get.docker.com | sh

2) Usar o servidor via Python (sem Docker):
     python3 -m venv .venv-whisper
     . .venv-whisper/bin/activate
     pip install faster-whisper-server
     faster-whisper-server --host 127.0.0.1 --port 9000 --model small

   (na primeira execucao o modelo e baixado, o que pode demorar)

Em ambos os casos, no painel use o endereco http://127.0.0.1:9000/v1.
FALLBACK
  exit 1
fi

echo "-- removendo uma instancia anterior, se existir"
docker rm -f "$NAME" >/dev/null 2>&1 || true

echo "-- baixando a imagem ($IMAGE)"
docker pull "$IMAGE" >/dev/null

echo "-- iniciando o servico"
docker run -d \
  --name "$NAME" \
  --restart unless-stopped \
  -p "127.0.0.1:${PORT}:8000" \
  -e "WHISPER__MODEL=${MODEL}" \
  -e "WHISPER__INFERENCE_DEVICE=cpu" \
  -v whatsrouter-whisper-models:/root/.cache \
  "$IMAGE" >/dev/null

echo "-- aguardando o servico responder (na primeira vez baixa o modelo)"
READY=""
for _ in $(seq 1 90); do
  if curl -fsS "http://127.0.0.1:${PORT}/v1/models" >/dev/null 2>&1; then READY=1; break; fi
  sleep 2
done

if [ -z "$READY" ]; then
  echo "FALHA: o servico nao respondeu em 3 minutos. Veja os logs:"
  echo "  docker logs $NAME"
  exit 1
fi

echo
echo "SUCESSO: servico de transcricao respondendo em http://127.0.0.1:${PORT}/v1"
curl -fsS "http://127.0.0.1:${PORT}/v1/models" || true
echo
echo
echo "No painel do WhatsRouter:"
echo "  1. Configuracoes > Midia e transcricao > preset 'Servico local (faster-whisper)'"
echo "  2. Clique em 'Testar transcricao' (deve responder com os modelos disponiveis)"
echo
echo "Rodando o WhatsRouter tambem em Docker? Use o preset 'Servico local (no Docker)'"
echo "(endereco http://whisper:8000/v1) com o perfil 'transcricao' do docker-compose:"
echo "  docker compose --profile transcricao up -d"