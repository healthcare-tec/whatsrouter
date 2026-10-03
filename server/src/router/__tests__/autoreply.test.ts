import { describe, expect, it } from 'vitest';
import { renderAutoReply, shouldSendAutoReply } from '../autoreply.js';
import { cleanReplyBody, firstMeaningfulLine } from '../../mail/replyCleaner.js';
import { applyTestSettings, prepareDatabase } from '../../../test/helpers.js';

describe('aviso de modo automatico', () => {
  it('envia na primeira mensagem de um contato', () => {
    prepareDatabase();
    const config = applyTestSettings({ 'auto_reply.enabled': 'true' });
    expect(shouldSendAutoReply({ lastNotifiedAt: null, blocked: false }, config)).toBe(true);
  });

  it('respeita a janela de 24h por contato', () => {
    prepareDatabase();
    const config = applyTestSettings({ 'auto_reply.cooldown_hours': '24' });
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    expect(shouldSendAutoReply({ lastNotifiedAt: oneHourAgo, blocked: false }, config)).toBe(false);
    expect(shouldSendAutoReply({ lastNotifiedAt: twoDaysAgo, blocked: false }, config)).toBe(true);
  });

  it('nao envia quando desligado ou para contato bloqueado', () => {
    prepareDatabase();
    const off = applyTestSettings({ 'auto_reply.enabled': 'false' });
    expect(shouldSendAutoReply({ lastNotifiedAt: null, blocked: false }, off)).toBe(false);

    const on = applyTestSettings({ 'auto_reply.enabled': 'true' });
    expect(shouldSendAutoReply({ lastNotifiedAt: null, blocked: true }, on)).toBe(false);
  });

  it('substitui o marcador {nome} pelo nome do contato', () => {
    expect(renderAutoReply('Ola {nome}!', 'Maria')).toBe('Ola Maria!');
    expect(renderAutoReply('Ola {nome}!', null)).toBe('Ola ola!');
  });
});

describe('limpeza da resposta por e-mail', () => {
  it('remove o historico citado', () => {
    const raw = [
      'Pode confirmar para amanha as 10h?',
      '',
      'Em 1 de janeiro de 2026, WhatsRouter <bot@example.com> escreveu:',
      '> [01/01/2026 09:00] Maria:',
      '> ola, tudo bem?'
    ].join('\n');

    expect(cleanReplyBody(raw)).toBe('Pode confirmar para amanha as 10h?');
  });

  it('remove citacao com > mesmo sem cabecalho', () => {
    const raw = 'Combinado!\n> mensagem anterior\n> outra linha';
    expect(cleanReplyBody(raw)).toBe('Combinado!');
  });

  it('corta a assinatura', () => {
    const raw = 'Ok, obrigado!\n\n--\nEnviado do meu iPhone';
    expect(cleanReplyBody(raw)).toBe('Ok, obrigado!');
  });

  it('devolve a primeira linha util', () => {
    expect(firstMeaningfulLine('\n\n  oi  \nresto')).toBe('oi');
  });
});