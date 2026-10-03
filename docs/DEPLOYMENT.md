# Implantação

O WhatsRouter roda em um único contêiner com SQLite — um servidor pequeno (1 vCPU, 1 GB de RAM) já dá conta de um número de WhatsApp.

## 1. Docker Compose (recomendado)

```bash
git clone https://github.com/healthcare-tec/whatsrouter.git
cd whatsrouter
cp .env.example .env
```

Edite o `.env`:

```env
PORT=3000
SESSION_SECRET=<uma string aleatoria longa>
ADMIN_PASSWORD=<uma senha forte>
WHATSAPP_PROVIDER=baileys
```

Suba o serviço:

```bash
docker compose up -d --build
docker compose logs -f whatsrouter
```

Acesse `http://<servidor>:3000`, faça login e complete a configuração no painel (e-mail do sistema, e-mail do proprietário e leitura do QR Code).

### Onde ficam os dados

Tudo (banco SQLite, mídias e a sessão do WhatsApp) vive no volume `whatsrouter-data`, montado em `/app/data`. **Essa pasta é o seu backup.** Quem tiver acesso a ela tem acesso à conta do WhatsApp.

```bash
# backup
docker run --rm -v whatsrouter-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/whatsrouter-backup-$(date +%F).tar.gz -C /data .

# restauração
docker run --rm -v whatsrouter-data:/data -v "$PWD":/backup alpine \
  sh -c "rm -rf /data/* && tar xzf /backup/whatsrouter-backup-AAAA-MM-DD.tar.gz -C /data"
docker compose restart whatsrouter
```

## 2. Proxy reverso com HTTPS (obrigatório para uso real)

O QR Code e as credenciais trafegam pelo painel; publique-o apenas com TLS. Exemplo com Caddy:

```caddyfile
router.seudominio.com {
    reverse_proxy 127.0.0.1:3000
}
```

Com Nginx:

```nginx
server {
    listen 443 ssl;
    server_name router.seudominio.com;

    ssl_certificate     /etc/letsencrypt/live/router.seudominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/router.seudominio.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}
```

Se o proxy estiver no mesmo host, não exponha a porta 3000 publicamente: em `docker-compose.yml`, troque a publicação por `127.0.0.1:3000:3000`.

## 3. Execução sem Docker

Requisitos: Node.js 22+, pnpm 9+, e ferramentas de compilação (`build-essential`, `python3`) caso o `better-sqlite3` precise compilar.

```bash
pnpm install
pnpm build                     # painel + servidor
NODE_ENV=production node server/dist/index.js
```

Serviço systemd de exemplo (`/etc/systemd/system/whatsrouter.service`):

```ini
[Unit]
Description=WhatsRouter
After=network-online.target

[Service]
Type=simple
User=whatsrouter
WorkingDirectory=/opt/whatsrouter
EnvironmentFile=/opt/whatsrouter/.env
ExecStart=/usr/bin/node /opt/whatsrouter/server/dist/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## 4. Atualização

```bash
git pull
docker compose up -d --build
```

As migrações do banco são aplicadas automaticamente na inicialização. Faça backup do volume antes de atualizar em produção.

## 5. Operação do dia a dia

- **Status**: mostra a conexão (e o QR Code quando precisar parear), a fila de mensagens, os últimos envios e a leitura do e-mail.
- **Conversas**: histórico por contato, com pausar, retomar, enviar agora, bloquear e enviar mensagem direta.
- **Histórico**: eventos do sistema, e-mails enviados e respostas recebidas.
- `/api/healthz` serve para monitoramento externo (usa o `HEALTHCHECK` da imagem).

## 6. Problemas comuns

| Sintoma | Causa provável e solução |
|---|---|
| QR Code não aparece | Provedor diferente de `baileys`, ou conexão em andamento. Confira Status e os logs do contêiner. |
| Sessão cai com frequência | O celular ficou offline por muito tempo ou a sessão foi encerrada no aparelho. Leia o QR Code de novo em Status. |
| E-mails não chegam | Teste "Enviar e-mail de teste" em Configurações. Verifique `mail.owner_email`, o spam do destinatário e se o provedor exige senha de aplicativo. |
| Respostas não voltam para o WhatsApp | Teste "Validar credenciais SMTP" e "Testar leitura (IMAP)". Confirme que o e-mail está sendo respondido no endereço `conv+...` (sem trocar o destinatário) e que o remetente está na lista autorizada, se usada. |
| Mensagens acumulando e nenhum e-mail | Fila parada por pausa (global ou da conversa) ou e-mail do sistema/proprietário não configurado — veja o Histórico. |
| Transcrição não acontece | Nenhum driver disponível: informe a chave da API ou um comando local. O campo "Motor de transcrição em uso" mostra o que está ativo. |