#!/usr/bin/env node
/**
 * Servidor SMTP minimo para desenvolvimento e testes.
 *
 * Ele aceita qualquer mensagem e grava o conteudo bruto em disco, permitindo
 * testar o fluxo completo do WhatsRouter sem enviar e-mails de verdade.
 *
 * Uso:  node scripts/dev-smtp.mjs [porta] [diretorio-de-saida]
 * Padrao: porta 2525, saida ./data/smtp-inbox
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const port = Number(process.argv[2] ?? 2525);
const outDir = path.resolve(process.argv[3] ?? './data/smtp-inbox');
fs.mkdirSync(outDir, { recursive: true });

const server = net.createServer((socket) => {
  let buffer = Buffer.alloc(0);
  let dataLines = [];
  let inData = false;
  let from = '';
  let recipients = [];

  socket.write('220 whatsrouter-dev-smtp pronto\r\n');

  const handle = (line) => {
    if (inData) {
      if (line === '.') {
        inData = false;
        const raw = dataLines.join('\r\n').replace(/^\.\./gm, '.');
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const file = path.join(outDir, `${stamp}.eml`);
        fs.writeFileSync(file, raw);
        console.log(`[dev-smtp] mensagem de <${from}> para <${recipients.join(', ')}> salva em ${file}`);
        dataLines = [];
        from = '';
        recipients = [];
        socket.write('250 2.0.0 Ok: mensagem aceita\r\n');
        return;
      }
      dataLines.push(line);
      return;
    }

    const command = line.split(' ')[0].toUpperCase();
    const rest = line.slice(command.length).trim();

    switch (command) {
      case 'EHLO':
      case 'HELO':
        socket.write('250-whatsrouter-dev-smtp\r\n250-SIZE 26214400\r\n250 8BITMIME\r\n');
        break;
      case 'MAIL':
        from = rest.replace(/^FROM:</i, '').replace(/[<>]/g, '');
        socket.write('250 2.1.0 Ok\r\n');
        break;
      case 'RCPT':
        recipients.push(rest.replace(/^TO:</i, '').replace(/[<>]/g, ''));
        socket.write('250 2.1.5 Ok\r\n');
        break;
      case 'DATA':
        inData = true;
        socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        break;
      case 'RSET':
        dataLines = [];
        from = '';
        recipients = [];
        socket.write('250 2.0.0 Ok\r\n');
        break;
      case 'NOOP':
        socket.write('250 2.0.0 Ok\r\n');
        break;
      case 'QUIT':
        socket.write('221 2.0.0 Bye\r\n');
        socket.end();
        break;
      default:
        socket.write('250 2.0.0 Ok\r\n');
    }
  };

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    let index = buffer.indexOf('\r\n');
    while (index >= 0) {
      const line = buffer.subarray(0, index).toString('utf8');
      buffer = buffer.subarray(index + 2);
      handle(line);
      index = buffer.indexOf('\r\n');
    }
  });

  socket.on('error', () => undefined);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[dev-smtp] ouvindo em 127.0.0.1:${port}; mensagens em ${outDir}`);
});