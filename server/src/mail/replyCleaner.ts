/**
 * Remove historico citado, assinaturas e cabecalhos de resposta, deixando
 * apenas o texto novo escrito pelo proprietario.
 */

const QUOTE_MARKERS = [
  /^\s*Em .{0,120}(escreveu|wrote):?\s*$/i,
  /^\s*On .{0,160}(wrote):\s*$/i,
  /^-{2,}\s*(Mensagem original|Original Message|Forwarded message)\s*-{2,}\s*$/i,
  /^\s*_{5,}\s*$/,
  /^\s*De:\s.+$/i,
  /^\s*From:\s.+$/i,
  /^\s*Enviado:\s.+$/i,
  /^\s*Sent:\s.+$/i,
  /^\s*Para:\s.+$/i,
  /^\s*Assunto:\s.+$/i,
  /^\s*Subject:\s.+$/i,
  /^\s*>{1,}/,
  /^\s*\[WhatsRouter\]/i,
  /^\s*--\s*$/,
  /^\s*Pb-\s*$/i
];

const SIGNATURE_MARKERS = [/^\s*--\s*$/, /^\s*Enviado do meu/i, /^\s*Sent from my/i];

export function cleanReplyBody(input: string): string {
  if (!input) return '';
  const lines = input.replace(/\r\n/g, '\n').split('\n');
  const kept: string[] = [];

  for (const line of lines) {
    if (SIGNATURE_MARKERS.some((pattern) => pattern.test(line))) break;
    if (QUOTE_MARKERS.some((pattern) => pattern.test(line))) break;
    kept.push(line);
  }

  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Primeira linha util, usada em resumos e respostas de comando. */
export function firstMeaningfulLine(text: string): string {
  const line = text
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item.length > 0);
  return line ?? '';
}