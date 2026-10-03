## O que muda

<!-- Descreva o problema e a solução em poucas linhas. -->

## Como testar

<!-- Passos para o revisor reproduzir, incluindo comandos quando fizer sentido. -->

```bash
pnpm typecheck
pnpm test
pnpm build
bash scripts/smoke-test.sh
```

## Checklist

- [ ] Testes cobrindo a mudança (ou justificativa de por que não se aplica)
- [ ] `docs/CONFIGURATION.md` atualizado, se houver configuração nova
- [ ] `docs/REQUIREMENTS.md` atualizado, se o escopo mudou
- [ ] Sem credenciais, tokens ou dados reais em logs, código ou testes
- [ ] Migração do banco incluída, se o schema mudou (`pnpm db:generate`)