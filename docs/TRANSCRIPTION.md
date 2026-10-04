# Transcrição de áudio

O WhatsRouter transcreve os áudios recebidos no WhatsApp e coloca o texto no corpo do e-mail (o arquivo continua anexado). Existem **três caminhos**, escolhidos em *Configurações → Mídia e transcrição*:

| Caminho | Para quem | Privacidade | Instalação |
|---|---|---|---|
| **Serviço local** (recomendado) | Quer transcrição boa sem mandar áudio para fora e sem se preocupar com comando | Nada sai da máquina | Um comando (`scripts/install-transcription.sh`) |
| **API na nuvem** | Não quer instalar nada, aceita enviar o áudio para um provedor | O áudio vai para o provedor | Informar chave da API |
| **Comando local** | Já tem `whisper.cpp` ou outro binário instalado | Nada sai da máquina | Informar o comando |

Com o motor em **Automático**, a ordem de preferência é: serviço local → API na nuvem → comando local. O campo *Motor de transcrição em uso* (no topo de Configurações) mostra qual caminho está ativo.

## Caminho 1 — Serviço local (recomendado)

Sobe um servidor compatível com a API da OpenAI na sua máquina (imagem [faster-whisper-server](https://github.com/fedirz/faster-whisper-server)) e o WhatsRouter apenas conversa com ele por HTTP em `127.0.0.1`. Sem GPU, o modelo `small` roda em CPU com boa qualidade em português.

```bash
bash scripts/install-transcription.sh          # modelo small, porta 9000
WHISPER_MODEL=medium bash scripts/install-transcription.sh
```

O script baixa a imagem, sobe o contêiner com `--restart unless-stopped`, espera o serviço responder e mostra o endereço. Depois, no painel:

1. *Mídia e transcrição* → preset **Serviço local (faster-whisper)**.
2. Clique em **Testar transcrição** — deve responder com os modelos disponíveis.

Para atualizar ou remover:

```bash
docker rm -f whatsrouter-whisper     # remove o servico
docker logs -f whatsrouter-whisper   # acompanha o uso
```

### Usando o Docker Compose do projeto

O `docker-compose.yml` já traz o serviço `whisper` em um perfil opcional:

```bash
docker compose --profile transcricao up -d
```

Nesse caso o WhatsRouter fala com ele pelo nome do serviço, então use o preset **Serviço local (no Docker)**, que aponta para `http://whisper:8000/v1`.

### Sem Docker

```bash
python3 -m venv .venv-whisper && . .venv-whisper/bin/activate
pip install faster-whisper-server
faster-whisper-server --host 127.0.0.1 --port 9000 --model small
```

### Testando sem baixar modelo

Para validar apenas o encanamento (sem transcrever de verdade):

```bash
node scripts/dev-transcribe.mjs 9000
```

Ele responde como um serviço real, devolvendo um texto fixo.

## Caminho 2 — API na nuvem

Serve para OpenAI, Groq ou qualquer endpoint compatível com `/audio/transcriptions`.

1. *Mídia e transcrição* → preset **OpenAI (nuvem)**.
2. Preencha **Chave da API** e, se for outro provedor, **URL base** (por exemplo `https://api.groq.com/openai/v1`) e **Modelo**.
3. Clique em **Testar transcrição**.

Também é possível definir a chave por variável de ambiente (`OPENAI_API_KEY` e, se necessário, `OPENAI_BASE_URL`), útil em Docker.

## Caminho 3 — Comando local

Para quem já tem `whisper.cpp` instalado:

```text
whisper-cli -f {file} -otxt -of {out}
```

`{file}` é o áudio recebido e `{out}` é o caminho base de saída — o comando deve gerar `{out}.txt`. O WhatsRouter espera até 5 minutos pelo comando.

## Boas práticas

| Situação | Recomendação |
|---|---|
| Português, CPU, sem GPU | modelo `small` (padrão) ou `medium` se a máquina aguentar |
| Áudios longos | aumente `attachments.max_mb`; a transcrição roda em segundo plano e não bloqueia o recebimento |
| Muitos áudios ao mesmo tempo | o serviço local processa em fila; prefira rodar em uma máquina com mais CPU |
| Servidor pequeno (1 vCPU) | use `tiny` ou `base`, ou mantenha a transcrição desligada |

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| "Testar transcrição" falha com `fetch failed` | o serviço não está rodando ou está em outra porta — confira `docker logs whatsrouter-whisper` |
| Transcrição não aparece no e-mail | motor em `Desligado`, ou nenhum caminho configurado; veja o campo *Motor de transcrição em uso* |
| Texto vazio | áudio muito curto, silencioso ou formato não suportado pelo modelo |
| Demora muito | primeira execução baixa o modelo; depois fica em cache no volume `whatsrouter-whisper-models` |
| Erro 404 no teste | o endereço precisa terminar em `/v1` (por exemplo `http://127.0.0.1:9000/v1`) |
