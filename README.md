# WhatsRouter

**Centralizador de mensagens entre WhatsApp e e-mail.** As mensagens que chegam no seu WhatsApp são consolidadas e enviadas para o seu e-mail; você responde o e-mail e a resposta volta como mensagem no WhatsApp — mantendo uma conversa por contato.

[English version](README.en.md) · [Requisitos](docs/REQUIREMENTS.md) · [Arquitetura](docs/ARCHITECTURE.md) · [Configuração](docs/CONFIGURATION.md) · [Implantação](docs/DEPLOYMENT.md) · [Provedores](docs/PROVIDERS.md) · [Roadmap](docs/ROADMAP.md)

---

## O que ele faz

1. **Avisa quem escreveu** que a conta está em modo automático, que a mensagem será encaminhada por e-mail e respondida quando possível — uma vez a cada 24 h por contato, para não virar spam.
2. **Consolida as mensagens** de um mesmo contato dentro de uma janela de tempo: **2 minutos** para conversas individuais e **30 minutos** para grupos.
3. **Envia um e-mail por contato** para o e-mail do proprietário, com as mensagens novas, o contexto recente e as **mídias anexadas** (áudios são **transcritos**).
4. **Recebe a sua resposta por e-mail** e a envia como mensagem no WhatsApp, no mesmo fio de conversa daquele contato.
5. **Pausa sozinho** quando você assume a conversa: se você responder pelo celular, o sistema para de enviar e-mails daquela conversa por 30 minutos (configurável), acumulando o que chegar — e envia tudo rotulado como "mensagens durante a pausa" quando você retomar.
6. Tem um **painel web** para configurar a mensagem automática, o e-mail do sistema, o e-mail do proprietário, as janelas, a transcrição, bloqueios e as pausas.

## Como o fluxo funciona

```
WhatsApp  ──►  provedor (Baileys / webhook+n8n)  ──►  consolidação (2 min / 30 min)
                                                            │
                                                            ▼
                        seu e-mail  ◄──  SMTP  ◄──  composição do e-mail (anexos + transcrição)
                             │
                    você responde o e-mail
                             ▼
                        IMAP  ──►  limpeza do texto  ──►  WhatsApp do contato
```

Detalhes completos em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Instalação rápida com Docker

```bash
git clone https://github.com/healthcare-tec/whatsrouter.git
cd whatsrouter
cp .env.example .env      # ajuste a senha do painel e o SESSION_SECRET
docker compose up -d --build
```

Abra `http://localhost:3000`, entre com `admin` / `whatsrouter` (ou o que você definiu em `.env`) e:

1. **Configurações → E-mail do sistema**: informe o endereço dedicado do sistema, o domínio usado no `Reply-To` e as credenciais SMTP/IMAP. Há botões de teste de envio e de leitura.
2. **Configurações → Proprietário**: informe o seu e-mail, que receberá as notificações.
3. **Status**: leia o QR Code com o WhatsApp do número que será usado.

> **Sobre o número:** o projeto foi pensado para rodar no **seu número pessoal**, com pausa automática quando você assume a conversa. Se puder, use um número dedicado: o Baileys usa o protocolo do WhatsApp Web (não oficial) e há risco de bloqueio — veja [avisos](#avisos).

### Provedores de e-mail conhecidos

No painel, os presets preenchem host e porta automaticamente:

| Provedor | SMTP | IMAP |
|---|---|---|
| mail.org / mail.com | `smtp.mail.com:587` (TLS) | `imap.mail.com:993` (SSL) |
| Gmail / Google Workspace | `smtp.gmail.com:465` (SSL) | `imap.gmail.com:993` (SSL) |
| Microsoft 365 / Outlook | `smtp.office365.com:587` (TLS) | `outlook.office365.com:993` (SSL) |
| Zoho Mail | `smtp.zoho.com:465` (SSL) | `imap.zoho.com:993` (SSL) |

Em contas com verificação em duas etapas (Gmail, Zoho), use uma **senha de aplicativo**.

## Desenvolvimento

Requisitos: Node.js 22+ e pnpm 9+.

```bash
pnpm install
cp .env.example .env

# terminal 1 — servidor (http://localhost:3000)
pnpm dev

# terminal 2 — painel com recarga instantânea (http://localhost:5173)
pnpm dev:web

# testes automatizados
pnpm test

# teste de fumaça ponta a ponta (sobe um SMTP local e valida o fluxo completo)
bash scripts/smoke-test.sh
```

O provedor `mock` permite testar todo o fluxo **sem conectar um celular**:

```bash
WHATSAPP_PROVIDER=mock pnpm dev
# no painel: Status → "Simular mensagem recebida"
```

Para ver os e-mails sem enviá-los de verdade:

```bash
node scripts/dev-smtp.mjs 2525 ./data/smtp-inbox
# no painel: SMTP host 127.0.0.1, porta 2525, sem SSL
```

## Comandos pelo WhatsApp

Se você enviar estes comandos no WhatsApp (na conversa com o contato ou na conversa consigo mesmo), o sistema obedece:

| Comando | Efeito |
|---|---|
| `!pausar` | pausa o envio de e-mails daquela conversa pelo tempo padrão (30 min) |
| `!pausar 45` | pausa por 45 minutos |
| `!retomar` | retoma a conversa e libera o que estava acumulado |
| `!retomar-tudo` | retoma todas as conversas pausadas |
| `!status` | responde com um resumo (conversas, fila, último e-mail, pausa global) |
| `!ajuda` | lista os comandos |

## Estrutura do repositório

| Caminho | Conteúdo |
|---|---|
| `server/` | API, painel de configuração, pipeline de mensagens, provedores, e-mail (TypeScript) |
| `web/` | Painel em React + Vite + Tailwind |
| `docs/` | Requisitos, arquitetura, configuração, implantação, provedores e roadmap |
| `scripts/` | Servidor SMTP de desenvolvimento e teste de fumaça ponta a ponta |
| `server/drizzle/` | Migrações do banco SQLite |

## Avisos

- O provedor **Baileys** usa o protocolo do WhatsApp Web, que **não é oficial**. Usar um número pessoal tem risco de bloqueio; o projeto assume esse risco de forma explícita e recomenda um número dedicado.
- A camada de provedor é plugável: existe um provedor **webhook**, pensado para integração com o **n8n** (ou com a Cloud API oficial da Meta) sem alterar o restante do sistema. Veja [docs/PROVIDERS.md](docs/PROVIDERS.md).
- As credenciais de SMTP/IMAP e as sessões do WhatsApp ficam no volume `whatsrouter-data`. Proteja e faça backup dessa pasta; quem tiver acesso a ela tem acesso à sua conta.
- Se a transcrição de áudio estiver habilitada com um provedor de nuvem, os arquivos de áudio são enviados para esse provedor. Dá para usar um comando local (por exemplo `whisper.cpp`) e nada sair da sua máquina.

## Contribuindo

Contribuições são muito bem-vindas: veja [CONTRIBUTING.md](CONTRIBUTING.md). O projeto usa **licença MIT**.

Ideias em aberto no [roadmap](docs/ROADMAP.md): multi-conta (vários números e e-mails), provedor n8n pronto para uso, resumos diários e transcrição local documentada.

## Licença

[MIT](LICENSE) © 2026 WhatsRouter contributors