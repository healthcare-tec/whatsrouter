import { beforeEach, describe, expect, it } from 'vitest';
import { listenInfo, listenWarnings, localIpv4Addresses, resolveListen } from '../addresses.js';
import { setSetting } from '../../settings/service.js';
import { applyTestSettings, prepareDatabase } from '../../../test/helpers.js';

describe('endereco de escuta', () => {
  beforeEach(() => {
    prepareDatabase();
    applyTestSettings();
  });

  it('usa 0.0.0.0 do ambiente quando o painel nao define nada', () => {
    const listen = resolveListen();
    expect(listen.host).toBe('0.0.0.0');
    expect(listen.source).toBe('ambiente');
    expect(listen.port).toBeGreaterThan(0);
  });

  it('aceita o endereco definido no painel', () => {
    setSetting('server.host', '192.168.0.1');
    setSetting('server.port', '8080');

    const listen = resolveListen();
    expect(listen.host).toBe('192.168.0.1');
    expect(listen.port).toBe(8080);
    expect(listen.source).toBe('painel');
  });

  it('ignora porta invalida e mantem a do ambiente', () => {
    setSetting('server.port', 'abc');
    const listen = resolveListen();
    expect(listen.port).toBeGreaterThan(0);
    expect(listen.port).not.toBeNaN();
  });

  it('lista o endereco local e os IPs da rede quando escuta em todas as interfaces', () => {
    const info = listenInfo();
    expect(info.exposedToNetwork).toBe(true);
    expect(info.urls.some((entry) => entry.url.includes('127.0.0.1'))).toBe(true);
    expect(info.hostOptions).toContain('0.0.0.0');
    expect(info.hostOptions).toContain('127.0.0.1');
  });

  it('avisa quando o painel fica restrito a propria maquina', () => {
    setSetting('server.host', '127.0.0.1');
    const info = listenInfo();
    expect(info.exposedToNetwork).toBe(false);
    expect(info.urls).toHaveLength(1);
    expect(listenWarnings(info).join(' ')).toContain('Somente esta maquina');
  });

  it('inclui o endereco publico configurado', () => {
    setSetting('server.public_url', 'https://router.exemplo.com');
    const info = listenInfo();
    expect(info.urls[0]?.url).toBe('https://router.exemplo.com');
    expect(info.publicUrl).toBe('https://router.exemplo.com');
  });

  it('avisa sobre http no endereco publico', () => {
    setSetting('server.public_url', 'http://router.exemplo.com');
    const info = listenInfo();
    expect(listenWarnings(info).join(' ')).toContain('prefira https');
  });

  it('detecta IPs IPv4 nao internos sem duplicatas', () => {
    const ips = localIpv4Addresses();
    expect(new Set(ips).size).toBe(ips.length);
    for (const ip of ips) {
      expect(ip).not.toBe('127.0.0.1');
      expect(ip).not.toMatch(/^169\.254\./);
    }
  });
});
