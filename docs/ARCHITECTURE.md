# Architecture — WhatsRouter

> English version of the architecture document. The requirement source of truth is [`REQUIREMENTS.md`](./REQUIREMENTS.md) (pt-BR).

## 1. Big picture

```
 WhatsApp (pessoal)
        │  QR / sessão Baileys
        ▼
 ┌──────────────────────────────┐
 │  Provider layer (pluggable)  │   baileys | webhook (n8n) | mock
 └──────────────┬───────────────┘
                │ InboundMessage
                ▼
 ┌──────────────────────────────┐
 │   Ingest pipeline            │
 │  1. dedupe (wa_message_id)   │
 │  2. blocklist / groups       │
 │  3. auto-reply guard (24h)   │
 │  4. manual takeover → pause  │
 │  5. persist message          │
 │  6. schedule consolidation   │
 └──────────────┬───────────────┘
                │  SQLite (Drizzle)
                ▼
 ┌──────────────────────────────┐
 │  Consolidation scheduler     │   DM 2 min · group 30 min (debounce)
 └──────────────┬───────────────┘
                │ flush when due & not paused
                ▼
 ┌──────────────────────────────┐
 │  Mail composer               │  subject template, context (10 msgs),
 │  (nodemailer / SMTP)         │  attachments, transcription, threading
 └──────────────┬───────────────┘
                │  Reply-To: conv+<token>@domain
                ▼
        E-mail do proprietário
                │  resposta
                ▼
 ┌──────────────────────────────┐
 │  Mail reader (IMAP IDLE)     │  token + In-Reply-To/References
 │  reply cleaner               │
 └──────────────┬───────────────┘
                │ OutboundMessage
                ▼
        Provider.send() → WhatsApp
```

## 2. Layers

| Layer | Folder | Responsibility |
|---|---|---|
| Provider | `server/src/providers` | Abstract WhatsApp transport. `types.ts` defines `WhatsAppProvider`; `baileys.ts` implements it over WhatsApp Web; `webhook.ts` is a generic HTTP in/out provider (n8n-ready, proves the adapter contract); `mock.ts` powers tests and demos without a phone. |
| Ingest | `server/src/router` | Rules that decide *what happens* to each message: dedupe, blocklist, group policy, auto-reply notice, manual takeover detection, pause state, consolidation windows, owner commands. |
| Mail | `server/src/mail` | SMTP sending, IMAP reading, thread tokens, message composition, reply cleaning. |
| Media | `server/src/media` | Download WhatsApp media to `data/media/`, transcribe audio through a pluggable STT driver (`none`, `openai`, `command`). |
| Store | `server/src/db` | Drizzle schema + SQLite client + migrations. |
| API | `server/src/api` | Express REST API + cookie session auth for the panel + `/api/webhook/*` for the webhook provider. |
| Panel | `web/` | React + Vite + Tailwind admin UI (login, settings, status/QR, conversations, logs). |

## 3. Data model (SQLite)

- **settings** — key/value store; single instance configuration (mail, windows, templates, pause, feature flags).
- **auth_users / sessions** — panel admin login.
- **contacts** — `jid`, phone, push name, `is_group`, blocked flag, `last_notified_at` (auto-reply guard).
- **conversations** — one per contact/group: `token` (unique, used in `Reply-To`), kind, `last_activity_at`, `consolidate_due_at` (debounce deadline), `paused_until`, `pause_reason`, `thread_message_id` (last Message-ID sent, for `References`), counters.
- **messages** — every inbound/outbound message: `wa_message_id` (unique), direction, `source` (`system` | `manual` | `email`), kind, text, `transcript`, media path, mime, size, `outbox_id` (null = still queued), timestamps.
- **outbox** — one row per notification e-mail: status (`pending`/`sent`/`failed`), subject, body snapshot, message ids, `email_message_id`, attempts, error, `sent_at`.
- **inbound_emails** — every processed reply: raw identifiers, resolved conversation, cleaned body, status, error (idempotency by `Message-ID`).
- **events** — audit log shown in the panel.

## 4. Key flows

### 4.1 Inbound WhatsApp message
1. Provider normalizes and emits `InboundMessage`.
2. Dedupe on `wa_message_id`; store sender/kind/text/media metadata.
3. If `fromMe`: treat as **manual takeover** — mark the conversation paused for N minutes (configurable, default 30) and log it.
4. Else: upsert contact + conversation; apply blocklist; auto-reply guard (1 per 24 h per contact); persist; set `consolidate_due_at = now + window(kind)`.
5. Media is downloaded asynchronously and audio transcribed; failures don't block the notification.

### 4.2 Consolidation flush
A ticker (10 s) selects conversations where `consolidate_due_at <= now` and `paused_until <= now`, then:
1. builds an `outbox` row with pending messages (+ context of the last N);
2. sends via SMTP with `Reply-To: conv+<token>@<domain>`, `Message-ID` and `References`;
3. links the messages to the outbox and marks it sent/failed.

Paused conversations are skipped — their messages keep accumulating. On resume, the flush adds the label **"mensagens durante a pausa"**.

### 4.3 Reply by e-mail
1. IMAP IDLE on `INBOX`; for each unseen message:
2. resolve the conversation: recipient token (`conv+<token>@`, checked in `To`, `Cc`, `Delivered-To`, `X-Original-To`) **or** `In-Reply-To`/`References` matching `outbox.email_message_id`;
3. ignore system senders and unauthorized senders if an allow-list is configured;
4. strip quoted history/signature;
5. send through the provider; mark the e-mail as seen; log the event.

### 4.4 Pause & resume
- Sources of pause: automatic (manual takeover detected), panel button (global or per contact), WhatsApp command (`!pausar`, `!retomar`, `!status` to the owner's own number).
- While paused: no e-mail is sent, messages keep accumulating, panel shows the pending count.
- Resume flushes the backlog in one labeled e-mail.

## 5. Provider contract (why n8n is a drop-in later)

```ts
interface WhatsAppProvider {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): ProviderStatus;              // connection state, QR, self id
  on(event: 'message', handler: (m: InboundMessage) => void): void;
  on(event: 'outbound', handler: (m: OutboundMessage) => void): void; // manual takeover detection
  send(to: string, content: OutboundContent): Promise<{ id: string }>;
}
```

The `webhook` provider receives inbound JSON at `POST /api/webhook/whatsapp` (token-protected) and forwards outbound messages to a configured URL — that is exactly how an n8n workflow exposes an official WhatsApp Cloud API bridge. Switching provider is a settings change, not a rewrite.

## 6. Security

- Panel behind cookie session + bcrypt-hashed admin password (set on first run / via env).
- `/api/webhook/whatsapp` requires a shared token.
- Secrets are never returned in plain text by the API (masked as `••••`); they live in the SQLite volume, which must be protected by the operator (documented).
- Since Baileys uses the WhatsApp Web protocol, a dedicated number is recommended; using a personal number carries the usual non-official-client risk (documented in the README).