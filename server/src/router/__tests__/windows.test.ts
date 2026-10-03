import { describe, expect, it } from 'vitest';
import { consolidationWindowMs, nextDueDate } from '../windows.js';
import { applyTestSettings, prepareDatabase } from '../../../test/helpers.js';

describe('janelas de consolidacao', () => {
  it('usa 2 minutos para conversas individuais e 30 para grupos por padrao', () => {
    prepareDatabase();
    const config = applyTestSettings({ 'consolidation.dm_minutes': '2', 'consolidation.group_minutes': '30' });

    expect(consolidationWindowMs('dm', config)).toBe(2 * 60 * 1000);
    expect(consolidationWindowMs('group', config)).toBe(30 * 60 * 1000);
  });

  it('respeita a configuracao salva no painel', () => {
    prepareDatabase();
    const config = applyTestSettings({ 'consolidation.dm_minutes': '5', 'consolidation.group_minutes': '45' });

    expect(consolidationWindowMs('dm', config)).toBe(5 * 60 * 1000);
    expect(consolidationWindowMs('group', config)).toBe(45 * 60 * 1000);
  });

  it('calcula a data limite a partir da ultima mensagem', () => {
    prepareDatabase();
    const config = applyTestSettings({ 'consolidation.dm_minutes': '2' });
    const from = new Date('2026-01-01T12:00:00.000Z');

    expect(nextDueDate(from, 'dm', config).toISOString()).toBe('2026-01-01T12:02:00.000Z');
  });
});