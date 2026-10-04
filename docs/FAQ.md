# Perguntas frequentes

Respostas curtas para as dúvidas mais comuns — e para os termos que as pessoas realmente digitam ao procurar uma solução assim.

## Sobre o propósito

**O que é o WhatsRouter?** É uma ponte *WhatsApp ↔ e-mail* auto-hospedada: as mensagens que chegam no seu WhatsApp são consolidadas por contato e enviadas para o seu e-mail; quando você responde o e-mail, a resposta volta como mensagem de texto no WhatsApp do contato.

**Como encaminhar mensagens do WhatsApp para o e-mail?** Conecte um número de WhatsApp, informe o e-mail do sistema e o seu e-mail no painel. A partir daí o encaminhamento é automático, com uma janela de consolidação de 2 minutos para conversas e 30 minutos para grupos.

**Dá para responder o WhatsApp pelo e-mail?** Sim. Cada notificação chega com um endereço de resposta exclusivo daquele contato (`conv+<token>@seudominio`). Você responde normalmente e o sistema envia a mensagem no WhatsApp, mantendo o histórico citado fora da mensagem (ele é removido automaticamente).

**Serve para atender clientes?** Serve para não perder mensagem: quem escreve recebe o aviso de modo automático e você responde quando puder, do e-mail. Não é um CRM: não tem funil, etiquetas de vendas nem filas de atendimento (isso está no roadmap).

**Funciona com grupos?** Sim, com uma janela própria de 30 minutos, e pode ser desligado nas configurações.

## Sobre instalação e requisitos

**Quanto custa?** Nada. É open source, licença MIT, e roda na sua própria máquina — não há cobrança por mensagem nem por usuário.

**O que eu preciso para rodar?** Docker (recomendado) ou Node.js 22+, e um endereço de e-mail dedicado com acesso SMTP e IMAP. Um servidor de 1 vCPU e 1 GB de RAM é suficiente.

**Preciso de um número dedicado de WhatsApp?** Não é obrigatório, mas é recomendado. O sistema foi desenhado para o número pessoal, com pausa automática quando você assume a conversa; ainda assim, a conexão padrão usa o protocolo não oficial do WhatsApp Web e existe risco de bloqueio.

**Funciona com a API oficial do WhatsApp?** Ainda não por padrão: existe um provedor *webhook* já pronto, pensado para plugar um fluxo externo (por exemplo, n8n) que fale com a Cloud API da Meta. Um provedor nativo da Cloud API está no roadmap.

**Quais provedores de e-mail funcionam?** Qualquer um com SMTP e IMAP. Há presets para mail.org/mail.com, Gmail/Google Workspace, Microsoft 365/Outlook e Zoho Mail (nessas duas últimas, use senha de aplicativo).

**Como conecto o WhatsApp na primeira vez?** Em **Status**, clique em **Gerar QR Code** e leia o código com o WhatsApp (Aparelhos conectados). Sem câmera à mão, informe o número com DDI e DDD e use o **código de pareamento** de 8 dígitos. Se a sessão cair, o sistema reconecta sozinho; se você desconectar no celular, é só gerar um QR novo.

**Consigo abrir o painel de outro aparelho da minha rede?** Sim. Em **Configurações → Rede e acesso**, escolha o endereço de escuta: `0.0.0.0` (todos os aparelhos, padrão), o IP da máquina (por exemplo `192.168.0.1`) ou `127.0.0.1` (só esta máquina). O painel mostra os endereços detectados, avisa sobre exposição sem HTTPS e tem o botão **Reiniciar servidor** para aplicar a mudança.

## Sobre privacidade e segurança

**Para onde vão meus dados?** Ficam todos na sua instalação: banco SQLite, mídias em disco e a sessão do WhatsApp em um volume local. O único destino externo é o seu próprio e-mail.

**A transcrição de áudio envia meus áudios para fora?** Só se você escolher um provedor de nuvem. O caminho recomendado é o **serviço local**: rode `bash scripts/install-transcription.sh`, escolha o preset *Serviço local (faster-whisper)* no painel e nada sai da máquina. Também dá para usar um comando local (por exemplo `whisper-cli -f {file} -otxt -of {out}`). Detalhes em [TRANSCRIPTION.md](TRANSCRIPTION.md).

**Quanto tempo leva para instalar a transcrição local?** Um comando, se você já tem Docker: `bash scripts/install-transcription.sh` (modelo `small`, porta 9000). A primeira execução baixa o modelo; depois fica em cache. Sem Docker, há uma receita com Python no [TRANSCRIPTION.md](TRANSCRIPTION.md).

**Como faço backup?** Copie o volume `whatsrouter-data` (ou a pasta `data/`): ele contém o banco, as mídias e a sessão do WhatsApp. O passo a passo está em [DEPLOYMENT.md](DEPLOYMENT.md).

**Alguém consegue ler minhas conversas?** Quem tiver acesso ao servidor e ao volume de dados, sim — é uma instalação sua. Publique o painel apenas com HTTPS e proteja a pasta de dados.

## Sobre uso no dia a dia

**Como faço o sistema parar de mandar e-mails de um contato?** Responda aquele contato pelo celular (ele pausa sozinho por 30 minutos, configurável), use o botão de pausa no painel ou envie `!pausar` no WhatsApp. `!pausar 120` pausa por 2 horas.

**Perdi uma mensagem durante a pausa?** Não. Elas ficam acumuladas e são enviadas em um único e-mail rotulado “mensagens durante a pausa” quando a conversa é retomada.

**Posso mandar uma mensagem pelo painel?** Sim: em Conversas, escreva e envie direto pelo WhatsApp, além de poder forçar o envio do e-mail daquela conversa.

**E se a sessão do WhatsApp cair?** O sistema tenta reconectar sozinho. Se a sessão for encerrada no celular, basta ler novamente o QR Code em Status.

**Como contribuir?** Veja [CONTRIBUTING.md](../CONTRIBUTING.md). Traduções da documentação para inglês, provedor da Cloud API oficial e transcrição acelerada por GPU são ótimos primeiros trabalhos.
