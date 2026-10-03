import { env } from '../env.js';
import { log } from '../logger.js';
import { getConfig } from '../settings/service.js';
import { BaileysProvider } from './baileys.js';
import { MockProvider } from './mock.js';
import { WebhookProvider } from './webhook.js';
import type { WhatsAppProvider } from './types.js';

export type ProviderName = 'baileys' | 'webhook' | 'mock';

/** Descobre qual provedor usar: painel > variavel de ambiente > baileys. */
export function resolveProviderName(): ProviderName {
  const fromSettings = getConfig().provider.name;
  const candidate = (fromSettings || env.WHATSAPP_PROVIDER) as ProviderName;
  return ['baileys', 'webhook', 'mock'].includes(candidate) ? candidate : 'baileys';
}

export function createProvider(name: ProviderName = resolveProviderName()): WhatsAppProvider {
  switch (name) {
    case 'mock':
      return new MockProvider();
    case 'webhook': {
      const config = getConfig();
      return new WebhookProvider({
        outboundUrl: config.provider.webhookOutboundUrl,
        outboundToken: config.provider.webhookOutboundToken || env.WEBHOOK_TOKEN
      });
    }
    case 'baileys':
    default:
      return new BaileysProvider({ downloadMedia: true });
  }
}

/**
 * Mantem o provedor ativo e permite troca em tempo de execucao (o painel
 * troca de provedor ou reconfigura o webhook sem reiniciar o processo).
 */
export class ProviderManager {
  private provider: WhatsAppProvider | null = null;

  async init(): Promise<WhatsAppProvider> {
    if (this.provider) return this.provider;
    const name = resolveProviderName();
    this.provider = createProvider(name);
    log.info(`Provedor de WhatsApp: ${name}`);
    await this.provider.start();
    return this.provider;
  }

  current(): WhatsAppProvider {
    if (!this.provider) throw new Error('Provedor nao inicializado');
    return this.provider;
  }

  currentOrNull(): WhatsAppProvider | null {
    return this.provider;
  }

  /** Reinicia o provedor aplicando configuracoes novas. */
  async reload(): Promise<WhatsAppProvider> {
    if (this.provider) {
      try {
        await this.provider.stop();
      } catch (error) {
        log.warn('Falha ao parar provedor anterior', error);
      }
    }
    this.provider = null;
    return this.init();
  }

  async stop(): Promise<void> {
    if (!this.provider) return;
    await this.provider.stop();
    this.provider = null;
  }
}

export const providerManager = new ProviderManager();
export { BaileysProvider, MockProvider, WebhookProvider };
export type { WhatsAppProvider };