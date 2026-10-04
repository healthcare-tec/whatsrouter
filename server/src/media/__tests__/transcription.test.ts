import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { checkTranscriptionService, resolveDriver, serviceBaseUrl, transcribeAudio } from '../transcribe.js';
import { getConfig, setSetting, setSettings } from '../../settings/service.js';
import { applyTestSettings, prepareDatabase } from '../../../test/helpers.js';

let server: http.Server;
let baseUrl = '';
let lastModel = '';
let lastAuth: string | undefined;
let requests = 0;
let audioFile = '';

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url?.endsWith('/models')) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ object: 'list', data: [{ id: 'Systran/faster-whisper-small' }] }));
      return;
    }

    if (req.url?.endsWith('/audio/transcriptions')) {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        requests += 1;
        const raw = Buffer.concat(chunks).toString('latin1');
        lastModel = /name="model"\r\n\r\n([^\r\n]+)/.exec(raw)?.[1] ?? '';
        lastAuth = req.headers.authorization;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ text: '  ola, tudo bem?  ' }));
      });
      return;
    }

    res.statusCode = 404;
    res.end('{}');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/v1`;

  audioFile = path.join(os.tmpdir(), `whatsrouter-audio-${Date.now()}.ogg`);
  fs.writeFileSync(audioFile, Buffer.from('conteudo-de-audio-falso'));
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  if (audioFile && fs.existsSync(audioFile)) fs.unlinkSync(audioFile);
});

beforeEach(() => {
  prepareDatabase();
  applyTestSettings({
    'transcription.enabled': 'true',
    'transcription.provider': 'auto',
    'transcription.service_url': '',
    'transcription.api_key': '',
    'transcription.base_url': '',
    'transcription.command': ''
  });
  requests = 0;
});

describe('escolha do motor de transcricao', () => {
  it('usa o servico local quando configurado', () => {
    setSetting('transcription.service_url', baseUrl);
    expect(resolveDriver(getConfig())).toBe('service');
    expect(serviceBaseUrl(getConfig())).toBe(baseUrl);
  });

  it('aceita endereco com barra no final', () => {
    setSetting('transcription.service_url', `${baseUrl}/`);
    expect(serviceBaseUrl(getConfig())).toBe(baseUrl);
  });

  it('nao usa o servico local sem endereco configurado', () => {
    setSetting('transcription.provider', 'service');
    expect(resolveDriver(getConfig())).toBe('none');
  });

  it('prefere o servico local a API na nuvem no modo automatico', () => {
    setSettings({
      'transcription.service_url': baseUrl,
      'transcription.api_key': 'chave-de-teste',
      'transcription.command': 'whisper-cli -f {file} -otxt -of {out}'
    });
    expect(resolveDriver(getConfig())).toBe('service');
  });

  it('usa o comando local quando o motor esta definido como comando', () => {
    setSetting('transcription.provider', 'command');
    setSetting('transcription.command', 'whisper-cli -f {file} -otxt -of {out}');
    expect(resolveDriver(getConfig())).toBe('command');
  });

  it('nao usa o comando local quando o comando esta vazio', () => {
    setSetting('transcription.provider', 'command');
    expect(resolveDriver(getConfig())).toBe('none');
  });

  it('respeita a transcricao desligada', () => {
    setSetting('transcription.enabled', 'false');
    setSetting('transcription.service_url', baseUrl);
    expect(resolveDriver(getConfig())).toBe('none');
  });
});

describe('transcricao pelo servico local', () => {
  it('envia o audio e devolve o texto sem espacos sobrando', async () => {
    setSetting('transcription.service_url', baseUrl);
    setSetting('transcription.provider', 'service');

    const text = await transcribeAudio(audioFile, getConfig());
    expect(text).toBe('ola, tudo bem?');
    expect(requests).toBe(1);
    expect(lastAuth).toBeUndefined();
  });

  it('envia o modelo escolhido no painel', async () => {
    setSetting('transcription.service_url', baseUrl);
    setSetting('transcription.provider', 'service');
    setSetting('transcription.model', 'Systran/faster-whisper-small');

    await transcribeAudio(audioFile, getConfig());
    expect(lastModel).toBe('Systran/faster-whisper-small');
  });

  it('devolve null quando nao ha motor configurado', async () => {
    setSetting('transcription.provider', 'service');
    expect(await transcribeAudio(audioFile, getConfig())).toBeNull();
    expect(requests).toBe(0);
  });

  it('devolve null quando o arquivo nao existe', async () => {
    setSetting('transcription.service_url', baseUrl);
    setSetting('transcription.provider', 'service');
    expect(await transcribeAudio('/tmp/nao-existe-xyz.ogg', getConfig())).toBeNull();
  });

  it('nao quebra a mensagem quando o servico responde com erro', async () => {
    setSetting('transcription.service_url', 'http://127.0.0.1:1/v1');
    setSetting('transcription.provider', 'service');
    expect(await transcribeAudio(audioFile, getConfig())).toBeNull();
  });
});

describe('teste do servico de transcricao', () => {
  it('reconhece um servico saudavel e lista os modelos', async () => {
    setSetting('transcription.service_url', baseUrl);
    setSetting('transcription.provider', 'service');

    const result = await checkTranscriptionService(getConfig());
    expect(result.ok).toBe(true);
    expect(result.driver).toBe('service');
    expect(result.models).toContain('Systran/faster-whisper-small');
  });

  it('avisa quando nao ha endereco configurado', async () => {
    setSetting('transcription.provider', 'service');
    const result = await checkTranscriptionService(getConfig());
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('nenhum endereco');
  });

  it('avisa quando o servico nao responde', async () => {
    setSetting('transcription.service_url', 'http://127.0.0.1:1/v1');
    setSetting('transcription.provider', 'service');
    const result = await checkTranscriptionService(getConfig());
    expect(result.ok).toBe(false);
    expect(result.url).toBe('http://127.0.0.1:1/v1');
  });
});
