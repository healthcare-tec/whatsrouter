# Requisitos — WhatsRouter

> **Ata da entrevista de levantamento de requisitos.** Este documento registra o que foi decidido com o proprietário do projeto. Ele é a fonte de verdade para o escopo do MVP. Alterações devem ser propostas por Pull Request alterando este arquivo.

- **Repositório:** <https://github.com/healthcare-tec/whatsrouter> (público, aberto a contribuições)
- **Licença:** MIT
- **Status:** MVP em construção

---

## 1. Visão geral

O **WhatsRouter** é um centralizador de mensagens entre **WhatsApp** e **e-mail**.

Uma conta do WhatsApp é conectada ao sistema. Quando alguém manda mensagem, o sistema:

1. responde automaticamente uma vez informando que a conta opera em **modo automático**;
2. **consolida** as mensagens recebidas em uma janela de tempo;
3. envia **um e-mail por contato** para o e-mail do proprietário da conta do WhatsApp;
4. permite que o proprietário **responda por e-mail** — a resposta volta como mensagem no WhatsApp, mantendo a cadeia da conversa por contato.

O sistema tem **e-mail próprio** (dedicado), **conta de WhatsApp própria** (a do proprietário) e um **painel web de configuração**.

---

## 2. Decisões registradas na entrevista

| # | Tema | Decisão |
|---|---|---|
| 1 | Conexão com WhatsApp | **Baileys** (WhatsApp Web não oficial, conexão por QR Code). Futuramente **n8n** como caminho oficial — por isso a camada de provedor é **plugável (adaptador)**. |
| 2 | Número usado | **Número pessoal do proprietário.** Ele eventualmente assume a conversa manualmente; nesses momentos o sistema **pausa provisoriamente** o envio para o e-mail. |
| 3 | E-mail do sistema | E-mail **dedicado**, inicialmente em **mail.org** (grupo mail.com — IMAP `imap.mail.com` / SMTP `smtp.mail.com`). Autenticação com **usuário e senha próprios** e **token** de acesso. Tudo configurável no painel. |
| 4 | Roteamento da resposta | A resposta é feita **dentro do e-mail**, **mantendo a cadeia de conversa — uma por contato**. O sistema recebe, identifica o contato e **responde pelo WhatsApp**. |
| 5 | E-mail do proprietário | Configurado no sistema: é ele que recebe as mensagens e responde. (O usuário "cliente" é quem manda mensagem no WhatsApp.) |
| 6 | Consolidação — conversas individuais | Janela de **2 minutos**. |
| 7 | Consolidação — grupos | Grupos **entram no escopo**, com janela de **30 minutos**. |
| 8 | Mídia | **Anexada** ao e-mail. |
| 9 | Áudio | **Transcrito** automaticamente. |
| 10 | Infra | **Docker + SQLite**, **instância única** (um número, um e-mail). Arquitetura preparada para multi-conta no futuro. |
| 11 | Stack | **Node.js + TypeScript** (reaproveita o padrão do projeto `Bia`: Baileys 7, Express, Drizzle, React/Vite). |
| 12 | Licença | **MIT**. |
| 13 | Nome | **whatsrouter**. |
| 14 | Repositório | **Público** em `healthcare-tec`, com README (pt-BR) + docs em inglês, `CONTRIBUTING`, `LICENSE`, CI, Docker e templates de issue. |
| 15 | Padrões assumidos pelo agente (sem objeção do proprietário) | Pausa por **detecção automática** ao assumir a conversa + **botão no painel**; comandos `!pausar` / `!retomar` como extra; **contexto**: mensagens novas + últimas 10 da conversa; **aviso automático**: 1× a cada 24 h por contato. |

---

## 3. Requisitos funcionais

### RF-01 — Recebimento de mensagens
- Receber mensagens de **conversas individuais e de grupos** via provedor ativo (Baileys).
- Persistir remetente, texto, tipo de mídia, timestamps e o identificador da mensagem.
- Ignorar mensagens duplicadas (mesmo `wa_message_id`) e mensagens enviadas pelo próprio sistema.

### RF-02 — Aviso de modo automático
- Na **primeira** mensagem de um contato dentro da janela de aviso (padrão **24 h**), enviar a mensagem automática:
  > "Olá! Esta conta está em modo automático. Sua mensagem será encaminhada por e-mail ao responsável e respondida assim que possível. Se quiser, pode enviar mais detalhes."
- O texto é **editável no painel**; o recurso pode ser **desligado**; a janela é configurável.
- Não enviar o aviso durante uma pausa manual nem para contatos na lista de bloqueio.

### RF-03 — Consolidação (janela deslizante)
- Conversas individuais: **2 min** (configurável) após a última mensagem do contato.
- Grupos: **30 min** (configurável).
- Mensagens que chegam dentro da janela são agrupadas em um **único e-mail**.
- Nova mensagem durante a janela **reinicia** a contagem (comportamento "debounce").

### RF-04 — E-mail de notificação
- **Um e-mail por contato/conversa**, para o e-mail do proprietário configurado.
- Assunto padrão: `[WhatsRouter] WhatsApp · <nome do contato> (<telefone>)` — com template configurável.
- Corpo: mensagens novas em ordem cronológica + **últimas 10 mensagens** de contexto (configurável), com data/hora, autor e texto.
- **Mídias anexadas** (imagem, áudio, vídeo, documento) respeitando um limite de tamanho configurável; acima do limite, o anexo é substituído por um aviso e o arquivo permanece salvo em `data/media/`.
- **Áudios transcritos** são exibidos como texto, além do anexo.
- Cabeçalhos de threading por contato: `Message-ID` próprio, `In-Reply-To`/`References` encadeados e `Reply-To` com token da conversa.

### RF-05 — Resposta por e-mail → WhatsApp
- O proprietário responde o e-mail normalmente; o sistema lê a caixa via **IMAP (IDLE)**.
- Identificação do contato por **token no endereço de resposta** (`conv+<token>@<dominio>`) e, como reforço, por `In-Reply-To`/`References`.
- O corpo é limpo (histórico citado, assinaturas e cabeçalhos de resposta removidos) e enviado ao contato como mensagem de texto no WhatsApp.
- Anexos recebidos por e-mail são enviados como mídia no WhatsApp.
- E-mails do próprio sistema (loop) e remetentes não autorizados são ignorados.
- A mensagem enviada é marcada como `read`/`answered` na caixa.

### RF-06 — Assunção manual e pausa
- **Detecção automática:** quando o proprietário responde pelo celular, o sistema identifica a mensagem de saída manual e **pausa aquela conversa** (padrão 30 min).
- **Botão no painel:** pausa global e pausa por contato.
- **Comandos no WhatsApp** (enviados pelo proprietário ao próprio número): `!pausar`, `!retomar`, `!status`.
- Durante a pausa o sistema **não envia e-mails**, mas **continua acumulando** mensagens. Ao retomar, elas são enviadas em um e-mail rotulado "mensagens durante a pausa".

### RF-07 — Painel de configuração
Aplicação web com **login de administrador** contendo:
- **Mensagem automática** (texto e ativação) e janela de aviso;
- **E-mail do sistema**: remetente, SMTP (host, porta, TLS, usuário, senha/token), IMAP (host, porta, TLS, usuário, senha/token) e domínio usado no `Reply-To`;
- **E-mail do proprietário** (destinatário das notificações);
- **Janelas de consolidação** (individual e grupos), limite de anexo, número de mensagens de contexto;
- **Transcrição de áudio** (ligada/desligada, provedor e chave);
- **Lista de bloqueio** de contatos e configuração de grupos;
- **Botões de pausa**, status da conexão do WhatsApp (QR Code), fila de envio e logs;
- Testes: **enviar e-mail de teste** e **testar conexão IMAP**.

### RF-08 — Observabilidade
- Log de eventos (mensagens recebidas, e-mails enviados, respostas processadas, pausas, erros) visível no painel.
- Endpoint `/healthz` para monitoramento.

---

## 4. Requisitos não funcionais

| ID | Requisito |
|---|---|
| RNF-01 | Auto-hospedado: **Docker Compose + SQLite**, sem dependências externas obrigatórias. |
| RNF-02 | Zero configuração por arquivos: tudo pelo painel; segredos mascarados na API e gravados no banco (com aviso de que devem ser protegidos pelo volume). |
| RNF-03 | Arquitetura de **provedor plugável** de WhatsApp (`baileys`, `webhook` — pronto para n8n — e futuros). |
| RNF-04 | Código em inglês, README em pt-BR. Fácil de contribuir: `pnpm install && pnpm dev`. |
| RNF-05 | Testes automatizados para as regras críticas (janelas, aviso automático, threading, parsing de resposta, comandos) e CI no GitHub Actions. |
| RNF-06 | Nada de perda de mensagem: mensagens são persistidas antes de qualquer envio; envios falhos ficam em fila com retentativa. |
| RNF-07 | Respeitar a privacidade: nenhum dado sai da instância, exceto o e-mail para o proprietário e, se habilitado, a transcrição para o provedor de STT escolhido. |

---

## 5. Fora de escopo do MVP

- Múltiplos números/e-mails no mesmo servidor (multi-tenant) — arquitetura preparada, implementação futura.
- Envio de mídia complexa com legendas/edição.
- Respostas rápidas/botões interativos do WhatsApp.
- Interface de leitura de e-mail completa (o sistema usa o cliente de e-mail do proprietário).

---

## 6. Roadmap

1. **MVP:** Baileys + SMTP/IMAP + consolidação + aviso automático + painel + Docker.
2. **Provedor n8n/webhook** oficial (fluxo de trabalho externo).
3. **Multi-conta** (vários números/e-mails).
4. **Transcrição local** (whisper.cpp) documentada como padrão sem nuvem.
5. **Resumo diário** e relatórios.