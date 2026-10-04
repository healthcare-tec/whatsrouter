import os from 'node:os';
import { env } from '../env.js';
import { getSetting } from '../settings/service.js';

export interface ListenInfo {
  /** Endereco efetivo de escuta (0.0.0.0 = todas as interfaces). */
  host: string;
  port: number;
  /** Se o endereco veio da configuracao do painel ou do ambiente. */
  source: 'painel' | 'ambiente';
  /** Se a escuta aceita conexoes de outras maquinas da rede. */
  exposedToNetwork: boolean;
  /** URL publica configurada, quando houver. */
  publicUrl: string;
  /** Enderecos uteis para acessar o painel. */
  urls: { label: string; url: string }[];
  /** Enderecos IPv4 detectados nesta maquina (uteis para configurar a escuta). */
  localIps: string[];
  /** Sugestoes de valor para o campo de endereco. */
  hostOptions: string[];
}

/** IPv4 nao internos das interfaces da maquina (rede local, VPN, docker...). */
export function localIpv4Addresses(): string[] {
  const result: string[] = [];
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family !== 'IPv4' || address.internal) continue;
      // 169.254.x.x e link-local: nao serve para acessar o painel na rede.
      if (address.address.startsWith('169.254.')) continue;
      result.push(address.address);
    }
  }
  return [...new Set(result)];
}

export function resolveListen(): { host: string; port: number; source: 'painel' | 'ambiente' } {
  const configuredHost = getSetting('server.host').trim();
  const configuredPort = Number(getSetting('server.port'));
  const host = configuredHost || env.HOST;
  const port = Number.isFinite(configuredPort) && configuredPort > 0 ? configuredPort : env.PORT;
  return { host, port, source: configuredHost ? 'painel' : 'ambiente' };
}

export function listenInfo(): ListenInfo {
  const { host, port, source } = resolveListen();
  const localIps = localIpv4Addresses();
  const publicUrl = getSetting('server.public_url').trim();

  const urls: { label: string; url: string }[] = [];
  if (host === '127.0.0.1' || host === 'localhost') {
    urls.push({ label: 'Somente esta maquina', url: `http://127.0.0.1:${port}` });
  } else {
    urls.push({ label: 'Nesta maquina', url: `http://127.0.0.1:${port}` });
    for (const ip of localIps) urls.push({ label: 'Rede local', url: `http://${ip}:${port}` });
  }
  if (publicUrl) urls.unshift({ label: 'Endereco publico', url: publicUrl });

  const hostOptions = ['0.0.0.0', '127.0.0.1', ...localIps];

  return {
    host,
    port,
    source,
    exposedToNetwork: !['127.0.0.1', 'localhost', '::1'].includes(host),
    publicUrl,
    urls,
    localIps,
    hostOptions
  };
}

/** Avisos de seguranca exibidos no painel conforme o endereco escolhido. */
export function listenWarnings(info: ListenInfo): string[] {
  const warnings: string[] = [];
  if (info.host === '0.0.0.0' && !info.publicUrl) {
    warnings.push(
      'Aceitando conexoes de qualquer interface. Em rede aberta, proteja o painel com HTTPS (proxy reverso) e troque a senha padrao.'
    );
  }
  if (info.host === '0.0.0.0' && info.publicUrl.startsWith('http://')) {
    warnings.push('O endereco publico usa http://; prefira https:// para nao expor a senha do painel.');
  }
  if (info.host === '127.0.0.1') {
    warnings.push('Somente esta maquina conseguira abrir o painel. Use 0.0.0.0 ou o IP da rede para acessar de outro dispositivo.');
  }
  return warnings;
}
