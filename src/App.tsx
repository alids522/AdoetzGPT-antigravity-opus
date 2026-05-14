/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Chat } from './components/Chat';
import { Settings } from './components/Settings';
import { Auth } from './components/Auth';
import { TokenUsage } from './components/TokenUsage';
import { GoogleGenAI } from '@google/genai';
import { Language, normalizeLanguage } from './translations';
import { loadPersistedState, pullRemoteState, pushRemoteState, savePersistedState, signUp, type PersistedAppState } from './storage';

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: string;
  model?: string;
  attachments?: {
    name: string;
    type: string;
    data: string;
    url?: string;
  }[];
}

export interface Session {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
  pinned?: boolean;
}

export interface Endpoint {
  id: string;
  url: string;
  key: string;
  name: string;
  skipModelFetch?: boolean;
  models?: string[];
}

export interface GenerationSettings {
  imageModel: 'gemini' | 'openai';
  videoModel: 'veo';
}

export interface CustomPersonality {
  id: string;
  name: string;
  prompt: string;
}

export interface VoiceSettings {
  voice: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';
  personality: string;
  customPersonality?: string;
  textPersonality: string;
  customTextPersonality?: string;
  customVoicePersonalities?: CustomPersonality[];
  customTextPersonalities?: CustomPersonality[];
}

export interface Memory {
  id: string;
  content: string;
  timestamp: number;
}

export interface TokenUsageRecord {
  timestamp: number;
  model: string;
  endpoint: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface CustomCounter {
  id: string;
  name: string;
  createdAt: number;
  color: string;
}

export interface UserAccount {
  id: string;
  username: string;
  email?: string;
  displayName?: string;
  isGuest?: boolean;
}

export interface DatabaseSettings {
  databaseUrl: string;
  database: string;
  schemaName: string;
  user: string;
  password: string;
  port: string;
}

export interface SyncSettings {
  enabled: boolean;
  apiBaseUrl: string;
  database: DatabaseSettings;
}

const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  enabled: false,
  apiBaseUrl: '',
  database: {
    databaseUrl: '',
    database: '',
    schemaName: 'adoetzgpt',
    user: '',
    password: '',
    port: '',
  },
};

function normalizeSyncSettings(settings?: Partial<SyncSettings> | any): SyncSettings {
  return {
    ...DEFAULT_SYNC_SETTINGS,
    ...(settings || {}),
    database: {
      ...DEFAULT_SYNC_SETTINGS.database,
      ...(settings?.database || {}),
      schemaName: settings?.database?.schemaName || settings?.schemaName || DEFAULT_SYNC_SETTINGS.database.schemaName,
    },
  };
}

function normalizeUserAccount(user?: Partial<UserAccount> | null): UserAccount | null {
  if (!user) return null;

  const username = user.username || user.email || user.displayName || (user.isGuest ? 'guest' : 'user');
  return {
    ...user,
    id: user.id || `${user.isGuest ? 'guest' : 'user'}-${username}`,
    username,
    displayName: user.displayName || (user.isGuest ? 'Guest' : username),
  };
}

const DEFAULT_ENDPOINTS: Endpoint[] = [
  { id: '1', name: 'OpenAI', url: 'https://api.openai.com/v1', key: '' }
];

const DEFAULT_GEN_SETTINGS: GenerationSettings = {
  imageModel: 'gemini',
  videoModel: 'veo'
};

const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  voice: 'Zephyr',
  personality: 'Assistant',
  customPersonality: '',
  textPersonality: 'Assistant',
  customTextPersonality: ''
};

const DEFAULT_SESSIONS: Session[] = [
  { id: '1', title: 'New Session', messages: [], updatedAt: Date.now() }
];

const AUTH_STORAGE_VERSION = '2';

function createDefaultSessions(): Session[] {
  return [{ id: '1', title: 'New Session', messages: [], updatedAt: Date.now() }];
}

function migrateLocalAuthStorage() {
  if (typeof localStorage === 'undefined' || localStorage.getItem('authStorageVersion') === AUTH_STORAGE_VERSION) return;

  localStorage.removeItem('currentUser');
  localStorage.removeItem('authToken');

  for (const key of ['adoetzgpt.appState', 'appState']) {
    try {
      const saved = localStorage.getItem(key);
      if (!saved) continue;
      const state = JSON.parse(saved);
      localStorage.setItem(key, JSON.stringify({ ...state, currentUser: null, authToken: '' }));
    } catch (error) {
      console.warn(`Unable to migrate ${key}`, error);
    }
  }

  localStorage.setItem('authStorageVersion', AUTH_STORAGE_VERSION);
}

function readLocalJson<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch (error) {
    console.error(`Error loading ${key}`, error);
    return fallback;
  }
}

export default function App() {
  migrateLocalAuthStorage();
  const [hasLoadedSharedState, setHasLoadedSharedState] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [currentView, setCurrentView] = useState<'chat' | 'settings' | 'tokenUsage'>('chat');
  const [language, setLanguage] = useState<Language>(() => {
    return normalizeLanguage(localStorage.getItem('language'));
  });
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
  });

  const [models, setModels] = useState<string[]>([]);
  const [geminiModels, setGeminiModels] = useState<string[]>([]);
  const [endpointModels, setEndpointModels] = useState<{name: string, endpointId: string}[]>([]);
  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem('selectedModel') || 'gemini-2.5-flash';
  });
  const [isThinkingMode, setIsThinkingMode] = useState(false);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    return normalizeUserAccount(readLocalJson('currentUser', null));
  });
  const [authToken, setAuthToken] = useState(() => {
    return localStorage.getItem('authToken') || '';
  });
  const [syncSettings, setSyncSettings] = useState<SyncSettings>(() => {
    return normalizeSyncSettings(readLocalJson('syncSettings', DEFAULT_SYNC_SETTINGS));
  });
  const [syncStatus, setSyncStatus] = useState('');
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(() => {
    const saved = Number(localStorage.getItem('lastSyncAt') || 0);
    return saved || null;
  });

  // Settings State
  const [userName, setUserName] = useState(() => {
    return localStorage.getItem('userName') || 'User';
  });
  const [geminiApiKey, setGeminiApiKey] = useState(() => {
    return localStorage.getItem('geminiApiKey') || '';
  });
  const [endpoints, setEndpoints] = useState<Endpoint[]>(() => {
    return readLocalJson('endpoints', DEFAULT_ENDPOINTS);
  });

  const [genSettings, setGenSettings] = useState<GenerationSettings>(() => {
    return readLocalJson('genSettings', DEFAULT_GEN_SETTINGS);
  });

  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(() => {
    return readLocalJson('voiceSettings', DEFAULT_VOICE_SETTINGS);
  });

  const [sessions, setSessions] = useState<Session[]>(() => {
    return readLocalJson('sessions', DEFAULT_SESSIONS);
  });
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    return localStorage.getItem('currentSessionId') || '1';
  });

  // Token usage tracking
  const [tokenUsage, setTokenUsage] = useState({ input: 0, output: 0, total: 0, max: 0 });
  const [tokenUsageData, setTokenUsageData] = useState<TokenUsageRecord[]>(() => {
    return readLocalJson('tokenUsageData', []);
  });
  const [customCounters, setCustomCounters] = useState<CustomCounter[]>(() => {
    return readLocalJson('customCounters', []);
  });

  const [memories, setMemories] = useState<Memory[]>(() => {
    return readLocalJson('memories', []);
  });

  const saveMemory = (content: string) => {
    const newMemory: Memory = {
      id: Date.now().toString(),
      content,
      timestamp: Date.now()
    };
    setMemories(prev => [newMemory, ...prev]);
    return newMemory;
  };

  const deleteMemory = (id: string) => {
    setMemories(prev => prev.filter(m => m.id !== id));
  };

  const updateMemory = (id: string, content: string) => {
    setMemories(prev => prev.map(m => m.id === id ? { ...m, content } : m));
  };

  const currentSession = sessions.find(s => s.id === currentSessionId) || sessions[0];

  useEffect(() => {
    let isMounted = true;

    loadPersistedState()
      .then(async (state) => {
        if (!isMounted || !state) return;
        const normalizedUser = normalizeUserAccount(state.currentUser);
        setCurrentUser(normalizedUser);
        setAuthToken(state.authToken || '');
        setSyncSettings(normalizeSyncSettings(state.syncSettings));
        setLanguage(normalizeLanguage(state.language));
        setTheme(state.theme || 'light');
        setSelectedModel(state.selectedModel || 'gemini-2.5-flash');
        setUserName(state.userName || normalizedUser?.displayName || normalizedUser?.username || 'User');
        setGeminiApiKey(state.geminiApiKey || '');
        setEndpoints(state.endpoints?.length ? state.endpoints : DEFAULT_ENDPOINTS);
        setGenSettings(state.genSettings || DEFAULT_GEN_SETTINGS);
        setVoiceSettings(state.voiceSettings || DEFAULT_VOICE_SETTINGS);
        setSessions(state.sessions?.length ? state.sessions : DEFAULT_SESSIONS);
        setCurrentSessionId(state.currentSessionId || state.sessions?.[0]?.id || '1');
        setMemories(state.memories || []);
        setTokenUsageData(state.tokenUsageData || []);
        setCustomCounters(state.customCounters || []);

        // Auto-pull from remote database on startup for logged-in users
        const effectiveSyncSettings = normalizeSyncSettings(state.syncSettings);
        if (normalizedUser && !normalizedUser.isGuest && state.authToken && effectiveSyncSettings.enabled) {
          try {
            const remote = await pullRemoteState(state.authToken, effectiveSyncSettings);
            if (isMounted && remote) {
              // Merge remote sessions with local: combine both, deduplicate by id, keep newest
              const localSessions = state.sessions || [];
              const remoteSessions = remote.sessions || [];
              const sessionMap = new Map<string, Session>();
              for (const s of localSessions) sessionMap.set(s.id, s);
              for (const s of remoteSessions) {
                const existing = sessionMap.get(s.id);
                if (!existing || s.updatedAt > existing.updatedAt) {
                  sessionMap.set(s.id, s);
                }
              }
              const mergedSessions = Array.from(sessionMap.values()).sort((a, b) => b.updatedAt - a.updatedAt);

              // Merge memories: combine, deduplicate by id
              const localMemories = state.memories || [];
              const remoteMemories = remote.memories || [];
              const memoryMap = new Map<string, Memory>();
              for (const m of localMemories) memoryMap.set(m.id, m);
              for (const m of remoteMemories) memoryMap.set(m.id, m);
              const mergedMemories = Array.from(memoryMap.values()).sort((a, b) => b.timestamp - a.timestamp);

              // Merge token usage data: combine all records, deduplicate by timestamp+model+endpoint
              const localUsage = state.tokenUsageData || [];
              const remoteUsage = remote.tokenUsageData || [];
              const usageSet = new Set<string>();
              const mergedUsage: TokenUsageRecord[] = [];

              // Helper to create unique key for deduplication
              const usageKey = (r: TokenUsageRecord) => `${r.timestamp}-${r.model}-${r.endpoint}`;

              for (const record of [...localUsage, ...remoteUsage]) {
                const key = usageKey(record);
                if (!usageSet.has(key)) {
                  usageSet.add(key);
                  mergedUsage.push(record);
                }
              }
              // Sort by timestamp descending
              mergedUsage.sort((a, b) => b.timestamp - a.timestamp);

              // Merge custom counters: combine, deduplicate by id
              const localCounters = state.customCounters || [];
              const remoteCounters = remote.customCounters || [];
              const counterMap = new Map<string, CustomCounter>();
              for (const c of localCounters) counterMap.set(c.id, c);
              for (const c of remoteCounters) counterMap.set(c.id, c);
              const mergedCounters = Array.from(counterMap.values()).sort((a, b) => b.createdAt - a.createdAt);

              setSessions(mergedSessions.length ? mergedSessions : DEFAULT_SESSIONS);
              setCurrentSessionId(mergedSessions[0]?.id || '1');
              setMemories(mergedMemories);
              setTokenUsageData(mergedUsage);
              setCustomCounters(mergedCounters);
              // Apply other remote settings if they're newer
              if (remote.geminiApiKey) setGeminiApiKey(remote.geminiApiKey);
              if (remote.endpoints?.length) setEndpoints(remote.endpoints);
              if (remote.genSettings) setGenSettings(remote.genSettings);
              if (remote.voiceSettings) setVoiceSettings(remote.voiceSettings);
              if (remote.userName) setUserName(remote.userName);
              setLastSyncAt(Date.now());
            }
          } catch (error) {
            console.warn('Auto-pull on startup failed; using local state.', error);
          }
        }
      })
      .catch((error) => {
        console.warn('Shared storage unavailable; using browser fallback.', error);
      })
      .finally(() => {
        if (isMounted) {
          setHasLoadedSharedState(true);
          // Always open a new empty session on app start
          const freshId = 'startup-' + Date.now().toString();
          setSessions(prev => {
            // Only add if there isn't already an empty session at the top
            const hasEmpty = prev.length > 0 && prev[0].messages.length === 0;
            if (hasEmpty) {
              setCurrentSessionId(prev[0].id);
              return prev;
            }
            const freshSession: Session = { id: freshId, title: 'New Session', messages: [], updatedAt: Date.now() };
            setCurrentSessionId(freshId);
            return [freshSession, ...prev];
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const createSession = () => {
    // Don't create a new session if the current one is already empty
    const current = sessions.find(s => s.id === currentSessionId);
    if (current && current.messages.length === 0) {
      setCurrentView('chat');
      setIsMobileSidebarOpen(false);
      return;
    }
    const newSession: Session = {
      id: Date.now().toString(),
      title: 'New Session',
      messages: [],
      updatedAt: Date.now()
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setCurrentView('chat');
    setIsMobileSidebarOpen(false);
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== id);
      if (filtered.length === 0) {
        const newSession = { id: Date.now().toString(), title: 'New Session', messages: [], updatedAt: Date.now() };
        setCurrentSessionId(newSession.id);
        return [newSession];
      }
      if (id === currentSessionId) {
        setCurrentSessionId(filtered[0].id);
      }
      return filtered;
    });
  };

  const pinSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions(prev => prev.map(s => s.id === id ? { ...s, pinned: !s.pinned } : s));
  };
  
  const renameSession = (id: string, title: string) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, title, updatedAt: Date.now() } : s));
  };

  const clearAll = () => {
    setSessions([{ id: '1', title: 'New Session', messages: [], updatedAt: Date.now() }]);
    setCurrentSessionId('1');
    setCurrentView('chat');
  };

  const handleSignOut = () => {
    setCurrentUser(null);
    setAuthToken('');
    setUserName('User');
    localStorage.removeItem('userName');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('authToken');
    setCurrentView('chat');
    setIsMobileSidebarOpen(false);
  };

  const handleGuestMode = () => {
    const guestUser: UserAccount = {
      id: `guest-${Date.now()}`,
      username: 'guest',
      displayName: 'Guest',
      isGuest: true,
    };
    setCurrentUser(guestUser);
    setAuthToken('');
    setUserName('Guest');
    setSyncSettings(normalizeSyncSettings({ ...syncSettings, enabled: false }));
    setSyncStatus('Guest mode. Local sessions are saved on this device.');
  };

  const applyState = (state: Partial<PersistedAppState>) => {
    if (state.currentUser !== undefined) setCurrentUser(normalizeUserAccount(state.currentUser));
    if (state.authToken !== undefined) setAuthToken(state.authToken);
    if (state.syncSettings) setSyncSettings(normalizeSyncSettings(state.syncSettings));
    if (state.language) setLanguage(normalizeLanguage(state.language));
    if (state.theme) setTheme(state.theme);
    if (state.selectedModel) setSelectedModel(state.selectedModel);
    if (state.userName) setUserName(state.userName);
    if (state.geminiApiKey !== undefined) setGeminiApiKey(state.geminiApiKey);
    if (state.endpoints?.length) setEndpoints(state.endpoints);
    if (state.genSettings) setGenSettings(state.genSettings);
    if (state.voiceSettings) setVoiceSettings(state.voiceSettings);
    if (state.sessions?.length) setSessions(state.sessions);
    if (state.currentSessionId) setCurrentSessionId(state.currentSessionId);
    if (state.memories) setMemories(state.memories);
    if (state.tokenUsageData) setTokenUsageData(state.tokenUsageData);
    if (state.customCounters) setCustomCounters(state.customCounters);
  };

  const buildPersistedState = (): PersistedAppState => ({
    currentUser: normalizeUserAccount(currentUser),
    authToken,
    syncSettings,
    language,
    theme,
    selectedModel,
    userName,
    geminiApiKey,
    endpoints,
    genSettings,
    voiceSettings,
    sessions,
    currentSessionId,
    memories,
    tokenUsageData,
    customCounters,
  });

  const resetForAccount = (user: UserAccount, token: string, nextSyncSettings: SyncSettings) => {
    const normalizedUser = normalizeUserAccount(user);
    if (!normalizedUser) return;
    const freshSessions = createDefaultSessions();
    setCurrentUser(normalizedUser);
    setAuthToken(token);
    setUserName(normalizedUser.displayName || normalizedUser.username);
    setSyncSettings(nextSyncSettings);
    setGeminiApiKey('');
    setEndpoints(DEFAULT_ENDPOINTS);
    setGenSettings(DEFAULT_GEN_SETTINGS);
    setVoiceSettings(DEFAULT_VOICE_SETTINGS);
    setSessions(freshSessions);
    setCurrentSessionId(freshSessions[0].id);
    setMemories([]);
    setTokenUsageData([]);
    setCustomCounters([]);
    setSelectedModel('gemini-2.5-flash');
    setLastSyncAt(null);
  };

  const hasRemoteUserData = (remoteState?: PersistedAppState | null) => {
    return Boolean(remoteState?.sessions?.length || remoteState?.memories?.length || remoteState?.geminiApiKey || remoteState?.endpoints?.length || remoteState?.tokenUsageData?.length);
  };

  const handleAuthenticated = ({ user, token, remoteState, isNewAccount = false }: { user: UserAccount; token: string; remoteState?: PersistedAppState | null; isNewAccount?: boolean }) => {
    const normalizedUser = normalizeUserAccount(user);
    if (!normalizedUser) {
      setSyncStatus('Sign in failed. The server did not return a valid user.');
      return;
    }
    const mergedSyncSettings = normalizeSyncSettings({ ...syncSettings, enabled: true });

    if (remoteState && !isNewAccount && hasRemoteUserData(remoteState)) {
      applyState({
        ...remoteState,
        currentUser: normalizedUser,
        authToken: token,
        syncSettings: mergedSyncSettings,
      });
    } else {
      resetForAccount(normalizedUser, token, mergedSyncSettings);
    }

    setSyncStatus(isNewAccount ? 'Account created. Starting with a fresh workspace.' : 'Signed in. Sync is enabled.');
  };

  const syncNow = async () => {
    if (!currentUser || currentUser.isGuest || !authToken || !syncSettings.enabled) {
      setSyncStatus('Sign in or save guest session first.');
      return;
    }
    setSyncStatus('Syncing...');
    const state = buildPersistedState();
    await pushRemoteState(state);
    const remote = await pullRemoteState(authToken, syncSettings);
    if (remote) applyState({ ...remote, currentUser, authToken, syncSettings });
    const syncedAt = Date.now();
    setLastSyncAt(syncedAt);
    setSyncStatus('Successfully synced to database.');
  };

  const saveGuestSession = async (username: string, password: string) => {
    if (!currentUser?.isGuest) return;
    setSyncStatus('Creating account and saving guest session...');
    const payload = await signUp(username, password, syncSettings);
    const mergedSyncSettings = normalizeSyncSettings({ ...syncSettings, enabled: true });
    const savedUser = normalizeUserAccount(payload.user);
    if (!savedUser) throw new Error('The server did not return a valid user.');
    const state: PersistedAppState = {
      ...buildPersistedState(),
      currentUser: savedUser,
      authToken: payload.token,
      syncSettings: mergedSyncSettings,
      userName: savedUser.displayName || savedUser.username,
    };
    setCurrentUser(savedUser);
    setAuthToken(payload.token);
    setUserName(savedUser.displayName || savedUser.username);
    setSyncSettings(mergedSyncSettings);
    await pushRemoteState(state);
    const syncedAt = Date.now();
    setLastSyncAt(syncedAt);
    setSyncStatus('Guest session saved and synced to database.');
  };

  const updateSession = (id: string, updates: Partial<Session> | ((prev: Session) => Partial<Session>)) => {
    setSessions(prev => 
      prev.map(s => {
        if (s.id === id) {
          const newUpdates = typeof updates === 'function' ? updates(s) : updates;
          return { ...s, ...newUpdates, updatedAt: Date.now() };
        }
        return s;
      })
    );
  };

  useEffect(() => {
    localStorage.setItem('language', language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem('authStorageVersion', AUTH_STORAGE_VERSION);
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('authToken', authToken);
  }, [authToken]);

  useEffect(() => {
    localStorage.setItem('syncSettings', JSON.stringify(syncSettings));
  }, [syncSettings]);

  useEffect(() => {
    if (lastSyncAt) {
      localStorage.setItem('lastSyncAt', String(lastSyncAt));
    } else {
      localStorage.removeItem('lastSyncAt');
    }
  }, [lastSyncAt]);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('userName', userName);
  }, [userName]);

  useEffect(() => {
    localStorage.setItem('geminiApiKey', geminiApiKey);
  }, [geminiApiKey]);

  useEffect(() => {
    localStorage.setItem('endpoints', JSON.stringify(endpoints));
  }, [endpoints]);

  useEffect(() => {
    localStorage.setItem('genSettings', JSON.stringify(genSettings));
  }, [genSettings]);

  useEffect(() => {
    localStorage.setItem('voiceSettings', JSON.stringify(voiceSettings));
  }, [voiceSettings]);

  useEffect(() => {
    localStorage.setItem('sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem('currentSessionId', currentSessionId);
  }, [currentSessionId]);

  useEffect(() => {
    localStorage.setItem('selectedModel', selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    localStorage.setItem('memories', JSON.stringify(memories));
  }, [memories]);

  useEffect(() => {
    localStorage.setItem('tokenUsageData', JSON.stringify(tokenUsageData));
  }, [tokenUsageData]);

  useEffect(() => {
    localStorage.setItem('customCounters', JSON.stringify(customCounters));
  }, [customCounters]);

  // Function to add token usage record
  const addTokenUsageRecord = useCallback((record: Omit<TokenUsageRecord, 'timestamp'>) => {
    setTokenUsageData(prev => [
      ...prev,
      { ...record, timestamp: Date.now() }
    ]);
  }, []);

  // Function to reset token usage data
  const resetTokenUsage = useCallback(() => {
    setTokenUsageData([]);
  }, []);

  useEffect(() => {
    if (!hasLoadedSharedState) return;

    const state = buildPersistedState();
    const timer = window.setTimeout(() => {
      savePersistedState(state).catch((error) => {
        console.warn('Unable to save shared state; browser fallback is still updated.', error);
      });
      if (state.currentUser && authToken && syncSettings.enabled) {
        pushRemoteState(state)
          .then(() => {
            setLastSyncAt(Date.now());
            setSyncStatus('Successfully synced to database.');
          })
          .catch((error) => {
            console.warn('Remote sync failed.', error);
            setSyncStatus(error.message || 'Remote sync failed.');
          });
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [
    hasLoadedSharedState,
    currentUser,
    authToken,
    syncSettings,
    language,
    theme,
    selectedModel,
    userName,
    geminiApiKey,
    endpoints,
    genSettings,
    voiceSettings,
    sessions,
    currentSessionId,
    memories,
  ]);

  const fetchModels = useCallback(async () => {
    let allGemini: string[] = [];
    
    // Fetch Gemini Models
    const effectiveGeminiKey = geminiApiKey || process.env.GEMINI_API_KEY;
    if (effectiveGeminiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey: effectiveGeminiKey });
        const response = await ai.models.list();
        for await (const model of response) {
          if (model.name) {
            allGemini.push(model.name.replace('models/', ''));
          }
        }
      } catch (err) {
        console.error('Gemini error:', err);
      }
    }
    
    if (allGemini.length === 0) {
      allGemini = ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'];
    }
    setGeminiModels(allGemini);

    // Fetch Endpoint Models
    const allEndpointModels: {name: string, endpointId: string}[] = [];
    for (const ep of endpoints) {
      if (ep.url && ep.key) {
        // Skip if key is placeholder
        if (ep.key === 'sk-...') continue;

        // If endpoint has predefined models, use those
        if (ep.models && ep.models.length > 0) {
          const predefined = ep.models.map(m => ({
            name: m,
            endpointId: ep.id
          }));
          allEndpointModels.push(...predefined);
          continue;
        }

        // Skip fetching if skipModelFetch is enabled
        if (ep.skipModelFetch) {
          continue;
        }

        try {
          const res = await fetch(`${ep.url}/models`, {
            headers: { 'Authorization': `Bearer ${ep.key}` }
          });
          if (res.ok) {
            const data = await res.json();
            const fetched = (Array.isArray(data.data) ? data.data : []).map((m: any) => ({
              name: m.id,
              endpointId: ep.id
            }));
            allEndpointModels.push(...fetched);
          }
        } catch (err) {
          console.error(`Endpoint ${ep.name} error:`, err);
        }
      }
    }
    setEndpointModels(allEndpointModels);
  }, [endpoints, geminiApiKey]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchModels();
    }, 1000);
    return () => clearTimeout(timer);
  }, [fetchModels]);

  const handleSaveSettings = () => {
    localStorage.setItem('endpoints', JSON.stringify(endpoints));
    localStorage.setItem('genSettings', JSON.stringify(genSettings));
    localStorage.setItem('voiceSettings', JSON.stringify(voiceSettings));
    localStorage.setItem('userName', userName);
    localStorage.setItem('geminiApiKey', geminiApiKey);
    fetchModels();
  };

  useEffect(() => {
    const combined = [
      'gemini-2.5-flash',
      ...geminiModels,
      ...endpointModels.map(m => m.name)
    ];
    // Remove duplicates and maintain order
    setModels(Array.from(new Set(combined)));
  }, [geminiModels, endpointModels]);

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  if (!currentUser) {
    return (
      <Auth
        syncSettings={syncSettings}
        setSyncSettings={setSyncSettings}
        onAuthenticated={handleAuthenticated}
        onGuestMode={handleGuestMode}
      />
    );
  }

  return (
    <div className="app-shell relative flex w-full overflow-hidden bg-background text-on-surface selection:bg-primary/30 selection:text-primary font-body text-sm md:text-xs">
      {/* Ambient Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] orb-1 rounded-full pointer-events-none z-0" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] orb-2 rounded-full pointer-events-none z-0" />

      {/* Sidebar Area */}
      <Sidebar 
        isCollapsed={isSidebarCollapsed} 
        setIsCollapsed={setIsSidebarCollapsed}
        isOpenMobile={isMobileSidebarOpen}
        setIsOpenMobile={setIsMobileSidebarOpen}
        currentView={currentView}
        setCurrentView={setCurrentView}
        sessions={sessions}
        currentSessionId={currentSessionId}
        setCurrentSessionId={setCurrentSessionId}
        createSession={createSession}
        deleteSession={deleteSession}
        pinSession={pinSession}
        renameSession={renameSession}
        clearAll={clearAll}
        userName={userName}
        onSignOut={handleSignOut}
        language={language}
        memories={memories}
        deleteMemory={deleteMemory}
        updateMemory={updateMemory}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full min-h-0 relative z-10 w-full overflow-hidden">
        <Header
          theme={theme}
          toggleTheme={toggleTheme}
          onMenuClick={() => setIsMobileSidebarOpen(true)}
          models={models}
          selectedModel={selectedModel}
          onModelSelect={setSelectedModel}
          language={language}
        />
        {currentView === 'chat' ? (
          <Chat
            selectedModel={selectedModel}
            isThinkingMode={isThinkingMode}
            setIsThinkingMode={setIsThinkingMode}
            isSearchMode={isSearchMode}
            setIsSearchMode={setIsSearchMode}
            session={currentSession}
            updateSession={updateSession}
            endpoints={endpoints}
            endpointModels={endpointModels}
            genSettings={genSettings}
            voiceSettings={voiceSettings}
            geminiApiKey={geminiApiKey}
            language={language}
            memories={memories}
            saveMemory={saveMemory}
            onTokenUpdate={setTokenUsage}
            isSidebarCollapsed={isSidebarCollapsed}
            onAddTokenUsage={addTokenUsageRecord}
          />
        ) : currentView === 'tokenUsage' ? (
          <TokenUsage
            language={language}
            usageData={tokenUsageData}
            onResetUsage={resetTokenUsage}
            customCounters={customCounters}
            setCustomCounters={setCustomCounters}
          />
        ) : (
          <Settings 
            userName={userName}
            setUserName={setUserName}
            geminiApiKey={geminiApiKey}
            setGeminiApiKey={setGeminiApiKey}
            endpoints={endpoints}
            setEndpoints={setEndpoints}
            geminiModels={geminiModels}
            onFetchModels={fetchModels}
            onSave={handleSaveSettings}
            genSettings={genSettings}
            setGenSettings={setGenSettings}
            voiceSettings={voiceSettings}
            setVoiceSettings={setVoiceSettings}
            language={language}
            setLanguage={setLanguage}
            onSignOut={handleSignOut}
            currentUser={currentUser}
            syncSettings={syncSettings}
            setSyncSettings={setSyncSettings}
            syncStatus={syncStatus}
            lastSyncAt={lastSyncAt}
            onSyncNow={syncNow}
            onSaveGuestSession={saveGuestSession}
          />
        )}
      </main>
      
      {/* Mobile Sidebar Overlay */}
      {isMobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40 md:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}
    </div>
  );
}
