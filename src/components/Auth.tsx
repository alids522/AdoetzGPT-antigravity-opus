import { useState } from 'react';
import { Database, KeyRound, Lock, Server, Sparkles, User } from 'lucide-react';
import type { SyncSettings, UserAccount } from '../App';
import { login, signUp } from '../storage';

interface AuthProps {
  syncSettings: SyncSettings;
  setSyncSettings: (settings: SyncSettings) => void;
  onAuthenticated: (payload: { user: UserAccount; token: string; remoteState?: any; isNewAccount?: boolean }) => void;
  onGuestMode: () => void;
}

export function Auth({ syncSettings, setSyncSettings, onAuthenticated, onGuestMode }: AuthProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const db = syncSettings.database;

  const updateDb = (field: keyof typeof db, value: string) => {
    setSyncSettings({
      ...syncSettings,
      database: {
        ...db,
        [field]: value,
      },
    });
  };

  const submit = async () => {
    setError('');
    setIsLoading(true);
    try {
      const payload = mode === 'signup'
        ? await signUp(username, password, syncSettings)
        : await login(username, password, syncSettings);
      onAuthenticated({
        user: payload.user,
        token: payload.token,
        remoteState: 'state' in payload ? payload.state : null,
        isNewAccount: mode === 'signup',
      });
    } catch (err: any) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-shell w-full bg-background text-on-surface flex items-start justify-center overflow-y-auto p-4 py-6 font-body">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-primary text-on-primary flex items-center justify-center shadow-lg">
            <Sparkles size={24} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.35em] text-on-surface-variant font-semibold mb-2">AdoetzGPT</div>
            <h1 className="text-4xl font-display italic text-primary">{mode === 'signup' ? 'Create Account' : 'Welcome Back'}</h1>
          </div>
        </div>

        <div className="bg-surface border border-outline rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm">
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-2">Username</label>
            <div className="relative">
              <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input value={username} onChange={(e) => setUsername(e.target.value)} className="w-full bg-surface-dim border border-outline rounded-xl py-3 pl-9 pr-3 text-sm outline-none focus:border-primary" />
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-2">Password</label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-surface-dim border border-outline rounded-xl py-3 pl-9 pr-3 text-sm outline-none focus:border-primary" />
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-2">Sync API URL</label>
            <div className="relative">
              <Server size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input
                value={syncSettings.apiBaseUrl}
                onChange={(e) => setSyncSettings({ ...syncSettings, apiBaseUrl: e.target.value })}
                className="w-full bg-surface-dim border border-outline rounded-xl py-3 pl-9 pr-3 text-sm outline-none focus:border-primary"
                placeholder="Blank = direct Postgres on Android"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-2">Database URL</label>
              <div className="relative">
                <Server size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input value={db.databaseUrl} onChange={(e) => updateDb('databaseUrl', e.target.value)} className="w-full bg-surface-dim border border-outline rounded-xl py-3 pl-9 pr-3 text-sm outline-none focus:border-primary" placeholder="Postgres host or postgres:// URL" />
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-2">Database</label>
              <div className="relative">
                <Database size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input value={db.database} onChange={(e) => updateDb('database', e.target.value)} className="w-full bg-surface-dim border border-outline rounded-xl py-3 pl-9 pr-3 text-sm outline-none focus:border-primary" />
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-2">Schema</label>
              <input value={db.schemaName} onChange={(e) => updateDb('schemaName', e.target.value)} className="w-full bg-surface-dim border border-outline rounded-xl p-3 text-sm outline-none focus:border-primary" placeholder="adoetzgpt" />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-2">DB User</label>
              <input value={db.user} onChange={(e) => updateDb('user', e.target.value)} className="w-full bg-surface-dim border border-outline rounded-xl p-3 text-sm outline-none focus:border-primary" />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-2">DB Password</label>
              <div className="relative">
                <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input type="password" value={db.password} onChange={(e) => updateDb('password', e.target.value)} className="w-full bg-surface-dim border border-outline rounded-xl py-3 pl-9 pr-3 text-sm outline-none focus:border-primary" />
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-2">Custom Port</label>
              <input value={db.port} onChange={(e) => updateDb('port', e.target.value)} className="w-full bg-surface-dim border border-outline rounded-xl p-3 text-sm outline-none focus:border-primary" placeholder="Blank = 5432" />
            </div>
          </div>

          {error && <div className="p-3 rounded-xl bg-error/10 text-error text-xs border border-error/20">{error}</div>}

          <button
            onClick={submit}
            disabled={isLoading || !username || !password || !db.databaseUrl || !db.database || !db.user}
            className="w-full rounded-full bg-primary text-on-primary py-3 text-xs font-bold uppercase tracking-widest disabled:opacity-50"
          >
            {isLoading ? 'Please wait...' : mode === 'signup' ? 'Sign Up' : 'Log In'}
          </button>

          <button
            onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}
            className="w-full text-xs text-on-surface-variant hover:text-primary transition-colors"
          >
            {mode === 'signup' ? 'Already have an account? Log in' : 'Need an account? Sign up'}
          </button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-outline" />
            <span className="text-[10px] uppercase tracking-widest text-on-surface-variant">or</span>
            <div className="h-px flex-1 bg-outline" />
          </div>

          <button
            onClick={onGuestMode}
            className="w-full rounded-full border border-outline bg-surface text-on-surface py-3 text-xs font-bold uppercase tracking-widest hover:border-primary hover:text-primary transition-colors"
          >
            Continue As Guest
          </button>
        </div>
      </div>
    </div>
  );
}
