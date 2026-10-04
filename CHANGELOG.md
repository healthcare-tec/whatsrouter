# Changelog

Todas as mudanças relevantes deste projeto são registradas aqui.
O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [0.2.0] - 2026-10-04

Configuração de rede pelo painel, pareamento facilitado do WhatsApp e um terceiro caminho de transcrição que roda na própria máquina.

### Adicionado

- **Rede e acesso** no painel: escolha do endereço de escuta (`0.0.0.0`, IP da rede como `192.168.0.1` ou `127.0.0.1`) e da porta, com lista dos endereços detectados, avisos de segurança e botão **Reiniciar servidor** para aplicar a mudança.
- **Gerar QR Code** sob demanda na página de status, para a primeira conexão com o Baileys, além do **código de pareamento de 8 dígitos** (alternativa sem câmera, digitada no celular).
- **Serviço local de transcrição** (terceiro caminho): servidor compatível com a API da OpenAI rodando na própria máquina, sem enviar áudio para fora. Inclui `scripts/install-transcription.sh` (instalação em um comando), serviço `whisper` opcional no `docker-compose.yml` (`--profile transcricao`), `scripts/dev-transcribe.mjs` para testes e presets no painel.
- Botão **Testar transcrição**, que consulta o serviço configurado e lista os modelos disponíveis.
- Documentação [TRANSCRIPTION.md](docs/TRANSCRIPTION.md) com os três caminhos, boas práticas e solução de problemas.
- Simulação de mensagens com mídia no provedor de demonstração (permite testar anexos e transcrição sem WhatsApp).

### Alterado

- O teste de fumaça agora cobre rede, QR Code e transcrição pelo serviço local (71 testes automatizados no total).
- `tsc --noEmit` passou a checar também os arquivos de teste.

## [0.1.0] - 2026-10-03

Primeira versão funcional. Escopo definido na [entrevista de requisitos](docs/REQUIREMENTS.md).

### Adicionado

- Centralizador WhatsApp → e-mail: consolidação por contato, com janela de **2 minutos** para conversas individuais e **30 minutos** para grupos.
- Resposta por e-mail → WhatsApp, com **uma cadeia de conversa por contato** (endereço `conv+<token>@dominio` e cabeçalhos `Message-ID`/`References`).
- Aviso automático de modo automático, enviado no máximo uma vez a cada 24 h por contato, com texto editável no painel.
- Pausa automática da conversa quando o proprietário responde pelo celular (padrão 30 minutos, configurável), botão de pausa no painel e comandos `!pausar`, `!retomar`, `!retomar-tudo`, `!status`, `!ajuda` pelo WhatsApp.
- Anexos de mídia (imagem, áudio, vídeo, documento) e transcrição de áudio com driver plugável (`auto`, `openai`, comando local ou desligado).
- Painel web com login, status da conexão (QR Code), fila, conversas, histórico, testes de SMTP/IMAP e todas as configurações.
- Camada de provedores plugável: **Baileys** (WhatsApp Web), **webhook** (pronto para n8n/Cloud API) e **mock** (demonstração e testes).
- Docker Compose, SQLite com migrações Drizzle, CI no GitHub Actions, 48 testes automatizados e teste de fumaça ponta a ponta com SMTP local.

### Notas

- Licença MIT.
- Baileys usa o protocolo não oficial do WhatsApp Web: risco de bloqueio do número (recomenda-se número dedicado).
