import { useState } from 'react';
import { Save, Plus, Trash2, Server, Key, User, Bot, Sparkles, RefreshCw, Image, Video, Mic, Heart, BookOpen, BrainCircuit, Activity, Swords, MessageSquare, Info, Waves, LogOut, Languages, Database, RotateCw } from 'lucide-react';
import { Endpoint, GenerationSettings, SyncSettings, UserAccount, VoiceSettings, CustomPersonality } from '../App';
import { translations, Language, normalizeLanguage } from '../translations';

interface SettingsProps {
  userName: string;
  setUserName: (name: string) => void;
  geminiApiKey: string;
  setGeminiApiKey: (key: string) => void;
  endpoints: Endpoint[];
  setEndpoints: (endpoints: Endpoint[]) => void;
  geminiModels: string[];
  onFetchModels: () => Promise<void>;
  onSave: () => void;
  onSignOut: () => void;
  genSettings: GenerationSettings;
  setGenSettings: (settings: GenerationSettings) => void;
  voiceSettings: VoiceSettings;
  setVoiceSettings: (settings: VoiceSettings) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  currentUser: UserAccount | null;
  syncSettings: SyncSettings;
  setSyncSettings: (settings: SyncSettings) => void;
  syncStatus: string;
  lastSyncAt: number | null;
  onSyncNow: () => Promise<void>;
  onSaveGuestSession: (username: string, password: string) => Promise<void>;
}

export function Settings({ 
  userName, 
  setUserName, 
  geminiApiKey,
  setGeminiApiKey,
  endpoints, 
  setEndpoints, 
  geminiModels, 
  onFetchModels, 
  onSave,
  onSignOut,
  genSettings,
  setGenSettings,
  voiceSettings,
  setVoiceSettings,
  language,
  setLanguage,
  currentUser,
  syncSettings,
  setSyncSettings,
  syncStatus,
  lastSyncAt,
  onSyncNow,
  onSaveGuestSession,
}: SettingsProps) {
  const safeLanguage = normalizeLanguage(language);
  const t = translations[safeLanguage].settings;
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [geminiError, setGeminiError] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [guestUsername, setGuestUsername] = useState('');
  const [guestPassword, setGuestPassword] = useState('');
  const [guestSaveError, setGuestSaveError] = useState('');
  const db = syncSettings.database;
  const activeUser: UserAccount = currentUser || {
    id: 'guest',
    username: 'guest',
    displayName: 'Guest',
    isGuest: true,
  };
  const activeDisplayName = activeUser.displayName || activeUser.username || 'User';

  const updateDb = (field: keyof typeof db, value: string) => {
    setSyncSettings({
      ...syncSettings,
      database: {
        ...db,
        [field]: value,
      },
    });
  };

  const addEndpoint = () => {
    setEndpoints([...endpoints, { id: Date.now().toString(), name: 'New Endpoint', url: '', key: '' }]);
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      await onSyncNow();
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveGuestSession = async () => {
    setGuestSaveError('');
    setIsSyncing(true);
    try {
      await onSaveGuestSession(guestUsername, guestPassword);
      setGuestPassword('');
    } catch (err: any) {
      setGuestSaveError(err.message || 'Unable to save guest session.');
    } finally {
      setIsSyncing(false);
    }
  };

  const updateEndpoint = (id: string, field: keyof Endpoint, value: string | boolean) => {
    setEndpoints(endpoints.map(ep => ep.id === id ? { ...ep, [field]: value } : ep));
  };

  const removeEndpoint = (id: string) => {
    setEndpoints(endpoints.filter(ep => ep.id !== id));
  };

  const handleFetchModels = async () => {
    setIsLoadingModels(true);
    setGeminiError('');
    try {
      await onFetchModels();
    } catch (err: any) {
      setGeminiError(err.message || 'Failed to fetch models');
    }
    setIsLoadingModels(false);
  };

  return (
    <div className="flex-1 overflow-y-auto w-full min-w-0 p-4 sm:p-6 md:p-12 scrollbar-hide">
      <div className="max-w-3xl mx-auto space-y-10 md:space-y-12 pb-24 min-w-0">
        
        {/* Header */}
        <div>
          <div className="text-[10px] uppercase tracking-[0.4em] text-on-surface-variant mb-2 font-semibold">Configuration</div>
          <h1 className="text-3xl md:text-5xl font-display font-light italic text-primary">{t.title}.</h1>
        </div>

        {/* Profile Section */}
        <section className="space-y-6">
          <div className="flex items-center gap-2 border-b border-outline pb-2">
            <User size={16} className="text-on-surface-variant" />
            <h2 className="text-lg font-display uppercase tracking-widest font-semibold text-primary">{t.profile}</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-2">{t.displayName}</label>
              <input 
                type="text" 
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="w-full bg-surface border border-outline rounded-2xl p-4 text-sm font-body text-on-surface focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                placeholder="Enter your name"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-2">{t.language}</label>
              <div className="flex bg-surface border border-outline rounded-2xl p-1">
                <button 
                  onClick={() => setLanguage('id')}
                  className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${safeLanguage === 'id' ? 'bg-primary text-on-primary shadow-md' : 'text-on-surface-variant hover:bg-surface-dim'}`}
                >
                  <img src="https://flagcdn.com/w20/id.png" alt="ID" className="w-4 h-3 object-cover rounded-sm" referrerPolicy="no-referrer" />
                  Indonesia
                </button>
                <button 
                  onClick={() => setLanguage('en')}
                  className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${safeLanguage === 'en' ? 'bg-primary text-on-primary shadow-md' : 'text-on-surface-variant hover:bg-surface-dim'}`}
                >
                  <img src="https://flagcdn.com/w20/gb.png" alt="EN" className="w-4 h-3 object-cover rounded-sm" referrerPolicy="no-referrer" />
                  English
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Postgres Sync Section */}
        <section className="space-y-6">
          <div className="flex items-center gap-2 border-b border-outline pb-2">
            <Database size={16} className="text-on-surface-variant" />
            <h2 className="text-lg font-display uppercase tracking-widest font-semibold text-primary">Postgres Sync</h2>
          </div>

          <div className="p-4 sm:p-6 bg-surface-dim border border-outline rounded-3xl md:rounded-[32px] space-y-5 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-sm font-display font-semibold italic text-primary">{activeDisplayName}</div>
                <div className="text-[10px] uppercase tracking-widest text-on-surface-variant mt-1">{activeUser.isGuest ? 'Guest mode' : activeUser.username}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {lastSyncAt && (
                  <div className="px-3 py-2 rounded-full bg-primary/10 text-primary text-[10px] uppercase tracking-widest font-bold border border-primary/20">
                    Last Sync {new Date(lastSyncAt).toLocaleString()}
                  </div>
                )}
                <button
                  onClick={() => setSyncSettings({ ...syncSettings, enabled: !syncSettings.enabled })}
                  className={`px-4 py-2 rounded-full text-[10px] uppercase tracking-widest font-bold border transition-all ${syncSettings.enabled ? 'bg-primary text-on-primary border-primary' : 'bg-surface text-on-surface-variant border-outline'}`}
                >
                  {syncSettings.enabled ? 'Sync On' : 'Sync Off'}
                </button>
              </div>
            </div>

            {activeUser.isGuest && (
              <div className="p-4 bg-surface border border-outline rounded-2xl space-y-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-primary">Save Guest Session</div>
                  <div className="text-xs text-on-surface-variant mt-1">Create a username and password to save this guest session to your Postgres database.</div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-2">Username</label>
                    <input
                      value={guestUsername}
                      onChange={(e) => setGuestUsername(e.target.value)}
                      className="w-full bg-surface-dim border border-outline rounded-xl p-3 text-sm font-body text-on-surface focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-2">Password</label>
                    <input
                      type="password"
                      value={guestPassword}
                      onChange={(e) => setGuestPassword(e.target.value)}
                      className="w-full bg-surface-dim border border-outline rounded-xl p-3 text-sm font-body text-on-surface focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                    />
                  </div>
                </div>

                {guestSaveError && <div className="text-xs text-error">{guestSaveError}</div>}

                <button
                  onClick={handleSaveGuestSession}
                  disabled={isSyncing || !guestUsername || guestPassword.length < 8 || !db.databaseUrl || !db.database || !db.user}
                  className="px-4 py-2 rounded-full bg-primary text-on-primary text-[10px] uppercase tracking-widest font-bold disabled:opacity-50"
                >
                  Save Guest Session
                </button>
              </div>
            )}

            <div>
              <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-2">Sync API URL</label>
              <input
                type="url"
                value={syncSettings.apiBaseUrl}
                onChange={(e) => setSyncSettings({ ...syncSettings, apiBaseUrl: e.target.value })}
                className="w-full bg-surface border border-outline rounded-xl p-3 text-sm font-body text-on-surface focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                placeholder="Web: blank for same server. Android: blank = direct Postgres"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-2">Database URL</label>
                <input
                  value={db.databaseUrl}
                  onChange={(e) => updateDb('databaseUrl', e.target.value)}
                  className="w-full bg-surface border border-outline rounded-xl p-3 text-sm font-body text-on-surface focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                  placeholder="Postgres host or postgres:// URL"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-2">Database</label>
                <input
                  value={db.database}
                  onChange={(e) => updateDb('database', e.target.value)}
                  className="w-full bg-surface border border-outline rounded-xl p-3 text-sm font-body text-on-surface focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-2">Database Schema</label>
                <input
                  value={db.schemaName}
                  onChange={(e) => updateDb('schemaName', e.target.value || 'adoetzgpt')}
                  className="w-full bg-surface border border-outline rounded-xl p-3 text-sm font-body text-on-surface focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                  placeholder="adoetzgpt"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-2">User</label>
                <input
                  value={db.user}
                  onChange={(e) => updateDb('user', e.target.value)}
                  className="w-full bg-surface border border-outline rounded-xl p-3 text-sm font-body text-on-surface focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-2">Password</label>
                <input
                  type="password"
                  value={db.password}
                  onChange={(e) => updateDb('password', e.target.value)}
                  className="w-full bg-surface border border-outline rounded-xl p-3 text-sm font-body text-on-surface focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-2">Custom Database Port</label>
                <input
                  value={db.port}
                  onChange={(e) => updateDb('port', e.target.value)}
                  className="w-full bg-surface border border-outline rounded-xl p-3 text-sm font-body text-on-surface focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                  placeholder="Blank = 5432"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-outline/50">
              <div className="space-y-1">
                <div className={`text-xs ${syncStatus.toLowerCase().includes('success') || syncStatus.toLowerCase().includes('synced') ? 'text-primary' : 'text-on-surface-variant'}`}>
                  {syncStatus || 'Postgres sync stores app data per signed-in user.'}
                </div>
                <div className="text-[10px] uppercase tracking-widest text-on-surface-variant">
                  {lastSyncAt ? `Last successful sync: ${new Date(lastSyncAt).toLocaleString()}` : 'No successful database sync yet.'}
                </div>
              </div>
              <button
                onClick={handleSyncNow}
                disabled={isSyncing || !syncSettings.enabled || activeUser.isGuest}
                className="shrink-0 px-4 py-2 border border-black dark:border-white rounded-full text-[10px] uppercase tracking-widest font-semibold flex items-center justify-center gap-2 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all disabled:opacity-50"
              >
                <RotateCw size={12} className={isSyncing ? 'animate-spin' : ''} />
                Sync Now
              </button>
            </div>
          </div>
        </section>

        {/* Endpoints Section */}
        <section className="space-y-6">
          <div className="flex items-center justify-between border-b border-outline pb-2">
            <div className="flex items-center gap-2">
              <Server size={16} className="text-on-surface-variant" />
              <h2 className="text-lg font-display uppercase tracking-widest font-semibold text-primary">API Endpoints</h2>
            </div>
            <button 
              onClick={addEndpoint}
              className="text-[10px] uppercase tracking-widest font-semibold flex items-center gap-1 text-on-surface-variant hover:text-primary transition-colors"
            >
              <Plus size={12} /> Add Config
            </button>
          </div>
          
          <div className="space-y-6">
            {endpoints.map((ep, index) => (
              <div key={ep.id} className="p-4 sm:p-6 bg-surface-dim border border-outline rounded-3xl md:rounded-[32px] space-y-4 relative group min-w-0">
                {endpoints.length > 1 && (
                  <button 
                    onClick={() => removeEndpoint(ep.id)}
                    className="absolute top-6 right-6 text-on-surface-variant hover:text-error transition-colors"
                    title="Remove Endpoint"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
                
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-2">Alias / Name</label>
                  <input 
                    type="text" 
                    value={ep.name}
                    onChange={(e) => updateEndpoint(ep.id, 'name', e.target.value)}
                    className="w-full bg-surface border border-outline rounded-xl p-3 text-sm font-body text-on-surface focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                    placeholder="e.g. Local LLM"
                  />
                </div>
                
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-2">Base URL</label>
                  <input 
                    type="text" 
                    value={ep.url}
                    onChange={(e) => updateEndpoint(ep.id, 'url', e.target.value)}
                    className="w-full bg-surface border border-outline rounded-xl p-3 text-sm font-body text-on-surface focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                    placeholder="https://api.openai.com/v1"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-2">API Key</label>
                  <div className="relative">
                    <Key size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                    <input
                      type="password"
                      value={ep.key}
                      onChange={(e) => updateEndpoint(ep.id, 'key', e.target.value)}
                      className="w-full bg-surface border border-outline rounded-xl py-3 pl-9 pr-3 text-sm font-body text-on-surface focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                      placeholder="sk-..."
                    />
                  </div>
                </div>

                {/* CORS warning for NVIDIA */}
                {(ep.name.toLowerCase().includes('nvidia') || ep.url.includes('nvidia')) && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                    <div className="flex items-start gap-2">
                      <Info size={16} className="text-amber-500 shrink-0 mt-0.5" />
                      <div className="text-xs">
                        <p className="font-semibold text-amber-600 dark:text-amber-400">CORS Warning</p>
                        <p className="text-amber-600/80 dark:text-amber-400/80 mt-1">
                          NVIDIA's API doesn't support direct browser requests due to CORS policy. You'll get a CORS error when trying to chat.
                          Consider using a different provider or setting up a proxy server.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id={`skip-fetch-${ep.id}`}
                    checked={ep.skipModelFetch || false}
                    onChange={(e) => {
                      const checkbox = e.target as HTMLInputElement;
                      setEndpoints(endpoints.map(endpoint =>
                        endpoint.id === ep.id
                          ? { ...endpoint, skipModelFetch: checkbox.checked }
                          : endpoint
                      ));
                    }}
                    className="w-4 h-4 rounded border-outline text-primary focus:ring-primary focus:ring-offset-0"
                  />
                  <label htmlFor={`skip-fetch-${ep.id}`} className="text-sm text-on-surface flex items-center gap-2 cursor-pointer">
                    <span>Skip model fetch</span>
                    <Info size={14} className="text-on-surface-variant" title="Enable this for endpoints that don't support model listing (e.g., NVIDIA, some providers)" />
                  </label>
                </div>

                {(ep.skipModelFetch || !ep.url) && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold">
                        Available Models <span className="text-on-surface-variant font-normal">(one per line)</span>
                      </label>
                      {ep.name.toLowerCase().includes('nvidia') && (!ep.models || ep.models.length === 0) && (
                        <button
                          onClick={() => {
                            const nvidiaModels = [
                              'nvidia/llama-3.1-nv-70b-instruct',
                              'nvidia/llama-3.1-nv-8b-instruct',
                              'nvidia/llama-3.3-70b-instruct',
                              'nvidia/llama-3.3-8b-instruct',
                              'nvidia/mistralai/mixtral-8x7b-instruct-v0.1',
                              'nvidia/mistralai/mistral-7b-instruct-v0.2',
                              'nvidia/mistralai/mistral-large-2407',
                              'nvidia/meta/llama-3.1-405b-instruct-fp8',
                              'nvidia/gemma-2-27b-it',
                              'nvidia/gemma-2-9b-it',
                            ];
                            setEndpoints(endpoints.map(endpoint =>
                              endpoint.id === ep.id ? { ...endpoint, models: nvidiaModels } : endpoint
                            ));
                          }}
                          className="text-[10px] bg-primary/10 text-primary px-2 py-1 rounded-lg hover:bg-primary/20 transition-all"
                        >
                          Auto-fill NVIDIA models
                        </button>
                      )}
                    </div>
                    <textarea
                      value={(ep.models || []).join('\n')}
                      onChange={(e) => {
                        const models = e.target.value.split('\n').map(m => m.trim()).filter(m => m.length > 0);
                        setEndpoints(endpoints.map(endpoint =>
                          endpoint.id === ep.id ? { ...endpoint, models } : endpoint
                        ));
                      }}
                      className="w-full bg-surface border border-outline rounded-xl p-3 text-sm font-mono text-on-surface focus:outline-none focus:border-black dark:focus:border-white transition-colors min-h-[100px]"
                      placeholder="nvidia/llama-3.1-70b-instruct&#10;nvidia/llama-3.1-8b-instruct&#10;nvidia/mistralai/mixtral-8x7b-instruct"
                    />
                    <p className="text-[10px] text-on-surface-variant mt-1">
                      Enter model names that this endpoint supports (one per line). These will appear in the model selector.
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Gemini Testing Section */}
        <section className="space-y-6">
          <div className="flex items-center gap-2 border-b border-outline pb-2">
            <Sparkles size={16} className="text-on-surface-variant" />
            <h2 className="text-lg font-display uppercase tracking-widest font-semibold text-primary">Gemini Tools</h2>
          </div>
          
          <div className="p-4 sm:p-6 bg-surface-dim border border-outline rounded-3xl md:rounded-[32px] space-y-6 min-w-0">
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-2">Gemini API Key (Optional Override)</label>
              <div className="relative">
                <Key size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input 
                  type="password" 
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  className="w-full bg-surface border border-outline rounded-xl py-3 pl-9 pr-3 text-sm font-body text-on-surface focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                  placeholder="Enter your Gemini API key (defaults to .env if empty)"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 pt-2 border-t border-outline/50">
              <div>
                <h3 className="text-sm font-display font-semibold italic text-primary">Model Discovery</h3>
                <p className="text-xs text-on-surface-variant mt-1 leading-relaxed max-w-md">
                  Fetch and test available models from the Gemini API using your provided environment key.
                </p>
              </div>
              <button 
                onClick={handleFetchModels}
                disabled={isLoadingModels}
                className="shrink-0 px-4 py-2 border border-black dark:border-white rounded-full text-[10px] uppercase tracking-widest font-semibold flex items-center gap-2 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all disabled:opacity-50"
              >
                {isLoadingModels ? <RefreshCw size={12} className="animate-spin" /> : <Bot size={12} />}
                {isLoadingModels ? 'Fetching...' : 'Fetch Models'}
              </button>
            </div>

            {geminiError && (
              <div className="p-4 rounded-xl bg-error/10 border border-error/20 text-error text-xs font-body">
                {geminiError}
              </div>
            )}

            {geminiModels.length > 0 && (
              <div className="mt-6">
                <div className="text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-3">Available Models</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto scrollbar-hide pr-2">
                  {geminiModels.map((model, idx) => (
                    <div key={idx} className="p-3 bg-surface border border-outline rounded-xl text-xs font-mono text-on-surface break-words">
                      {model}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Gemini Live Section */}
        <section className="space-y-6">
          <div className="flex items-center gap-2 border-b border-outline pb-2">
            <Waves size={16} className="text-on-surface-variant" />
            <h2 className="text-lg font-display uppercase tracking-widest font-semibold text-primary">Gemini Live (Voice)</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Voice Selection */}
            <div className="space-y-4">
              <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-2">Voice Model</label>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                {['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'].map((voice) => (
                  <button
                    key={voice}
                    onClick={() => setVoiceSettings({ ...voiceSettings, voice: voice as any })}
                    className={`py-2 px-3 rounded-xl border text-[10px] font-bold transition-all ${voiceSettings.voice === voice ? 'bg-primary/10 border-primary text-primary shadow-sm' : 'bg-surface border-outline text-on-surface-variant hover:border-primary/50'}`}
                  >
                    {voice}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-on-surface-variant italic leading-relaxed">
                Select the vocal tone for real-time interactions.
              </p>
            </div>

            {/* Voice Personality Selection */}
            <div className="space-y-4">
              <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-2">Voice Personality</label>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1 scrollbar-hide">
                {[
                  { name: 'Assistant', icon: <Bot size={12} /> },
                  { name: 'Therapist', icon: <BrainCircuit size={12} /> },
                  { name: 'Story teller', icon: <BookOpen size={12} /> },
                  { name: 'Meditation', icon: <Activity size={12} /> },
                  { name: 'Doctor', icon: <Activity size={12} /> },
                  { name: 'Argumentative', icon: <Swords size={12} /> },
                  { name: 'Romantic', icon: <Heart size={12} /> },
                  { name: 'Conspiracy', icon: <Info size={12} /> },
                  { name: 'Natural human', icon: <MessageSquare size={12} /> },
                  { name: 'Custom', icon: <Sparkles size={12} /> },
                  ...(voiceSettings.customVoicePersonalities || []).map(cp => ({
                    name: `custom:${cp.id}`,
                    displayName: cp.name,
                    icon: <Sparkles size={12} />,
                    isCustom: true,
                    customId: cp.id,
                  }))
                ].map((p: any) => (
                  <button
                    key={p.name}
                    onClick={() => setVoiceSettings({ ...voiceSettings, personality: p.name })}
                    className={`py-3 px-3 rounded-2xl border text-[10px] font-bold transition-all flex items-center gap-2 ${voiceSettings.personality === p.name ? 'bg-primary/10 border-primary text-primary shadow-sm' : 'bg-surface border-outline text-on-surface-variant hover:border-primary/50'}`}
                  >
                    {p.icon}
                    {p.displayName || p.name}
                  </button>
                ))}
              </div>

              {/* Add new custom voice personality */}
              <button
                onClick={() => {
                  const id = Date.now().toString();
                  const customs = voiceSettings.customVoicePersonalities || [];
                  setVoiceSettings({
                    ...voiceSettings,
                    customVoicePersonalities: [...customs, { id, name: `Custom ${customs.length + 1}`, prompt: '' }],
                    personality: `custom:${id}`,
                  });
                }}
                className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest text-on-surface-variant hover:text-primary transition-colors"
              >
                <Plus size={12} /> Add Voice Personality
              </button>

              {voiceSettings.personality === 'Custom' && (
                <textarea
                  value={voiceSettings.customPersonality || ''}
                  onChange={(e) => setVoiceSettings({ ...voiceSettings, customPersonality: e.target.value })}
                  placeholder="Describe your custom voice personality instructions..."
                  className="w-full mt-2 bg-surface border border-outline rounded-xl p-3 text-xs font-body text-on-surface focus:outline-none focus:border-primary transition-colors min-h-[80px]"
                />
              )}

              {/* Custom voice personality editor */}
              {voiceSettings.personality.startsWith('custom:') && (() => {
                const customId = voiceSettings.personality.replace('custom:', '');
                const cp = (voiceSettings.customVoicePersonalities || []).find(c => c.id === customId);
                if (!cp) return null;
                return (
                  <div className="mt-2 p-4 bg-surface border border-outline rounded-2xl space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        value={cp.name}
                        onChange={(e) => {
                          const updated = (voiceSettings.customVoicePersonalities || []).map(c =>
                            c.id === customId ? { ...c, name: e.target.value } : c
                          );
                          setVoiceSettings({ ...voiceSettings, customVoicePersonalities: updated });
                        }}
                        className="flex-1 bg-surface-dim border border-outline rounded-xl p-2 text-xs font-body text-on-surface focus:outline-none focus:border-primary"
                        placeholder="Personality name"
                      />
                      <button
                        onClick={() => {
                          const updated = (voiceSettings.customVoicePersonalities || []).filter(c => c.id !== customId);
                          setVoiceSettings({ ...voiceSettings, customVoicePersonalities: updated, personality: 'Assistant' });
                        }}
                        className="p-2 text-on-surface-variant hover:text-error transition-colors"
                        title="Delete this personality"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <textarea
                      value={cp.prompt}
                      onChange={(e) => {
                        const updated = (voiceSettings.customVoicePersonalities || []).map(c =>
                          c.id === customId ? { ...c, prompt: e.target.value } : c
                        );
                        setVoiceSettings({ ...voiceSettings, customVoicePersonalities: updated });
                      }}
                      placeholder="Describe this voice personality's instructions..."
                      className="w-full bg-surface-dim border border-outline rounded-xl p-3 text-xs font-body text-on-surface focus:outline-none focus:border-primary min-h-[80px]"
                    />
                  </div>
                );
              })()}

              <p className="text-[10px] text-on-surface-variant italic leading-relaxed">
                The behavioral framework for voice interactions.
              </p>
            </div>
          </div>
        </section>

        {/* Regular Chat Personality Section */}
        <section className="space-y-6">
          <div className="flex items-center gap-2 border-b border-outline pb-2">
            <MessageSquare size={16} className="text-on-surface-variant" />
            <h2 className="text-lg font-display uppercase tracking-widest font-semibold text-primary">Chat Personality (Text)</h2>
          </div>

          <div className="space-y-4">
            <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-2">Select Text Mode</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {[
                { name: 'Assistant', icon: <Bot size={12} /> },
                { name: 'Therapist', icon: <BrainCircuit size={12} /> },
                { name: 'Story teller', icon: <BookOpen size={12} /> },
                { name: 'Meditation', icon: <Activity size={12} /> },
                { name: 'Doctor', icon: <Activity size={12} /> },
                { name: 'Argumentative', icon: <Swords size={12} /> },
                { name: 'Romantic', icon: <Heart size={12} /> },
                { name: 'Conspiracy', icon: <Info size={12} /> },
                { name: 'Natural human', icon: <MessageSquare size={12} /> },
                { name: 'Custom', icon: <Sparkles size={12} /> },
                ...(voiceSettings.customTextPersonalities || []).map(cp => ({
                  name: `custom-text:${cp.id}`,
                  displayName: cp.name,
                  icon: <Sparkles size={12} />,
                }))
              ].map((p: any) => (
                <button
                  key={p.name}
                  onClick={() => setVoiceSettings({ ...voiceSettings, textPersonality: p.name })}
                  className={`py-3 px-3 rounded-2xl border text-[10px] font-bold transition-all flex items-center gap-2 ${voiceSettings.textPersonality === p.name ? 'bg-primary/10 border-primary text-primary shadow-sm' : 'bg-surface border-outline text-on-surface-variant hover:border-primary/50'}`}
                >
                  {p.icon}
                  {p.displayName || p.name}
                </button>
              ))}
            </div>

            {/* Add new custom text personality */}
            <button
              onClick={() => {
                const id = Date.now().toString();
                const customs = voiceSettings.customTextPersonalities || [];
                setVoiceSettings({
                  ...voiceSettings,
                  customTextPersonalities: [...customs, { id, name: `Custom ${customs.length + 1}`, prompt: '' }],
                  textPersonality: `custom-text:${id}`,
                });
              }}
              className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest text-on-surface-variant hover:text-primary transition-colors"
            >
              <Plus size={12} /> Add Text Personality
            </button>

            {voiceSettings.textPersonality === 'Custom' && (
              <textarea
                value={voiceSettings.customTextPersonality || ''}
                onChange={(e) => setVoiceSettings({ ...voiceSettings, customTextPersonality: e.target.value })}
                placeholder="Describe your custom text personality instructions..."
                className="w-full mt-2 bg-surface border border-outline rounded-xl p-3 text-xs font-body text-on-surface focus:outline-none focus:border-primary transition-colors min-h-[100px]"
              />
            )}

            {/* Custom text personality editor */}
            {voiceSettings.textPersonality.startsWith('custom-text:') && (() => {
              const customId = voiceSettings.textPersonality.replace('custom-text:', '');
              const cp = (voiceSettings.customTextPersonalities || []).find(c => c.id === customId);
              if (!cp) return null;
              return (
                <div className="mt-2 p-4 bg-surface border border-outline rounded-2xl space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      value={cp.name}
                      onChange={(e) => {
                        const updated = (voiceSettings.customTextPersonalities || []).map(c =>
                          c.id === customId ? { ...c, name: e.target.value } : c
                        );
                        setVoiceSettings({ ...voiceSettings, customTextPersonalities: updated });
                      }}
                      className="flex-1 bg-surface-dim border border-outline rounded-xl p-2 text-xs font-body text-on-surface focus:outline-none focus:border-primary"
                      placeholder="Personality name"
                    />
                    <button
                      onClick={() => {
                        const updated = (voiceSettings.customTextPersonalities || []).filter(c => c.id !== customId);
                        setVoiceSettings({ ...voiceSettings, customTextPersonalities: updated, textPersonality: 'Assistant' });
                      }}
                      className="p-2 text-on-surface-variant hover:text-error transition-colors"
                      title="Delete this personality"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <textarea
                    value={cp.prompt}
                    onChange={(e) => {
                      const updated = (voiceSettings.customTextPersonalities || []).map(c =>
                        c.id === customId ? { ...c, prompt: e.target.value } : c
                      );
                      setVoiceSettings({ ...voiceSettings, customTextPersonalities: updated });
                    }}
                    placeholder="Describe this text personality's instructions..."
                    className="w-full bg-surface-dim border border-outline rounded-xl p-3 text-xs font-body text-on-surface focus:outline-none focus:border-primary min-h-[100px]"
                  />
                </div>
              );
            })()}

            <p className="text-[10px] text-on-surface-variant italic leading-relaxed">
              Define the tone and style used for standard text messages and thinking processes.
            </p>
          </div>
        </section>

        {/* Generation Models Section */}
        <section className="space-y-6">
          <div className="flex items-center gap-2 border-b border-outline pb-2">
            <Sparkles size={16} className="text-on-surface-variant" />
            <h2 className="text-lg font-display uppercase tracking-widest font-semibold text-primary">Media Generation</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-2">Image Model</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setGenSettings({ ...genSettings, imageModel: 'gemini' })}
                  className={`py-3 px-4 rounded-2xl border text-xs font-bold transition-all ${genSettings.imageModel === 'gemini' ? 'bg-primary/10 border-primary text-primary shadow-sm ring-1 ring-primary/20' : 'bg-surface border-outline text-on-surface-variant hover:border-primary/50'}`}
                >
                  Gemini
                </button>
                <button
                  onClick={() => setGenSettings({ ...genSettings, imageModel: 'openai' })}
                  className={`py-3 px-4 rounded-2xl border text-xs font-bold transition-all ${genSettings.imageModel === 'openai' ? 'bg-primary/10 border-primary text-primary shadow-sm ring-1 ring-primary/20' : 'bg-surface border-outline text-on-surface-variant hover:border-primary/50'}`}
                >
                  OpenAI
                </button>
              </div>
              <p className="text-[10px] text-on-surface-variant italic leading-relaxed">
                Primary engine for generating high-fidelity creative imagery.
              </p>
            </div>

            <div className="space-y-4">
              <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-2">Video Model</label>
              <button
                disabled
                className="w-full py-3 px-4 rounded-2xl border border-primary bg-primary/10 text-primary text-xs font-bold text-left flex items-center justify-between"
              >
                Google Veo (Latest)
                <span className="text-[9px] bg-primary text-on-primary px-2 py-0.5 rounded-full uppercase tracking-tighter">Active</span>
              </button>
              <p className="text-[10px] text-on-surface-variant italic leading-relaxed">
                Utilizing massive-scale cinematic video generation models.
              </p>
            </div>
          </div>
        </section>

        {/* Action Bar */}
        <div className="flex flex-col-reverse sm:flex-row justify-between sm:items-center gap-4 pt-12 border-t border-outline/30">
          <button 
            className="flex items-center gap-2 px-6 py-3 rounded-full border border-error/30 text-error hover:bg-error/5 transition-all font-label text-[10px] tracking-[0.2em] uppercase font-bold"
            title="Sign out of your account"
            onClick={() => {
              if (window.confirm(translations[safeLanguage].sidebar.signOutConfirm)) {
                onSignOut();
              }
            }}
          >
            <LogOut size={14} />
            {t.signOut}
          </button>
          
          <button 
            onClick={() => {
              onSave();
              const btn = document.activeElement as HTMLButtonElement;
              const originalText = btn.innerHTML;
              btn.innerHTML = 'Saved!';
              btn.style.backgroundColor = '#16a34a'; // green-600
              setTimeout(() => {
                btn.innerHTML = originalText;
                btn.style.backgroundColor = '';
              }, 2000);
            }}
            className="px-8 py-3 rounded-full bg-primary text-on-primary hover:opacity-90 transition-all font-label text-xs tracking-widest uppercase flex items-center gap-2 font-bold shadow-md active:scale-95"
          >
            <Save size={14} /> {t.save}
          </button>
        </div>

      </div>
    </div>
  );
}
