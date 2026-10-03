import { describe, expect, it } from 'vitest';
import { parseOwnerCommand } from '../commands.js';

describe('comandos do proprietario', () => {
  it('reconhece pausar, retomar, status e ajuda', () => {
    expect(parseOwnerCommand('!pausar')?.type).toBe('pause');
    expect(parseOwnerCommand('!retomar')?.type).toBe('resume');
    expect(parseOwnerCommand('!retomar-tudo')?.type).toBe('resume_all');
    expect(parseOwnerCommand('!status')?.type).toBe('status');
    expect(parseOwnerCommand('!ajuda')?.type).toBe('help');
  });

  it('le a quantidade de minutos informada', () => {
    expect(parseOwnerCommand('!pausar 45')?.minutes).toBe(45);
    expect(parseOwnerCommand('!pausar 1,5')?.minutes).toBe(1);
    expect(parseOwnerCommand('!pausar abc')?.minutes).toBeUndefined();
    expect(parseOwnerCommand('!pausar 0')?.minutes).toBeUndefined();
  });

  it('ignora mensagens que nao sao comandos', () => {
    expect(parseOwnerCommand('oi, tudo bem?')).toBeNull();
    expect(parseOwnerCommand('!')).toBeNull();
    expect(parseOwnerCommand('')).toBeNull();
    expect(parseOwnerCommand(undefined)).toBeNull();
  });

  it('marca comando desconhecido', () => {
    expect(parseOwnerCommand('!qualquercoisa')?.type).toBe('unknown');
  });
});