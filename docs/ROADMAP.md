# Roadmap

O escopo do MVP está descrito em [REQUIREMENTS.md](REQUIREMENTS.md). Esta é a ordem sugerida para o que vem depois — sugestões são bem-vindas nas issues.

## Concluído (0.1.0)

- Consolidação por contato com janelas de 2 min (conversas) e 30 min (grupos).
- Notificação por e-mail com anexos, transcrição de áudio e contexto.
- Resposta por e-mail roteada para o WhatsApp, com uma cadeia de conversa por contato.
- Aviso automático de modo automático (uma vez a cada 24 h por contato).
- Pausa automática ao assumir a conversa, botão no painel e comandos pelo WhatsApp.
- Painel completo de configuração, status com QR Code, conversas e histórico.
- Camada de provedores plugável (Baileys, webhook e mock), Docker Compose, SQLite, CI e testes.

## Próximo

1. **Provedor n8n pronto para uso**: um fluxo de exemplo exportável, com o passo a passo publicado no repositório.
2. **Provedor da Cloud API oficial da Meta** usando a mesma interface do provedor webhook.
3. **Transcrição acelerada por GPU e idioma por contato**: usar GPU no serviço local e fixar o idioma do áudio em contatos específicos.
4. **Resumo diário**: e-mail opcional com o panorama do dia (contatos, mensagens, pendências).

## Depois

5. **Multi-conta**: vários números de WhatsApp e vários e-mails no mesmo servidor, com isolamento entre contas.
6. **Regras por contato**: janelas, aviso automático e transcrição diferentes por contato ou grupo.
7. **Rótulos/etiquetas**: marcar conversas (cliente, família, urgente) direto pelo e-mail ou pelo painel.
8. **Integração com agenda/tarefas**: transformar mensagens marcadas em tarefas (CalDAV, Todoist, e-mail marcado).
9. **Exportação e retenção**: política de expurgo de mídias e exportação do histórico.
10. **Notificações opcionais em outros canais**: Telegram, ntfy, webhook genérico.

## Ideias de longo prazo

- Busca semântica no histórico de conversas.
- Modo "plantão": escalonamento quando o proprietário não responde em X horas.
- App móvel ou PWA para acompanhar a fila quando não houver acesso ao e-mail.
- Suporte a OAuth2 (Gmail/Microsoft) para contas que não aceitam senha de aplicativo.
## Concluído (0.2.0)

- **Rede e acesso** no painel: endereço de escuta configurável (`0.0.0.0`, IP da rede ou `127.0.0.1`), endereços detectados e botão de reinício.
- **Gerar QR Code** sob demanda e **código de pareamento** de 8 dígitos para a primeira conexão.
- **Serviço local de transcrição** com instalação em um comando, imagem Docker opcional e teste pelo painel ([TRANSCRIPTION.md](TRANSCRIPTION.md)).

## Próximo
