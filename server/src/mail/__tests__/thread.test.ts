import { describe, expect, it } from 'vitest';
import {
  buildMessageId,
  buildSubject,
  extractTokenFromRecipients,
  normalizeMessageId,
  parseMessageIds,
  replyAddress
} from '../thread.js';
import type { Conversation } from '../../db/schema.js';

const conversation = { token: 'abc123def456' } as Conversation;

describe('endereco de resposta por conversa', () => {
  it('monta conv+token@dominio', () => {
    expect(replyAddress(conversation, 'mail.org')).toBe('conv+abc123def456@mail.org');
  });

  it('usa o dominio do e-mail do sistema quando nao ha dominio proprio', () => {
    expect(replyAddress(conversation, '', 'bot@mail.org')).toBe('conv+abc123def456@mail.org');
  });

  it('extrai o token de destinatarios variados', () => {
    expect(extractTokenFromRecipients(['conv+abc123def456@mail.org'])).toBe('abc123def456');
    expect(extractTokenFromRecipients(['Bot <conv+abc123def456@mail.org>'])).toBe('abc123def456');
    expect(extractTokenFromRecipients(['outro@exemplo.com', 'conv+abc123def456@mail.org'])).toBe('abc123def456');
  });

  it('nao confunde enderecos comuns', () => {
    expect(extractTokenFromRecipients(['bot@mail.org'])).toBeNull();
    expect(extractTokenFromRecipients(['a+b@mail.org'])).toBeNull();
  });
});

describe('identificadores de mensagem', () => {
  it('normaliza com os sinais de menor e maior', () => {
    expect(normalizeMessageId('abc@x')).toBe('<abc@x>');
    expect(normalizeMessageId('<abc@x>')).toBe('<abc@x>');
    expect(normalizeMessageId('')).toBeNull();
  });

  it('extrai varios ids de References', () => {
    expect(parseMessageIds('<a@x> <b@x>')).toEqual(['<a@x>', '<b@x>']);
    expect(parseMessageIds(['<a@x>', '<b@x>'])).toEqual(['<a@x>', '<b@x>']);
    expect(parseMessageIds(undefined)).toEqual([]);
  });

  it('gera Message-ID com o token da conversa', () => {
    const id = buildMessageId('abc123def456', 'mail.org');
    expect(id.startsWith('<cabc123def456.')).toBe(true);
    expect(id.endsWith('@mail.org>')).toBe(true);
  });
});

describe('assunto do e-mail', () => {
  it('substitui as variaveis do template', () => {
    const subject = buildSubject('[WhatsRouter] WhatsApp - {contact} ({phone}) {count} {kind}', {
      contact: 'Maria',
      phone: '5511999999999',
      count: 3,
      kind: 'dm',
      date: new Date('2026-01-01T12:00:00.000Z')
    });
    expect(subject).toBe('[WhatsRouter] WhatsApp - Maria (5511999999999) 3 Conversa');
  });

  it('marca grupos', () => {
    const subject = buildSubject('{kind}: {contact}', {
      contact: 'Equipe',
      phone: '',
      count: 1,
      kind: 'group',
      date: new Date()
    });
    expect(subject).toBe('Grupo: Equipe');
  });
});