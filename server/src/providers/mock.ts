import { log } from '../logger.js';
import type { InboundMessage, OutboundContent, ProviderStatus, SendResult } from '../domain/types.js';
import { BaseProvider } from './types.js';

/**
 * Provedor de demonstracao/teste: nao fala com o WhatsApp. Permite rodar o
 * sistema inteiro (consolidacao, e-mail, respostas) sem um celular conectado.
 */
export class MockProvider extends BaseProvider {
  readonly name = 'mock';
  private state: ProviderStatus['state'] = 'disconnected';
  private sent: { to: string; content: OutboundContent; at: Date }[] = [];
  private counter = 0;

  status(): ProviderStatus {
    return {
      name: this.name,
      state: this.state,
      selfJid: 'mock@s.whatsapp.net',
      selfName: 'WhatsRouter (demo)',
      since: this.state === 'connected' ? new Date() : undefined
    };
  }

  async start(): Promise<void> {
    this.state = 'connected';
    this.emitStatus(this.status());
    log.info('Provedor mock iniciado (nenhuma conexao real com o WhatsApp)');
  }

  async stop(): Promise<void> {
    this.state = 'disconnected';
    this.emitStatus(this.status());
  }

  async send(to: string, content: OutboundContent): Promise<SendResult> {
    this.counter += 1;
    this.sent.push({ to, content, at: new Date() });
    log.info(`[mock] enviado para ${to}: ${content.text ?? '<midia>'}`);
    return { id: `mock-${this.counter}` };
  }

  /** Simula uma mensagem recebida (usado por testes e pelo modo demonstracao). */
  simulateInbound(partial: Partial<InboundMessage> & { chatJid: string }): InboundMessage {
    this.counter += 1;
    const message: InboundMessage = {
      waMessageId: partial.waMessageId ?? `mock-in-${this.counter}`,
      chatJid: partial.chatJid,
      senderJid: partial.senderJid ?? partial.chatJid,
      senderName: partial.senderName,
      kind: partial.kind ?? 'dm',
      messageKind: partial.messageKind ?? 'text',
      text: partial.text,
      media: partial.media,
      timestamp: partial.timestamp ?? new Date(),
      fromMe: partial.fromMe ?? false
    };
    if (message.fromMe) this.emitOutbound(message);
    else this.emitMessage(message);
    return message;
  }

  sentMessages(): { to: string; content: OutboundContent; at: Date }[] {
    return [...this.sent];
  }

  clear(): void {
    this.sent = [];
  }
}