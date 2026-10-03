import { useCallback, useEffect, useState } from 'react';
import { api, formatDate, type Conversation, type Message } from '../lib/api.js';

export default function Conversations() {
  const [list, setList] = useState<Conversation[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<{ conversation: Conversation; pending: number; paused: boolean; messages: Message[] } | null>(
    null
  );
  const [draft, setDraft] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      const data = await api.conversations(search);
      setList(data.conversations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar conversas');
    }
  }, [search]);

  const loadDetail = useCallback(async (id: number) => {
    try {
      setDetail(await api.conversation(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar a conversa');
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selected) void loadDetail(selected);
    else setDetail(null);
  }, [selected, loadDetail]);

  const act = async (action: () => Promise<unknown>, okMessage: string) => {
    setError(null);
    setFeedback(null);
    try {
      await action();
      setFeedback(okMessage);
      await loadList();
      if (selected) await loadDetail(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na operacao');
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Conversas</h1>
        <p className="text-sm text-slate-500">
          Uma conversa por contato, com a janela de consolidacao, pausa e historico das mensagens.
        </p>
      </header>

      {feedback && <div className="rounded-lg bg-zap-50 px-4 py-3 text-sm text-zap-800">{feedback}</div>}
      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <section className="card">
          <input
            className="input mb-3"
            placeholder="Buscar por nome, telefone ou JID"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="max-h-[540px] space-y-1 overflow-y-auto">
            {list.length === 0 && <p className="text-sm text-slate-500">Nenhuma conversa registrada ainda.</p>}
            {list.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => setSelected(conversation.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                  selected === conversation.id
                    ? 'border-zap-300 bg-zap-50'
                    : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {conversation.isGroup ? '[grupo] ' : ''}
                    {conversation.contactName || conversation.title || conversation.contactPhone || conversation.jid}
                  </span>
                  {conversation.pendingCount > 0 && (
                    <span className="badge bg-amber-100 text-amber-800">{conversation.pendingCount}</span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                  <span>{conversation.kind === 'group' ? 'grupo' : 'individual'}</span>
                  <span>-</span>
                  <span>{formatDate(conversation.lastActivityAt)}</span>
                  {conversation.pausedUntil && new Date(conversation.pausedUntil) > new Date() && (
                    <span className="badge bg-amber-100 text-amber-800">pausada</span>
                  )}
                  {conversation.contactBlocked && <span className="badge bg-rose-100 text-rose-700">bloqueado</span>}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="card">
          {!detail && <p className="text-sm text-slate-500">Selecione uma conversa para ver o historico e as acoes.</p>}

          {detail && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">
                    {detail.conversation.isGroup ? '[grupo] ' : ''}
                    {detail.conversation.contactName || detail.conversation.title || detail.conversation.jid}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {detail.conversation.jid} - janela:{' '}
                    {detail.conversation.kind === 'group' ? 'grupo' : 'individual'} - e-mails enviados:{' '}
                    {detail.conversation.notificationsSent}
                  </p>
                  <p className="text-xs text-slate-500">
                    Endereco de resposta: <code>conv+{detail.conversation.token}@...</code>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => void act(() => api.pauseConversation(detail.conversation.id), 'Conversa pausada.')}
                  >
                    Pausar
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => void act(() => api.resumeConversation(detail.conversation.id), 'Conversa retomada.')}
                  >
                    Retomar
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() =>
                      void act(async () => {
                        const result = await api.flushConversation(detail.conversation.id);
                        if (!result.sent) throw new Error('Nada para enviar ou falha no envio.');
                      }, 'E-mail enviado agora.')
                    }
                  >
                    Enviar e-mail agora
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      void act(
                        () => api.blockConversation(detail.conversation.id, !detail.conversation.contactBlocked),
                        detail.conversation.contactBlocked ? 'Contato desbloqueado.' : 'Contato bloqueado.'
                      )
                    }
                  >
                    {detail.conversation.contactBlocked ? 'Desbloquear' : 'Bloquear'}
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  className="input"
                  placeholder="Enviar mensagem pelo WhatsApp..."
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() =>
                    void act(async () => {
                      await api.sendToConversation(detail.conversation.id, draft);
                      setDraft('');
                    }, 'Mensagem enviada no WhatsApp.')
                  }
                >
                  Enviar
                </button>
              </div>

              <div className="max-h-[420px] space-y-2 overflow-y-auto rounded-lg bg-slate-50 p-3">
                {detail.messages.length === 0 && <p className="text-sm text-slate-500">Sem mensagens registradas.</p>}
                {detail.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      message.direction === 'out'
                        ? 'border-zap-200 bg-zap-50/60'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-medium text-slate-700">
                        {message.direction === 'out' ? 'saida' : 'entrada'} - {message.source}
                      </span>
                      <span>{formatDate(message.messageTimestamp)}</span>
                      {message.kind !== 'text' && <span className="badge bg-slate-100 text-slate-600">{message.kind}</span>}
                      {message.mediaName && <span>{message.mediaName}</span>}
                      {message.outboxId === null && message.direction === 'in' && (
                        <span className="badge bg-amber-100 text-amber-800">na fila</span>
                      )}
                    </div>
                    {message.text && <div className="whitespace-pre-wrap">{message.text}</div>}
                    {message.transcript && (
                      <div className="mt-1 text-slate-600">
                        <span className="text-xs uppercase text-slate-400">transcricao: </span>
                        {message.transcript}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}