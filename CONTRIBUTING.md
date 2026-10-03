# Como contribuir com o WhatsRouter

Obrigado pelo interesse. Este projeto é aberto e feito para ser fácil de rodar, entender e melhorar.

## Antes de começar

- Leia [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) — é a ata da entrevista de requisitos e a fonte de verdade do escopo.
- Leia [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — mostra as camadas e os fluxos principais.
- Para mudanças de comportamento, abra uma **issue** antes de escrever o código. Isso evita trabalho perdido.

## Preparando o ambiente

```bash
git clone https://github.com/healthcare-tec/whatsrouter.git
cd whatsrouter
pnpm install
cp .env.example .env
pnpm dev            # servidor + API na porta 3000
pnpm dev:web        # painel com recarga instantânea na porta 5173
pnpm test           # testes
bash scripts/smoke-test.sh   # fluxo completo: WhatsApp (mock) -> e-mail SMTP local
```

Dicas:

- Use `WHATSAPP_PROVIDER=mock` para testar sem conectar um celular. O painel tem o botão "Simular mensagem recebida".
- Use `node scripts/dev-smtp.mjs 2525 ./data/smtp-inbox` para capturar os e-mails em disco em vez de enviá-los.
- O banco fica em `data/whatsrouter.sqlite`; apagar esse arquivo reinicia a instalação.

## Padrões de código

- **TypeScript estrito** em todo o código. `pnpm typecheck` precisa passar.
- **Código, nomes e comentários em inglês.** Documentação e interface em português (traduções são bem-vindas).
- Mantenha as regras de negócio em módulos puros e testáveis (`server/src/router`, `server/src/mail`) e deixe o acesso ao banco concentrado em `server/src/store.ts`.
- Nada de segredo em log. O painel nunca devolve credenciais em texto claro (use `SECRET_KEYS`).
- Toda mensagem recebida é persistida **antes** de qualquer envio; nunca descarte mensagens em caso de erro.

## Testes

- Toda regra de negócio nova precisa de teste (janelas de consolidação, aviso automático, pausa, threading, comandos, limpeza de resposta).
- Integrações que dependem de SMTP/IMAP devem ser testadas com mocks (`vi.mock`) ou com o servidor SMTP local.
- Antes de abrir o Pull Request, rode:

```bash
pnpm typecheck
pnpm test
pnpm build
bash scripts/smoke-test.sh
```

## Fluxo de Pull Request

1. Faça um fork (ou use uma branch no próprio repositório, se tiver acesso).
2. Crie uma branch descritiva: `feat/consolidacao-grupos`, `fix/imap-idle`, `docs/readme-en`.
3. Commits pequenos e explicativos (padrão sugerido: `feat:`, `fix:`, `docs:`, `test:`, `chore:`).
4. Atualize a documentação afetada — inclusive `docs/CONFIGURATION.md` quando criar uma configuração nova.
5. Descreva no PR: o problema, a solução, como testar e o que muda para quem já usa o sistema.
6. Ajuste o que a revisão apontar; o CI precisa ficar verde.

## Ideias de contribuição

- Tradução da documentação para inglês.
- Provedor de WhatsApp com a **Cloud API oficial** da Meta.
- Fluxo pronto de **n8n** (arquivo de exemplo exportável) usando o provedor webhook.
- Transcrição local documentada com `whisper.cpp` (`transcription.command`).
- Multi-conta (vários números e e-mails no mesmo servidor).
- Testes de integração com IMAP simulado.

## Código de conduta

Ao participar, você concorda com o [Código de Conduta](CODE_OF_CONDUCT.md).