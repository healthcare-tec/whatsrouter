import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { env } from '../env.js';
import { log } from '../logger.js';
import type { AppConfig } from '../settings/service.js';

const execFileAsync = promisify(execFile);

/**
 * Caminhos possiveis de transcricao:
 * - `service`: servidor local compativel com OpenAI (faster-whisper-server,
 *   whisper.cpp server). Nada sai da maquina e nao exige comando externo.
 * - `openai`: API compativel com OpenAI na nuvem (OpenAI, Groq, ...).
 * - `command`: binario local (por exemplo whisper.cpp).
 * - `none`: audios seguem apenas como anexo.
 */
export type TranscriptionDriver = 'service' | 'openai' | 'command' | 'none';

/** Endereco sugerido do servico local (o mesmo dos scripts do repositorio). */
export const DEFAULT_SERVICE_URL = 'http://127.0.0.1:9000/v1';

export function serviceBaseUrl(config: AppConfig): string {
  return (config.transcription.serviceUrl ?? '').trim().replace(/\/+$/, '');
}

/** Define qual driver sera usado considerando configuracao e ambiente. */
export function resolveDriver(config: AppConfig): TranscriptionDriver {
  if (!config.transcription.enabled) return 'none';

  const configured = config.transcription.provider;
  const hasService = Boolean(serviceBaseUrl(config));
  const hasApiKey = Boolean(config.transcription.apiKey || env.OPENAI_API_KEY);
  const hasCommand = Boolean(config.transcription.command.trim());

  if (configured === 'none') return 'none';
  if (configured === 'service') return hasService ? 'service' : 'none';
  if (configured === 'openai') return hasApiKey || Boolean(config.transcription.baseUrl) ? 'openai' : 'none';
  if (configured === 'command') return hasCommand ? 'command' : 'none';

  // auto: servico local -> API na nuvem -> comando local
  if (hasService) return 'service';
  if (hasApiKey) return 'openai';
  if (hasCommand) return 'command';
  return 'none';
}

/** Texto amigavel usado no painel e nos logs. */
export function describeDriver(driver: TranscriptionDriver): string {
  switch (driver) {
    case 'service':
      return 'servico local';
    case 'openai':
      return 'API na nuvem';
    case 'command':
      return 'comando local';
    default:
      return 'desligada';
  }
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
    if (driver === 'service') {
      return await transcribeWithHttp(filePath, config, serviceBaseUrl(config), '');
    }
    if (driver === 'openai') {
      const baseUrl = (config.transcription.baseUrl || env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(
        /\/+$/,
        ''
      );
      return await transcribeWithHttp(filePath, config, baseUrl, config.transcription.apiKey || env.OPENAI_API_KEY);
    }
    return await transcribeWithCommand(filePath, config);
  } catch (error) {
    log.warn('Falha na transcricao do audio', {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

/**
 * Envia o audio para um endpoint `/audio/transcriptions` compativel com a API
 * da OpenAI. Serve tanto para a nuvem quanto para o servico local.
 */
async function transcribeWithHttp(
  filePath: string,
  config: AppConfig,
  baseUrl: string,
  apiKey: string
): Promise<string | null> {
  if (!baseUrl) return null;

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

export interface ServiceCheck {
  ok: boolean;
  driver: TranscriptionDriver;
  url: string;
  detail?: string;
  models?: string[];
}

/**
 * Verifica se o servico local (ou a API configurada) responde. Usado pelo
 * botao de teste do painel: consulta `GET {base}/models` com tempo limite.
 */
export async function checkTranscriptionService(config: AppConfig): Promise<ServiceCheck> {
  const driver = resolveDriver(config);
  const url = driver === 'service' ? serviceBaseUrl(config) : config.transcription.baseUrl.replace(/\/+$/, '');

  if (!url) {
    return { ok: false, driver, url, detail: 'nenhum endereco configurado' };
  }

  const apiKey =
    driver === 'service' ? '' : config.transcription.apiKey || env.OPENAI_API_KEY;

  try {
    const response = await fetch(`${url}/models`, {
      method: 'GET',
      headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      return { ok: false, driver, url, detail: `HTTP ${response.status}` };
    }
    const body = (await response.json().catch(() => ({}))) as { data?: { id?: string }[] };
    return { ok: true, driver, url, models: (body.data ?? []).map((item) => item.id ?? '').filter(Boolean) };
  } catch (error) {
    return {
      ok: false,
      driver,
      url,
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}
