# Configuração

Toda a configuração do WhatsRouter é feita pelo **painel web** (`/configuracoes`) e gravada no banco SQLite. Os arquivos `.env` servem apenas para infraestrutura (porta, caminhos, senha inicial do painel, provedor padrão).

Credenciais aparecem mascaradas na API (`********`): enviar o valor mascarado de volta mantém a credencial salva. Para trocar, informe o valor novo.

## Aviso de modo automático

| Chave | Padrão | Descrição |
|---|---|---|
| `auto_reply.enabled` | `true` | Liga o aviso enviado a quem escreve pela primeira vez. |
| `auto_reply.text` | texto de boas-vindas | Texto do aviso. Use `{nome}` para inserir o nome do contato. |
| `auto_reply.cooldown_hours` | `24` | Intervalo mínimo por contato antes de repetir o aviso. |

## Consolidação

| Chave | Padrão | Descrição |
|---|---|---|
| `consolidation.dm_minutes` | `2` | Janela de agrupamento em conversas individuais. |
| `consolidation.group_minutes` | `30` | Janela de agrupamento em grupos. |
| `consolidation.context_messages` | `10` | Quantas mensagens anteriores incluir como contexto no e-mail. |
| `consolidation.tick_seconds` | `10` | Frequência com que o sistema verifica janelas vencidas. |

A janela funciona como *debounce*: cada mensagem nova reinicia a contagem. `0` significa enviar assim que a próxima verificação rodar.

## Mídia e transcrição

| Chave | Padrão | Descrição |
|---|---|---|
| `attachments.max_mb` | `20` | Limite por anexo. Acima disso, o arquivo não vai no e-mail (continua salvo em `data/media`). |
| `transcription.enabled` | `true` | Liga a transcrição de áudios. |
| `transcription.provider` | `auto` | `auto`, `service` (serviço local), `openai` (nuvem), `command` (binário local) ou `none`. |
| `transcription.model` | `whisper-1` | Modelo usado na API. |
| `transcription.api_key` | vazio | Chave da API compatível com OpenAI. |
| `transcription.base_url` | vazio | URL base (para Groq, servidor local compatível etc.). |
| `transcription.service_url` | vazio | Endereço do serviço local compatível com a API da OpenAI (ex.: `http://127.0.0.1:9000/v1`; dentro do Docker, `http://whisper:8000/v1`). |
| `transcription.command` | vazio | Comando local. Ex.: `whisper-cli -f {file} -otxt -of {out}`. |

Com `provider = auto`, a ordem de preferência é: **serviço local** (`transcription.service_url`) → **API na nuvem** (chave em `transcription.api_key` ou `OPENAI_API_KEY`) → **comando local**. Sem nenhum caminho configurado, o áudio é apenas anexado.

O painel traz presets prontos (**Serviço local (faster-whisper)**, **Serviço local (no Docker)**, **OpenAI (nuvem)** e **Comando local (whisper.cpp)**) e o botão **Testar transcrição**, que consulta o serviço e lista os modelos disponíveis. Guia completo em [TRANSCRIPTION.md](TRANSCRIPTION.md).

## E-mail do sistema

| Chave | Padrão | Descrição |
|---|---|---|
| `mail.system_email` | vazio | Endereço dedicado que envia as notificações. |
| `mail.system_name` | `WhatsRouter` | Nome exibido no remetente. |
| `mail.reply_domain` | vazio | Domínio do endereço de resposta (`conv+<token>@dominio`). Se vazio, usa o domínio de `system_email`. |
| `mail.smtp_host` | vazio | Servidor de envio. |
| `mail.smtp_port` | `587` | Porta de envio. |
| `mail.smtp_secure` | `false` | `true` para SSL direto (normalmente porta 465). |
| `mail.smtp_user` | vazio | Usuário (deixe vazio para servidor sem autenticação). |
| `mail.smtp_password` | vazio | Senha, senha de aplicativo ou token. |
| `mail.imap_host` | vazio | Servidor de leitura. |
| `mail.imap_port` | `993` | Porta de leitura. |
| `mail.imap_secure` | `true` | SSL na leitura. |
| `mail.imap_user` | vazio | Usuário de leitura. |
| `mail.imap_password` | vazio | Senha de leitura. |
| `mail.imap_folder` | `INBOX` | Pasta monitorada. |
| `mail.poll_seconds` | `60` | Intervalo entre verificações da caixa. |
| `mail.mark_as_read` | `true` | Marca a resposta como lida depois de processar. |

### Provedores prontos

| Preset | SMTP | IMAP | Observação |
|---|---|---|---|
| mail.org / mail.com | `smtp.mail.com:587` | `imap.mail.com:993` | Usuário e senha próprios; token quando oferecido pelo provedor. |
| Gmail / Google Workspace | `smtp.gmail.com:465` | `imap.gmail.com:993` | Exige senha de aplicativo com 2FA. |
| Microsoft 365 / Outlook | `smtp.office365.com:587` | `outlook.office365.com:993` | Pode exigir OAuth em contas corporativas. |
| Zoho Mail | `smtp.zoho.com:465` | `imap.zoho.com:993` | Senha de aplicativo. |

## Proprietário e assunto

| Chave | Padrão | Descrição |
|---|---|---|
| `mail.owner_email` | vazio | E-mail que recebe as notificações (o "e-mail do cliente" no painel). |
| `mail.subject_template` | `[WhatsRouter] WhatsApp - {contact} ({phone})` | Modelo do assunto. Variáveis: `{contact}`, `{phone}`, `{count}`, `{kind}`, `{date}`. |
| `mail.allowlist` | vazio | Um endereço por linha. Se preenchido, apenas esses remetentes podem responder. |

## Pausa e assunção manual

| Chave | Padrão | Descrição |
|---|---|---|
| `pause.auto_minutes` | `30` | Tempo de pausa quando você responde pelo celular. |
| `pause.commands_enabled` | `true` | Aceita `!pausar`, `!retomar`, `!retomar-tudo`, `!status`, `!ajuda` pelo WhatsApp. |
| `pause.global` | `false` | Pausa geral (controlada pelos botões do painel, não precisa editar à mão). |
| `pause.global_reason` | vazio | Motivo registrado ao ativar a pausa geral. |

## Grupos e bloqueios

| Chave | Padrão | Descrição |
|---|---|---|
| `groups.enabled` | `true` | Encaminha mensagens de grupos (janela própria de 30 min). |
| `blocklist` | vazio | Um telefone ou JID por linha. Contatos bloqueados são ignorados. |

## Provedor de WhatsApp

| Chave | Padrão | Descrição |
|---|---|---|
| `provider.name` | vazio | `baileys`, `webhook`, `mock` ou vazio para usar o padrão da instalação. |
| `provider.webhook_outbound_url` | vazio | URL que recebe as mensagens a enviar (webhook). |
| `provider.webhook_outbound_token` | vazio | Token enviado no cabeçalho `x-whatsrouter-token`. |
| `provider.webhook_inbound_token` | vazio | Token exigido em `POST /api/webhook/whatsapp`. |

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta do painel e da API. |
| `HOST` | `0.0.0.0` | Endereço de escuta: `0.0.0.0`, `127.0.0.1` ou o IP da máquina na rede (ex.: `192.168.0.1`). |
| `PUBLIC_URL` | vazio | Endereço público exibido no painel (ex.: `https://router.seudominio.com`). |
| `DATA_DIR` | `./data` | Onde ficam banco, mídias e sessão do WhatsApp. |
| `DATABASE_PATH` | `./data/whatsrouter.sqlite` | Caminho do banco SQLite. |
| `SESSION_SECRET` | valor de desenvolvimento | Segredo das sessões do painel. |
| `ADMIN_USERNAME` | `admin` | Usuário criado na primeira execução. |
| `ADMIN_PASSWORD` | `whatsrouter` | Senha criada na primeira execução. |
| `WHATSAPP_PROVIDER` | `baileys` | Provedor padrão quando o painel não define outro. |
| `LOG_LEVEL` | `info` | `trace`, `debug`, `info`, `warn`, `error`. |
| `WEBHOOK_TOKEN` | vazio | Token alternativo para o webhook de entrada. |
| `OPENAI_API_KEY` | vazio | Chave usada pela transcrição. |
| `OPENAI_BASE_URL` | vazio | URL base alternativa para a transcrição. |

As variáveis `WHISPER_PORT` e `WHISPER_MODEL` são lidas pelo instalador do serviço local de transcrição (`scripts/install-transcription.sh`) e pelo perfil `transcricao` do `docker-compose.yml`.
## Rede e acesso

| Chave | Padrão | Descrição |
|---|---|---|
| `server.host` | vazio | Endereço de escuta. Vazio usa `HOST` do ambiente (`0.0.0.0`). Exemplos: `0.0.0.0` (todas as interfaces), `192.168.0.1` (uma interface da rede local), `127.0.0.1` (somente esta máquina). |
| `server.port` | vazio | Porta do painel e da API. Vazio usa `PORT` do ambiente. |
| `server.public_url` | vazio | Endereço externo (ex.: `https://router.seudominio.com`), exibido no painel e usado como referência nos avisos. |

Mudanças de endereço/porta valem depois de reiniciar o processo. O painel mostra o endereço em uso, avisa quando existe alteração pendente e oferece o botão **Reiniciar servidor** — que funciona quando há um supervisor (o `docker-compose.yml` do projeto já usa `restart: unless-stopped`; com systemd ou pm2 o comportamento é o mesmo).

O painel também lista os endereços detectados (localhost e IPs da rede local) e mostra avisos de segurança, por exemplo quando a escuta está aberta em todas as interfaces sem HTTPS.

## Aviso de modo automático
