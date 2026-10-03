import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { env } from '../env.js';
import { log } from '../logger.js';
import type { AppConfig } from '../settings/service.js';

const execFileAsync = promisify(execFile);

export type TranscriptionDriver = 'openai' | 'command' | 'none';

/** Define qual driver sera usado considerando configuracao e ambiente. */
export function resolveDriver(config: AppConfig): TranscriptionDriver {
  if (!config.transcription.enabled) return 'none';
  const configured = config.transcription.provider;
  const hasApiKey = Boolean(config.transcription.apiKey || env.OPENAI_API_KEY);
  const hasCommand = Boolean(config.transcription.command);

  if (configured === 'none') return 'none';
  if (configured === 'openai') return hasApiKey ? 'openai' : 'none';
  if (configured === 'command') return hasCommand ? 'command' : 'none';

  // auto
  if (hasApiKey) return 'openai';
  if (hasCommand) return 'command';
  return 'none';
}

/**
 * Transcreve um arquivo de audio. Retorna `null` quando nao ha driver
 * disponivel, para que a mensagem siga apenas com o anexo.
 */
export async function transcribeAudio(filePath: string, config: AppConfig): Promise<string | null> {
  const driver = resolveDriver(config);
  if (driver === 'none') return null;
  if (!fs.existsSync(filePath)) return null;

  try {
    if (driver === 'openai') return await transcribeWithApi(filePath, config);
    return await transcribeWithCommand(filePath, config);
  } catch (error) {
    log.warn('Falha na transcricao do audio', {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

/**
 * Usa uma API compativel com OpenAI (`/audio/transcriptions`). Serve para a
 * OpenAI, Groq, ou qualquer servidor local compativel (whisper.cpp server).
 */
async function transcribeWithApi(filePath: string, config: AppConfig): Promise<string | null> {
  const apiKey = config.transcription.apiKey || env.OPENAI_API_KEY;
  const baseUrl = (config.transcription.baseUrl || env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(
    /\/+$/,
    ''
  );
  if (!apiKey && !config.transcription.baseUrl) return null;

  const buffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buffer)]), path.basename(filePath));
  form.append('model', config.transcription.model || 'whisper-1');
  form.append('response_format', 'json');

  const response = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
    body: form
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Transcricao HTTP ${response.status}: ${detail.slice(0, 200)}`);
  }

  const body = (await response.json()) as { text?: string };
  return body.text?.trim() ?? null;
}

/**
 * Executa um comando local, por exemplo whisper.cpp:
 *   whisper-cli -f {file} -otxt -of {out}
 * `{out}` recebe o caminho base de saida (o comando deve gerar `{out}.txt`).
 */
async function transcribeWithCommand(filePath: string, config: AppConfig): Promise<string | null> {
  const template = config.transcription.command.trim();
  if (!template) return null;

  const outBase = path.join(os.tmpdir(), `whatsrouter-${Date.now()}`);
  const args = template
    .split(/\s+/)
    .map((token) => token.split('{file}').join(filePath).split('{out}').join(outBase));
  const [command, ...commandArgs] = args;
  if (!command) return null;

  await execFileAsync(command, commandArgs, { timeout: 5 * 60 * 1000 });
  const textFile = `${outBase}.txt`;
  if (!fs.existsSync(textFile)) return null;
  const text = fs.readFileSync(textFile, 'utf8').trim();
  fs.unlinkSync(textFile);
  return text || null;
}