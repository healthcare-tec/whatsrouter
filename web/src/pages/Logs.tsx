import { useCallback, useEffect, useState } from 'react';
import { api, formatDate, type EventRow } from '../lib/api.js';

type Tab = 'events' | 'outbox' | 'inbound';

const LEVEL_STYLE: Record<string, string> = {
  info: 'bg-slate-100 text-slate-600',
  debug: 'bg-slate-100 text-slate-500',
  warn: 'bg-amber-100 text-amber-800',
  error: 'bg-rose-100 text-rose-700'
};

export default function Logs() {
  const [tab, setTab] = useState<Tab>('events');
  const [events, setEvents] = useState<EventRow[]>([]);
  const [level, setLevel] = useState('all');
  const [search, setSearch] = useState('');
  const [outbox, setOutbox] = useState<Awaited<ReturnType<typeof api.outbox>>['outbox']>([]);
  const [inbound, setInbound] = useState<Awaited<ReturnType<typeof api.inboundEmails>>['inboundEmails']>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      if (tab === 'events') {
        const data = await api.events(level, search);
        setEvents(data.events);
      } else if (tab === 'outbox') {
        const data = await api.outbox();
        setOutbox(data.outbox);
      } else {
        const data = await api.inboundEmails();
        setInbound(data.inboundEmails);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar historico');
    }
  }, [tab, level, search]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Historico</h1>
        <p className="text-sm text-slate-500">
          Eventos do sistema, e-mails enviados ao proprietario e respostas recebidas.
        </p>
      </header>

      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['events', 'Eventos'],
            ['outbox', 'E-mails enviados'],
            ['inbound', 'Respostas recebidas']
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={value === tab ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
        <button type="button" className="btn-secondary" onClick={() => void load()}>
          Atualizar
        </button>
      </div>

      {tab === 'events' && (
        <section className="card">
          <div className="mb-4 flex flex-wrap gap-3">
            <select className="input w-40" value={level} onChange={(event) => setLevel(event.target.value)}>
              <option value="all">Todos os niveis</option>
              <option value="info">Info</option>
              <option value="warn">Aviso</option>
              <option value="error">Erro</option>
              <option value="debug">Detalhe</option>
            </select>
            <input
              className="input w-72"
              placeholder="Buscar no texto"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <table className="table">
            <thead>
              <tr>
                <th className="w-44">Quando</th>
                <th className="w-24">Nivel</th>
                <th className="w-40">Tipo</th>
                <th>Mensagem</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="whitespace-nowrap text-slate-500">{formatDate(event.createdAt)}</td>
                  <td>
                    <span className={`badge ${LEVEL_STYLE[event.level] ?? 'bg-slate-100 text-slate-600'}`}>
                      {event.level}
                    </span>
                  </td>
                  <td className="text-slate-600">{event.type}</td>
                  <td>{event.message}</td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-slate-500">
                    Nenhum evento registrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'outbox' && (
        <section className="card">
          <table className="table">
            <thead>
              <tr>
                <th className="w-44">Quando</th>
                <th className="w-24">Status</th>
                <th>Assunto</th>
                <th className="w-24">Msgs</th>
                <th className="w-64">Message-ID</th>
              </tr>
            </thead>
            <tbody>
              {outbox.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap text-slate-500">{formatDate(row.sentAt ?? row.createdAt)}</td>
                  <td>
                    <span
                      className={`badge ${
                        row.status === 'sent'
                          ? 'bg-zap-100 text-zap-800'
                          : row.status === 'failed'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {row.status}
                    </span>
                    {row.fromPause && <span className="badge ml-1 bg-amber-100 text-amber-800">pausa</span>}
                  </td>
                  <td>
                    {row.subject}
                    {row.error && <div className="text-xs text-rose-600">{row.error}</div>}
                  </td>
                  <td>{row.messageCount}</td>
                  <td className="break-all text-xs text-slate-500">{row.emailMessageId ?? '-'}</td>
                </tr>
              ))}
              {outbox.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-slate-500">
                    Nenhum e-mail enviado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'inbound' && (
        <section className="card">
          <table className="table">
            <thead>
              <tr>
                <th className="w-44">Quando</th>
                <th className="w-28">Status</th>
                <th className="w-56">De</th>
                <th>Assunto</th>
                <th className="w-56">Observacao</th>
              </tr>
            </thead>
            <tbody>
              {inbound.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap text-slate-500">{formatDate(row.createdAt)}</td>
                  <td>
                    <span
                      className={`badge ${
                        row.status === 'processed'
                          ? 'bg-zap-100 text-zap-800'
                          : row.status === 'failed'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="break-all">{row.fromAddress ?? '-'}</td>
                  <td>{row.subject ?? '-'}</td>
                  <td className="text-xs text-slate-500">{row.error ?? '-'}</td>
                </tr>
              ))}
              {inbound.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-slate-500">
                    Nenhuma resposta recebida ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}