import { useCallback, useEffect, useState } from 'react';
import { api, formatBytes, formatDate, type StatusResponse } from '../lib/api.js';

const STATE_LABEL: Record<string, string> = {
  connected: 'Conectado',
  connecting: 'Conectando',
  connecting_qr: 'Aguardando leitura do QR Code',
  disconnected: 'Desconectado',
  error: 'Erro'
};

const STATE_STYLE: Record<string, string> = {
  connected: 'bg-zap-100 text-zap-800',
  connecting: 'bg-amber-100 text-amber-800',
  connecting_qr: 'bg-amber-100 text-amber-800',
  disconnected: 'bg-slate-100 text-slate-600',
  error: 'bg-rose-100 text-rose-700'
};

export default function Status() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState('');
  const [pairingCode, setPairingCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await api.status());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar status');
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 10000);
    return () => clearInterval(timer);
  }, [load]);

  const run = async (action: () => Promise<unknown>, successMessage: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(successMessage);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na operacao');
    } finally {
      setBusy(false);
    }
  };

  const requestPairingCode = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    setPairingCode(null);
    try {
      const result = await api.pairingCode(phone);
      setPairingCode(result.code);
      setMessage('Codigo gerado. Digite-o no celular para concluir o pareamento.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gerar o codigo');
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return <div className="text-slate-500">Carregando status...</div>;
  }

  const provider = status.provider;
  const state = provider?.state ?? 'disconnected';
  const isMock = provider?.name === 'mock';
  const isBaileys = provider?.name === 'baileys';
  const connected = state === 'connected';

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Status</h1>
          <p className="text-sm text-slate-500">Conexao do WhatsApp, fila de mensagens e e-mail.</p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => void load()}>
          Atualizar
        </button>
      </header>

      {message && <div className="rounded-lg bg-zap-50 px-4 py-3 text-sm text-zap-800">{message}</div>}
      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card">
          <div className="card-title">WhatsApp</div>
          <div className="mb-3 flex items-center gap-2">
            <span className={`badge ${STATE_STYLE[state] ?? 'bg-slate-100 text-slate-600'}`}>
              {STATE_LABEL[state] ?? state}
            </span>
            <span className="text-sm text-slate-500">provedor: {provider?.name ?? '-'}</span>
          </div>
          {provider?.selfName || provider?.selfJid ? (
            <p className="text-sm text-slate-600">
              Conectado como <strong>{provider.selfName ?? provider.selfJid}</strong>
            </p>
          ) : null}
          {provider?.lastError && <p className="mt-2 text-sm text-rose-600">{provider.lastError}</p>}

          {provider?.qrDataUrl ? (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-4 text-center">
              <p className="mb-2 text-sm text-slate-600">
                Abra o WhatsApp no celular, toque em <strong>Aparelhos conectados</strong> e leia o codigo:
              </p>
              <img src={provider.qrDataUrl} alt="QR Code do WhatsApp" className="mx-auto h-64 w-64" />
              <p className="hint mt-2">O codigo expira em alguns minutos; gere outro se precisar.</p>
            </div>
          ) : (
            !connected && (
              <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-4 text-center">
                <p className="text-sm text-slate-600">
                  Nenhum QR Code ativo no momento. Clique em <strong>Gerar QR Code</strong> para iniciar o pareamento.
                </p>
              </div>
            )
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {!connected && (
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => api.requestQr(),
                    'QR Code solicitado. Aguarde alguns segundos e leia o codigo com o WhatsApp.'
                  )
                }
              >
                Gerar QR Code
              </button>
            )}
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={() => void run(() => api.restartProvider(), 'Conexao reiniciada.')}
            >
              Reiniciar conexao
            </button>
            <button
              type="button"
              className="btn-danger"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setPairingCode(null);
                  await api.logoutProvider();
                }, 'Sessao encerrada. Gere um novo QR Code para parear de novo.')
              }
            >
              Desconectar sessao
            </button>
          </div>

          {isBaileys && !connected && (
            <div className="mt-4 rounded-lg bg-slate-50 p-3">
              <div className="mb-1 text-sm font-medium text-slate-700">Pareamento por codigo (sem camera)</div>
              <p className="hint mb-2">
                Informe o numero do WhatsApp com DDI e DDD. No celular, abra <strong>Aparelhos conectados</strong> →
                <strong> Conectar com numero de telefone</strong> e digite o codigo gerado.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="input w-56"
                  placeholder="5511999999999"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy || phone.replace(/\D/g, '').length < 10}
                  onClick={() => void requestPairingCode()}
                >
                  Gerar codigo de pareamento
                </button>
              </div>
              {pairingCode && (
                <div className="mt-3 rounded-lg border border-zap-200 bg-white px-4 py-3 text-center">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Codigo de pareamento</div>
                  <div className="text-2xl font-semibold tracking-[0.3em] text-zap-800">{pairingCode}</div>
                </div>
              )}
            </div>
          )}

          {isMock && (
            <div className="mt-4 rounded-lg bg-slate-50 p-3">
              <p className="mb-2 text-xs text-slate-500">
                Provedor de demonstracao: simule uma mensagem recebida para testar todo o fluxo.
              </p>
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      api.simulate({
                        chatJid: '5511999999999@s.whatsapp.net',
                        senderName: 'Contato de teste',
                        text: `Mensagem de teste em ${new Date().toLocaleTimeString('pt-BR')}`
                      }),
                    'Mensagem simulada. Veja a conversa e a fila de e-mail.'
                  )
                }
              >
                Simular mensagem recebida
              </button>
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-title">Fila e e-mails</div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Conversas registradas</dt>
              <dd className="font-medium">{status.stats.totalConversations}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Mensagens aguardando envio</dt>
              <dd className="font-medium">{status.stats.pendingMessages}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Ultimo e-mail enviado</dt>
              <dd className="font-medium">{formatDate(status.stats.lastEmailSentAt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Falhas de envio</dt>
              <dd className="font-medium">{status.stats.failedEmails}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Ultima mensagem recebida</dt>
              <dd className="font-medium">{formatDate(status.stats.lastMessageAt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Midia armazenada</dt>
              <dd className="font-medium">
                {status.media.files} arquivo(s) - {formatBytes(status.media.bytes)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Transcricao de audio</dt>
              <dd className="font-medium">{status.transcription}</dd>
            </div>
          </dl>

          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
            <div className="mb-1 font-medium">Leitura do e-mail (IMAP)</div>
            <div className="text-slate-600">
              {status.mail.running ? 'ativa' : 'parada'} - {status.mail.connected ? 'conectada' : 'desconectada'} -
              ultima verificacao: {formatDate(status.mail.lastCheck)}
            </div>
            {status.mail.lastError && <div className="mt-1 text-rose-600">{status.mail.lastError}</div>}
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-title">Pausa</div>
        <p className="mb-3 text-sm text-slate-600">
          Quando voce responde alguem diretamente pelo celular, o sistema pausa o envio de e-mails daquela conversa.
          Use os botoes abaixo para pausar ou retomar tudo de uma vez.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`badge ${status.pause.global ? 'bg-amber-100 text-amber-800' : 'bg-zap-100 text-zap-800'}`}
          >
            Pausa global: {status.pause.global ? 'ativa' : 'inativa'}
          </span>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() =>
              void run(
                () => api.setGlobalPause(!status.pause.global, 'pausa manual pelo painel'),
                status.pause.global ? 'Pausa global desativada.' : 'Pausa global ativada.'
              )
            }
          >
            {status.pause.global ? 'Desativar pausa global' : 'Ativar pausa global'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => void run(() => api.pauseAll(), 'Todas as conversas pausadas.')}
          >
            Pausar todas as conversas
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => void run(() => api.resumeAll(), 'Todas as conversas retomadas.')}
          >
            Retomar todas as conversas
          </button>
        </div>
      </section>
    </div>
  );
}