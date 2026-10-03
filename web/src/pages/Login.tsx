import { useState } from 'react';
import { api } from '../lib/api.js';

export default function Login({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.login(username, password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form className="card w-full max-w-sm" onSubmit={submit}>
        <div className="mb-6">
          <div className="text-xl font-semibold text-zap-700">WhatsRouter</div>
          <div className="text-sm text-slate-500">Centralizador WhatsApp - E-mail</div>
        </div>

        <label className="label" htmlFor="username">
          Usuario
        </label>
        <input
          id="username"
          className="input mb-4"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
        />

        <label className="label" htmlFor="password">
          Senha
        </label>
        <input
          id="password"
          type="password"
          className="input mb-4"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
        />

        {error && <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>

        <p className="hint mt-4">
          Na primeira execucao o usuario e a senha vem de <code>ADMIN_USERNAME</code> e <code>ADMIN_PASSWORD</code>{' '}
          (padrao <code>admin</code> / <code>whatsrouter</code>). Troque a senha em Configuracoes.
        </p>
      </form>
    </div>
  );
}