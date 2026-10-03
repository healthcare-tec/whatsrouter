# Changelog

Todas as mudanças relevantes deste projeto são registradas aqui.
O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa [Versionamento Semântico](https://semver.org/lang/pt-BR/).

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