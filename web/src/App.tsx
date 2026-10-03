import { useCallback, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { api } from './lib/api.js';
import Login from './pages/Login.js';
import Status from './pages/Status.js';
import Conversations from './pages/Conversations.js';
import Settings from './pages/Settings.js';
import Logs from './pages/Logs.js';

interface Session {
  username: string;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const loadSession = useCallback(async () => {
    try {
      const data = await api.me();
      setSession({ username: data.user.username });
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const handleLogout = async () => {
    await api.logout();
    setSession(null);
    navigate('/login');
  };

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-slate-500">Carregando...</div>;
  }

  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<Login onSuccess={() => void loadSession()} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const navItems = [
    { to: '/status', label: 'Status' },
    { to: '/conversas', label: 'Conversas' },
    { to: '/configuracoes', label: 'Configuracoes' },
    { to: '/logs', label: 'Historico' }
  ];

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="text-lg font-semibold text-zap-700">WhatsRouter</div>
          <div className="text-xs text-slate-500">WhatsApp - E-mail</div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-zap-50 text-zap-700' : 'text-slate-600 hover:bg-slate-50'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-3 text-sm">
          <div className="mb-2 px-1 text-xs text-slate-500">Conectado como {session.username}</div>
          <button type="button" className="btn-secondary w-full" onClick={() => void handleLogout()}>
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        <Routes>
          <Route path="/" element={<Navigate to="/status" replace />} />
          <Route path="/login" element={<Navigate to="/status" replace />} />
          <Route path="/status" element={<Status />} />
          <Route path="/conversas" element={<Conversations />} />
          <Route path="/configuracoes" element={<Settings />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="*" element={<Navigate to="/status" replace />} />
        </Routes>
      </main>
    </div>
  );
}