import fs from 'node:fs';
import path from 'node:path';
import mime from 'mime-types';
import { mediaDir } from '../env.js';
import { jidToPhone } from '../utils/format.js';

const EXTENSION_BY_MIME: Record<string, string> = {
  'audio/ogg': '.ogg',
  'audio/ogg; codecs=opus': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/wav': '.wav',
  'audio/webm': '.webm',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'application/pdf': '.pdf'
};

export function resolveExtension(mimeType?: string, fileName?: string): string {
  if (fileName && path.extname(fileName)) return path.extname(fileName);
  if (mimeType) {
    const normalized = mimeType.split(';')[0]!.trim().toLowerCase();
    if (EXTENSION_BY_MIME[mimeType]) return EXTENSION_BY_MIME[mimeType]!;
    if (EXTENSION_BY_MIME[normalized]) return EXTENSION_BY_MIME[normalized]!;
    const guessed = mime.extension(normalized);
    if (guessed) return `.${guessed}`;
  }
  return '.bin';
}

export interface StoredMedia {
  filePath: string;
  size: number;
  fileName: string;
}

/**
 * Grava a midia recebida em `data/media/<conversa>/`. O nome do arquivo deriva
 * do identificador da mensagem, o que torna a operacao idempotente.
 */
export function saveMedia(input: {
  chatJid: string;
  waMessageId: string;
  data: Buffer;
  mimeType?: string;
  fileName?: string;
}): StoredMedia {
  const folder = path.join(mediaDir, jidToPhone(input.chatJid));
  fs.mkdirSync(folder, { recursive: true });

  const extension = resolveExtension(input.mimeType, input.fileName);
  const safeId = input.waMessageId.replace(/[^a-zA-Z0-9._-]/g, '') || `media-${Date.now()}`;
  const filePath = path.join(folder, `${safeId}${extension}`);

  fs.writeFileSync(filePath, input.data);
  return {
    filePath,
    size: input.data.length,
    fileName: input.fileName ?? path.basename(filePath)
  };
}

export function deleteMedia(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignora
  }
}

export function mediaUsage(): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        files += 1;
        bytes += fs.statSync(full).size;
      }
    }
  };
  walk(mediaDir);
  return { files, bytes };
}