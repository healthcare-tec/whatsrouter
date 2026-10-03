# Provedores de WhatsApp

O WhatsRouter não conhece o WhatsApp diretamente: ele fala com um **provedor**. Trocar de provedor é uma configuração no painel, não uma reescrita.

```ts
interface WhatsAppProvider {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): ProviderStatus;
  send(to: string, content: OutboundContent): Promise<{ id: string }>;
  on(event: 'message' | 'outbound' | 'status', handler: (payload: any) => void): void;
}
```

| Provedor | Estado | Quando usar |
|---|---|---|
| `baileys` | pronto | Uso padrão: conecta pelo WhatsApp Web com leitura de QR Code. |
| `webhook` | pronto | Integração com um fluxo externo (n8n, Cloud API oficial da Meta, outro gateway). |
| `mock` | pronto | Demonstração, testes e desenvolvimento sem celular. |

## Baileys (padrão)

Conecta como um "aparelho vinculado", igual ao WhatsApp Web. Não é a API oficial — leia os avisos do [README](../README.md).

- A sessão fica em `data/whatsapp-session`. Apagar essa pasta exige parear de novo.
- Mídias são baixadas automaticamente (limite de 64 MB por arquivo) para anexar e transcrever.
- Mensagens que saem **do seu celular** são detectadas e pausam a conversa (assunção manual).

## Webhook (pronto para n8n)

O n8n pode ser o caminho "oficial" da ponte: ele fala com a Cloud API da Meta (ou com qualquer gateway) e o WhatsRouter apenas troca mensagens com ele por HTTP.

### Configuração no painel

1. **Provedor ativo**: `Webhook externo (n8n)`.
2. **URL de saída**: o webhook do n8n que enviará mensagens ao WhatsApp.
3. **Token de saída**: enviado no cabeçalho `x-whatsrouter-token`.
4. **Token de entrada**: exigido em `POST /api/webhook/whatsapp`.

### O que o WhatsRouter envia (saída)

```http
POST <provider.webhook_outbound_url>
x-whatsrouter-token: <provider.webhook_outbound_token>
content-type: application/json
```

```json
{
  "to": "5511999999999@s.whatsapp.net",
  "text": "mensagem escrita por voce",
  "media": {
    "base64": "....",
    "mimeType": "image/jpeg",
    "fileName": "foto.jpg"
  }
}
```

O n8n deve responder `2xx`; o campo `id` da resposta é opcional.

### O que o n8n envia (entrada)

```http
POST http://<whatsrouter>/api/webhook/whatsapp
x-whatsrouter-token: <provider.webhook_inbound_token>
content-type: application/json
```

```json
{
  "waMessageId": "wamid.HBgN...",
  "chatJid": "5511999999999@s.whatsapp.net",
  "senderJid": "5511999999999@s.whatsapp.net",
  "senderName": "Maria",
  "kind": "dm",
  "messageKind": "text",
  "text": "ola, tudo bem?",
  "fromMe": false,
  "timestamp": "2026-10-03T14:00:00.000Z",
  "media": {
    "base64": "....",
    "mimeType": "audio/ogg",
    "fileName": "audio.ogg"
  }
}
```

Campos relevantes:

| Campo | Obrigatório | Observação |
|---|---|---|
| `chatJid` | sim | `...@s.whatsapp.net` para conversas e `...@g.us` para grupos. |
| `waMessageId` | recomendado | Usado para deduplicar. |
| `kind` | não | `dm` (padrão) ou `group`; grupos recebem a janela de 30 minutos. |
| `messageKind` | não | `text`, `image`, `audio`, `video`, `document`, `sticker`, `location`, `contact`. |
| `fromMe` | não | `true` indica mensagem que saiu do seu celular: dispara a **pausa** da conversa. |
| `media.base64` | não | Conteúdo da mídia; é gravado em disco, anexado ao e-mail e transcrito se for áudio. |

### Fluxo sugerido no n8n

1. **Webhook (Meta)** → normaliza o payload para o formato acima → **HTTP Request** para `/api/webhook/whatsapp`.
2. **Webhook (n8n)** recebendo do WhatsRouter → **HTTP Request** para a Cloud API da Meta enviando a mensagem.
3. Guarde o `x-whatsrouter-token` em variáveis do n8n e nunca no código.

## Escrevendo um novo provedor

1. Crie `server/src/providers/meu-provedor.ts` estendendo `BaseProvider`.
2. Implemente `start`, `stop`, `status` e `send`; emita `emitMessage` (mensagens recebidas), `emitOutbound` (mensagens que saíram do número) e `emitStatus`.
3. Registre no `createProvider` de `server/src/providers/index.ts` e inclua o nome na constante aceita em `resolveProviderName`.
4. Adicione o item no campo `provider.name` do painel (`web/src/pages/Settings.tsx`) e cubra com testes.

Não é preciso tocar em consolidação, e-mail ou banco: toda a regra de negócio consome o tipo `InboundMessage`.