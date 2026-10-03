import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';

type FieldType = 'text' | 'password' | 'number' | 'textarea' | 'checkbox' | 'select';

interface Field {
  key: string;
  label: string;
  type: FieldType;
  hint?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

interface Group {
  id: string;
  title: string;
  description: string;
  fields: Field[];
}

const GROUPS: Group[] = [
  {
    id: 'auto',
    title: 'Aviso de modo automatico',
    description:
      'Mensagem enviada na primeira vez que um contato escreve dentro da janela definida, avisando que as mensagens serao encaminhadas por e-mail.',
    fields: [
      { key: 'auto_reply.enabled', label: 'Enviar aviso automatico', type: 'checkbox' },
      { key: 'auto_reply.text', label: 'Texto do aviso', type: 'textarea', placeholder: 'Ola! Esta conta esta em modo automatico...' },
      {
        key: 'auto_reply.cooldown_hours',
        label: 'Intervalo minimo por contato (horas)',
        type: 'number',
        hint: 'O aviso e enviado no maximo uma vez a cada X horas por contato.'
      }
    ]
  },
  {
    id: 'consolidation',
    title: 'Consolidacao das mensagens',
    description: 'Quanto tempo o sistema espera antes de agrupar as mensagens de um contato em um unico e-mail.',
    fields: [
      {
        key: 'consolidation.dm_minutes',
        label: 'Janela em conversas individuais (minutos)',
        type: 'number',
        hint: 'Padrao do projeto: 2 minutos.'
      },
      { key: 'consolidation.group_minutes', label: 'Janela em grupos (minutos)', type: 'number', hint: 'Padrao: 30 minutos.' },
      {
        key: 'consolidation.context_messages',
        label: 'Mensagens de contexto no e-mail',
        type: 'number',
        hint: 'Alem das mensagens novas, quantas mensagens anteriores incluir.'
      },
      { key: 'consolidation.tick_seconds', label: 'Frequencia de verificacao (segundos)', type: 'number' }
    ]
  },
  {
    id: 'media',
    title: 'Midia e transcricao',
    description: 'Midias sao anexadas ao e-mail; audios podem ser transcritos automaticamente.',
    fields: [
      { key: 'attachments.max_mb', label: 'Tamanho maximo por anexo (MB)', type: 'number' },
      { key: 'transcription.enabled', label: 'Transcrever audios', type: 'checkbox' },
      {
        key: 'transcription.provider',
        label: 'Motor de transcricao',
        type: 'select',
        options: [
          { value: 'auto', label: 'Automatico (usa o que estiver configurado)' },
          { value: 'openai', label: 'API compativel com OpenAI (nuvem)' },
          { value: 'command', label: 'Comando local (ex.: whisper.cpp)' },
          { value: 'none', label: 'Desligado' }
        ]
      },
      { key: 'transcription.model', label: 'Modelo', type: 'text' },
      { key: 'transcription.api_key', label: 'Chave da API', type: 'password' },
      { key: 'transcription.base_url', label: 'URL base da API', type: 'text', placeholder: 'https://api.openai.com/v1' },
      {
        key: 'transcription.command',
        label: 'Comando local',
        type: 'text',
        placeholder: 'whisper-cli -f {file} -otxt -of {out}',
        hint: 'Use {file} para o arquivo de audio e {out} para o caminho base de saida.'
      }
    ]
  },
  {
    id: 'mail',
    title: 'E-mail do sistema',
    description:
      'Conta dedicada que envia as notificacoes e recebe as respostas. Para mail.org/mail.com use smtp.mail.com:587 e imap.mail.com:993.',
    fields: [
      { key: 'mail.system_email', label: 'Endereco do sistema', type: 'text', placeholder: 'bot@mail.org' },
      { key: 'mail.system_name', label: 'Nome exibido', type: 'text' },
      {
        key: 'mail.reply_domain',
        label: 'Dominio usado no endereco de resposta',
        type: 'text',
        placeholder: 'mail.org',
        hint: 'As respostas usam conv+<token>@este-dominio para o sistema identificar o contato.'
      },
      { key: 'mail.smtp_host', label: 'SMTP host', type: 'text' },
      { key: 'mail.smtp_port', label: 'SMTP porta', type: 'number' },
      { key: 'mail.smtp_secure', label: 'SMTP com SSL direto (porta 465)', type: 'checkbox' },
      { key: 'mail.smtp_user', label: 'SMTP usuario', type: 'text' },
      { key: 'mail.smtp_password', label: 'SMTP senha ou token', type: 'password' },
      { key: 'mail.imap_host', label: 'IMAP host', type: 'text' },
      { key: 'mail.imap_port', label: 'IMAP porta', type: 'number' },
      { key: 'mail.imap_secure', label: 'IMAP com SSL (porta 993)', type: 'checkbox' },
      { key: 'mail.imap_user', label: 'IMAP usuario', type: 'text' },
      { key: 'mail.imap_password', label: 'IMAP senha ou token', type: 'password' },
      { key: 'mail.imap_folder', label: 'Pasta monitorada', type: 'text' },
      { key: 'mail.poll_seconds', label: 'Intervalo de verificacao (segundos)', type: 'number' },
      { key: 'mail.mark_as_read', label: 'Marcar respostas como lidas', type: 'checkbox' }
    ]
  },
  {
    id: 'owner',
    title: 'Proprietario e assunto',
    description: 'Para onde as mensagens do WhatsApp sao encaminhadas e como o assunto e montado.',
    fields: [
      { key: 'mail.owner_email', label: 'E-mail do proprietario', type: 'text', placeholder: 'voce@exemplo.com' },
      {
        key: 'mail.subject_template',
        label: 'Modelo do assunto',
        type: 'text',
        hint: 'Variaveis: {contact}, {phone}, {count}, {kind}, {date}'
      },
      {
        key: 'mail.allowlist',
        label: 'Remetentes autorizados a responder',
        type: 'textarea',
        hint: 'Um endereco por linha. Vazio significa aceitar qualquer remetente.'
      }
    ]
  },
  {
    id: 'pause',
    title: 'Pausa e assuncao manual',
    description: 'Quando voce responde pelo celular, o sistema para de enviar e-mails daquela conversa pelo tempo abaixo.',
    fields: [
      {
        key: 'pause.auto_minutes',
        label: 'Tempo de pausa automatica (minutos)',
        type: 'number',
        hint: 'Padrao do projeto: 30 minutos.'
      },
      { key: 'pause.commands_enabled', label: 'Aceitar comandos pelo WhatsApp (!pausar, !retomar, !status)', type: 'checkbox' }
    ]
  },
  {
    id: 'groups',
    title: 'Grupos e bloqueios',
    description: 'Grupos entram com janela propria; contatos bloqueados sao ignorados.',
    fields: [
      { key: 'groups.enabled', label: 'Encaminhar mensagens de grupos', type: 'checkbox' },
      {
        key: 'blocklist',
        label: 'Contatos bloqueados',
        type: 'textarea',
        hint: 'Um telefone ou JID por linha.'
      }
    ]
  },
  {
    id: 'provider',
    title: 'Provedor de WhatsApp',
    description:
      'Baileys conecta pelo WhatsApp Web (QR Code). O provedor webhook permite integrar um fluxo externo (por exemplo, n8n) sem alterar o restante do sistema.',
    fields: [
      {
        key: 'provider.name',
        label: 'Provedor ativo',
        type: 'select',
        options: [
          { value: '', label: 'Usar o padrao da instalacao' },
          { value: 'baileys', label: 'Baileys (WhatsApp Web)' },
          { value: 'webhook', label: 'Webhook externo (n8n)' },
          { value: 'mock', label: 'Demonstracao (sem WhatsApp)' }
        ]
      },
      {
        key: 'provider.webhook_outbound_url',
        label: 'URL de saida (webhook)',
        type: 'text',
        placeholder: 'https://seu-n8n/webhook/whatsrouter'
      },
      { key: 'provider.webhook_outbound_token', label: 'Token de saida', type: 'password' },
      {
        key: 'provider.webhook_inbound_token',
        label: 'Token de entrada',
        type: 'password',
        hint: 'Usado por POST /api/webhook/whatsapp no cabecalho x-whatsrouter-token.'
      }
    ]
  }
];

const ALL_FIELDS = GROUPS.flatMap((group) => group.fields);

export default function Settings() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [presets, setPresets] = useState<string[]>([]);
  const [driver, setDriver] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [passwords, setPasswords] = useState({ current: '', next: '' });
  const [testTo, setTestTo] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api.settings();
      setValues(data.values);
      setPresets(data.mailPresetNames);
      setDriver(data.transcriptionDriver);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar configuracoes');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));

  const pendingValues = useMemo(() => {
    const out: Record<string, string> = {};
    for (const field of ALL_FIELDS) out[field.key] = values[field.key] ?? '';
    return out;
  }, [values]);

  const save = async () => {
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const result = await api.saveSettings(pendingValues);
      setFeedback(
        result.changed.length > 0
          ? `Configuracoes salvas: ${result.changed.length} campo(s) atualizado(s).`
          : 'Nada mudou.'
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar');
    } finally {
      setBusy(false);
    }
  };

  const runTest = async (action: () => Promise<unknown>, okMessage: string) => {
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const result = (await action()) as { ok?: boolean; error?: string; messages?: number };
      if (result && result.ok === false) throw new Error(result.error ?? 'Teste falhou');
      setFeedback(`${okMessage}${result?.messages !== undefined ? ` (${result.messages} mensagens na caixa)` : ''}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Teste falhou');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Configuracoes</h1>
          <p className="text-sm text-slate-500">
            Ajuste a mensagem automatica, o e-mail do sistema, o e-mail do proprietario, as janelas e a pausa.
          </p>
        </div>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void save()}>
          {busy ? 'Salvando...' : 'Salvar configuracoes'}
        </button>
      </header>

      {feedback && <div className="rounded-lg bg-zap-50 px-4 py-3 text-sm text-zap-800">{feedback}</div>}
      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <section className="card">
        <div className="card-title">Testes rapidos</div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="test-to">
              Enviar e-mail de teste para
            </label>
            <input
              id="test-to"
              className="input w-72"
              placeholder="voce@exemplo.com"
              value={testTo}
              onChange={(event) => setTestTo(event.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => void runTest(() => api.testEmail(testTo || undefined), 'E-mail de teste enviado.')}
          >
            Testar envio (SMTP)
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => void runTest(() => api.testImap(), 'Conexao IMAP funcionando.')}
          >
            Testar leitura (IMAP)
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => void runTest(() => api.testSmtp(), 'Credenciais SMTP validas.')}
          >
            Validar credenciais SMTP
          </button>
        </div>
        <p className="hint">Motor de transcricao em uso: {driver}</p>
      </section>

      {GROUPS.map((group) => (
        <section key={group.id} className="card">
          <div className="card-title">{group.title}</div>
          <p className="mb-4 text-sm text-slate-500">{group.description}</p>

          {group.id === 'mail' && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-600">Preencher automaticamente para:</span>
              {presets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() =>
                    void runTest(async () => {
                      await api.applyPreset(preset);
                      await load();
                      return { ok: true };
                    }, `Preset aplicado: ${preset}.`)
                  }
                >
                  {preset}
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {group.fields.map((field) => (
              <div key={field.key} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
                {field.type === 'checkbox' ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={(values[field.key] ?? 'false') === 'true'}
                      onChange={(event) => set(field.key, event.target.checked ? 'true' : 'false')}
                    />
                    <span className="font-medium text-slate-700">{field.label}</span>
                  </label>
                ) : (
                  <>
                    <label className="label" htmlFor={field.key}>
                      {field.label}
                    </label>
                    {field.type === 'textarea' ? (
                      <textarea
                        id={field.key}
                        className="input min-h-[96px]"
                        value={values[field.key] ?? ''}
                        placeholder={field.placeholder}
                        onChange={(event) => set(field.key, event.target.value)}
                      />
                    ) : field.type === 'select' ? (
                      <select
                        id={field.key}
                        className="input"
                        value={values[field.key] ?? ''}
                        onChange={(event) => set(field.key, event.target.value)}
                      >
                        {(field.options ?? []).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={field.key}
                        type={field.type === 'number' ? 'number' : field.type === 'password' ? 'password' : 'text'}
                        className="input"
                        value={values[field.key] ?? ''}
                        placeholder={field.placeholder}
                        onChange={(event) => set(field.key, event.target.value)}
                      />
                    )}
                  </>
                )}
                {field.hint && <p className="hint">{field.hint}</p>}
                {field.type === 'password' && values[field.key] === '********' && (
                  <p className="hint">Valor ja salvo. Deixe como esta para manter.</p>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="card">
        <div className="card-title">Acesso ao painel</div>
        <p className="mb-4 text-sm text-slate-500">Troque a senha inicial do usuario administrador.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="current-password">
              Senha atual
            </label>
            <input
              id="current-password"
              type="password"
              className="input"
              value={passwords.current}
              onChange={(event) => setPasswords({ ...passwords, current: event.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="new-password">
              Nova senha
            </label>
            <input
              id="new-password"
              type="password"
              className="input"
              value={passwords.next}
              onChange={(event) => setPasswords({ ...passwords, next: event.target.value })}
            />
          </div>
        </div>
        <button
          type="button"
          className="btn-secondary mt-4"
          disabled={busy}
          onClick={() =>
            void runTest(async () => {
              await api.changePassword(passwords.current, passwords.next);
              setPasswords({ current: '', next: '' });
              return { ok: true };
            }, 'Senha alterada.')
          }
        >
          Alterar senha
        </button>
      </section>

      <div className="flex justify-end">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void save()}>
          {busy ? 'Salvando...' : 'Salvar configuracoes'}
        </button>
      </div>
    </div>
  );
}