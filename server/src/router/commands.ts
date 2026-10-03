export type OwnerCommandType = 'pause' | 'resume' | 'status' | 'help' | 'resume_all' | 'unknown';

export interface OwnerCommand {
  type: OwnerCommandType;
  /** Minutos informados no comando (ex.: `!pausar 45`). */
  minutes?: number;
  raw: string;
}

const PAUSE_WORDS = ['pausar', 'pausa', 'pause', 'parar', 'off'];
const RESUME_WORDS = ['retomar', 'retoma', 'voltar', 'resume', 'on', 'ligar'];
const STATUS_WORDS = ['status', 'situacao', 'estado'];
const HELP_WORDS = ['ajuda', 'help', 'comandos'];
const RESUME_ALL_WORDS = ['retomar-tudo', 'resume-all', 'ligar-tudo'];

/**
 * Reconhece comandos enviados pelo proprietario no proprio WhatsApp.
 * Sempre comecam com `!`. Exemplos:
 *   !pausar          -> pausa esta conversa pelo tempo padrao
 *   !pausar 45       -> pausa esta conversa por 45 minutos
 *   !retomar         -> retoma esta conversa e libera o acumulado
 *   !retomar-tudo    -> retoma todas as conversas
 *   !status          -> devolve um resumo do sistema
 */
export function parseOwnerCommand(text: string | undefined | null): OwnerCommand | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith('!')) return null;

  const withoutBang = trimmed.slice(1).trim();
  if (!withoutBang) return null;

  const [first, ...rest] = withoutBang.split(/\s+/);
  const word = (first ?? '').toLowerCase();
  const args = rest.join(' ').trim();

  if (RESUME_ALL_WORDS.includes(word)) return { type: 'resume_all', raw: trimmed };
  if (PAUSE_WORDS.includes(word)) {
    const minutes = args ? Number(args.replace(',', '.')) : undefined;
    return {
      type: 'pause',
      minutes: Number.isFinite(minutes) && minutes! > 0 ? Math.floor(minutes!) : undefined,
      raw: trimmed
    };
  }
  if (RESUME_WORDS.includes(word)) return { type: 'resume', raw: trimmed };
  if (STATUS_WORDS.includes(word)) return { type: 'status', raw: trimmed };
  if (HELP_WORDS.includes(word)) return { type: 'help', raw: trimmed };

  return { type: 'unknown', raw: trimmed };
}

export const HELP_TEXT = [
  'Comandos do WhatsRouter:',
  '!pausar [minutos] - pausa o envio de e-mails desta conversa',
  '!retomar - retoma esta conversa e envia o que estava acumulado',
  '!retomar-tudo - retoma todas as conversas pausadas',
  '!status - resumo do sistema',
  'Envie estes comandos na conversa desejada (ou na conversa consigo mesmo para comandos globais).'
].join('\n');