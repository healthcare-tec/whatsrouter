import { EventEmitter } from 'node:events';
import type { InboundMessage, OutboundContent, ProviderStatus, SendResult } from '../domain/types.js';

export interface ProviderEvents {
  /** Mensagem recebida de terceiros. */
  message: (message: InboundMessage) => void;
  /** Mensagem que saiu do proprio numero (assuncao manual da conversa). */
  outbound: (message: InboundMessage) => void;
  /** Mudanca de estado da conexao. */
  status: (status: ProviderStatus) => void;
}

/**
 * Contrato minimo de um transporte de WhatsApp. Implementacoes atuais:
 * `baileys` (WhatsApp Web), `webhook` (generico, pronto para n8n) e `mock`.
 */
export interface WhatsAppProvider {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): ProviderStatus;
  send(to: string, content: OutboundContent): Promise<SendResult>;
  on<E extends keyof ProviderEvents>(event: E, handler: ProviderEvents[E]): void;
  off<E extends keyof ProviderEvents>(event: E, handler: ProviderEvents[E]): void;
  /** Desconecta a sessao (quando suportado) para permitir novo pareamento. */
  logout?(): Promise<void>;
  /**
   * Forca a geracao de um QR Code novo para a primeira conexao (quando
   * suportado). Usado pelo botao "Gerar QR Code" do painel.
   */
  requestQr?(): Promise<ProviderStatus>;
  /**
   * Solicita um codigo de pareamento por telefone, alternativa ao QR Code.
   */
  pairingCode?(phone: string): Promise<string>;
}

export abstract class BaseProvider implements WhatsAppProvider {
  abstract readonly name: string;
  protected readonly emitter = new EventEmitter();

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract status(): ProviderStatus;
  abstract send(to: string, content: OutboundContent): Promise<SendResult>;

  on<E extends keyof ProviderEvents>(event: E, handler: ProviderEvents[E]): void {
    this.emitter.on(event, handler as (...args: unknown[]) => void);
  }

  off<E extends keyof ProviderEvents>(event: E, handler: ProviderEvents[E]): void {
    this.emitter.off(event, handler as (...args: unknown[]) => void);
  }

  protected emitMessage(message: InboundMessage): void {
    this.emitter.emit('message', message);
  }

  protected emitOutbound(message: InboundMessage): void {
    this.emitter.emit('outbound', message);
  }

  protected emitStatus(status: ProviderStatus): void {
    this.emitter.emit('status', status);
  }
}
