# Como ajudar as pessoas a encontrarem este projeto

Um repositório bom mas invisível não ajuda ninguém. Aqui está o que já foi feito e o que depende de você (ou de uma contribuição) para o projeto ser encontrado por quem procura uma ponte WhatsApp ↔ e-mail.

## Já configurado

| Item | Situação |
|---|---|
| Descrição do repositório | Escrita com os termos que as pessoas realmente buscam ("ponte WhatsApp ↔ e-mail", "open source", "Docker + SQLite") |
| Tópicos | 20 tópicos, no limite do GitHub: `whatsapp-to-email`, `email-to-whatsapp`, `whatsapp-email-bridge`, `email-gateway`, `whatsapp-automation`, `self-hosted`, `baileys`, `imap`, `smtp`, `n8n`, `docker`, `sqlite`, entre outros |
| Palavras-chave no README | Bloco "Procurando por:" em português e "Looking for:" em inglês, além dos selos no topo |
| Página de destino | `docs/index.html`, com metadados, Open Graph, dados estruturados (`SoftwareApplication` e `FAQPage`) e o resumo em inglês |
| Imagem de compartilhamento | `docs/assets/social-card.png` (1200×630) pronta para o preview social |
| Telas reais | `docs/assets/screenshots/` usadas no README e na página |
| Release | `v0.1.0` publicada — releases aparecem em buscas e no feed de quem acompanha o repositório |
| FAQ | `docs/FAQ.md` com perguntas escritas do jeito que as pessoas pesquisam |

## Ativar o GitHub Pages (3 cliques)

A página de destino ainda não está servida porque a API não permitiu ativar o Pages com a permissão disponível. Para publicar:

1. No repositório, abra **Settings → Pages**.
2. Em *Build and deployment*, escolha **Deploy from a branch**.
3. Selecione a branch **main**, a pasta **/docs** e salve.

Em um ou dois minutos a página estará em `https://healthcare-tec.github.io/whatsrouter/`. Depois disso, vale atualizar o campo **Website** do repositório (o ícone de engrenagem ao lado de "About") com esse endereço — é o que faz a busca interna do GitHub e os buscadores tratarem a página como a casa do projeto.

## Ajustes manuais no GitHub (levam menos de dois minutos)

- **Social preview**: em *Settings*, envie `docs/assets/social-card.png` como imagem de preview. Sem isso, o link compartilhado no WhatsApp, LinkedIn, X ou Discord aparece sem imagem nenhuma.
- **Website**: informe a URL do Pages (ou do README) no campo do "About".
- **Discussions**: ative em *Settings → Features* para concentrar dúvidas de uso sem poluir as issues.
- **Wiki**: desnecessário — a documentação fica em `docs/`, versionada junto do código.

## Onde divulgar (com texto pronto)

Listas e comunidades que costumam receber bem projetos auto-hospedados. Publique **uma por vez**, adaptando o texto, e responda os comentários:

| Onde | Como entrar |
|---|---|
| [awesome-selfhosted](https://github.com/awesome-selfhosted/awesome-selfhosted) | Pull Request adicionando o projeto em *Communication - Custom communication systems* |
| [awesome-whatsapp](https://github.com/HugoGresse/whatsapp) | Pull Request na seção de ferramentas/bibliotecas |
| [awesome-n8n](https://github.com/n8n-io/awesome-n8n) | Pull Request, destacando o provedor webhook |
| r/selfhosted, r/homelab, r/n8n, r/opensource | Post curto com a captura de tela e o link do repositório |
| Hacker News | *Show HN: WhatsRouter — self-hosted WhatsApp ↔ e-mail bridge* |
| dev.to / Medium | Artigo "Como recebo o WhatsApp no e-mail sem pagar por mensagem" com o passo a passo |
| Product Hunt / Indie Hackers | Lançamento com foco em "não perder mensagem de cliente" |

Texto-base para posts (ajuste o tom e conte o seu caso real):

> **WhatsRouter — WhatsApp no seu e-mail, e o e-mail de volta ao WhatsApp**
>
> Cansei de depender do celular para não perder mensagem. O WhatsRouter roda no meu servidor, recebe as mensagens do WhatsApp, junta as conversas de cada contato e manda tudo para o meu e-mail — com áudio transcrito e mídia anexada. Eu respondo o e-mail e a resposta chega no WhatsApp do contato. Quando eu mesmo respondo pelo celular, ele entende e para de me notificar por 30 minutos.
>
> É open source (MIT), roda com Docker e SQLite, e a documentação está em português e inglês: github.com/healthcare-tec/whatsrouter

## Ideias que aumentam a descoberta no médio prazo

- Um artigo em inglês explicando a arquitetura (threading por contato é a parte que mais gera dúvida) costuma render links espontâneos.
- Vídeo curto (2 minutos) mostrando o QR Code, uma mensagem chegando no e-mail e a resposta voltando ao WhatsApp converte muito melhor do que texto.
- Publicar o `docker-compose.yml` no [Docker Hub](https://hub.docker.com/) ou no [GitHub Container Registry](https://docs.github.com/packages) permite `docker run whatsrouter`, o formato preferido de quem procura por auto-hospedagem.
- Exemplo de fluxo n8n exportável (`.json`) atrai a comunidade de automação e é um dos itens do [roadmap](ROADMAP.md).