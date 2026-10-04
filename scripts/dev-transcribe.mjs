#!/usr/bin/env node
/**
 * Servico de transcricao falso, compativel com a API da OpenAI.
 *
 * Serve para testar o caminho "Servico local" do WhatsRouter sem baixar um
 * modelo de verdade: ele aceita o audio e devolve um texto fixo.
 *
 * Uso:
 *   node scripts/dev-transcribe.mjs [porta]
 *
 * No painel: Motor de transcricao = "Servico local na propria maquina" e
 * endereco http://127.0.0.1:9000/v1
 */
import http from 'node:http';

const port = Number(process.argv[2] ?? 9000);

const server = http.createServer((req, res) => {
  const url = req.url ?? '/';

  if (url.endsWith('/models')) {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ object: 'list', data: [{ id: 'whisper-local-fake', object: 'model' }] }));
    return;
  }

  if (url.endsWith('/audio/transcriptions') && req.method === 'POST') {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const size = Buffer.concat(chunks).length;
      console.log(`[dev-transcribe] audio recebido (${size} bytes)`);
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          text: `Transcricao de teste do servico local (${size} bytes de audio recebidos).`
        })
      );
    });
    return;
  }

  res.statusCode = 404;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ error: 'rota nao implementada neste servico de teste' }));
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[dev-transcribe] ouvindo em http://127.0.0.1:${port}/v1 (servico de teste)`);
});