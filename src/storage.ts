import type { Endpoint, GenerationSettings, Memory, Session, SyncSettings, UserAccount, VoiceSettings, TokenUsageRecord, CustomCounter } from './App';
import type { Language } from './translations';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import NativePostgresSync, { shouldUseNativePostgres } from './native/postgresSync';

export interface PersistedAppState {
  currentUser: UserAccount | null;
  authToken: string;
  syncSettings: SyncSettings;
  language: Language;
  theme: 'light' | 'dark';
  selectedModel: string;
  userName: string;
  geminiApiKey: string;
  endpoints: Endpoint[];
  genSettings: GenerationSettings;
  voiceSettings: VoiceSettings;
  sessions: Session[];
  currentSessionId: string;
  memories: Memory[];
  tokenUsageData: TokenUsageRecord[];
  customCounters: CustomCounter[];
  savedAt?: number;
}

const APP_STATE_KEY = 'adoetzgpt.appState';

function apiUrl(syncSettings?: SyncSettings, path = '') {
  const base = syncSettings?.apiBaseUrl?.trim().replace(/\/$/, '') || '';
  return `${base}${path}`;
}

async function readJsonResponse(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text().catch(() => '');
    throw new Error(text.includes('<!doctype') || text.includes('<html')
      ? 'Sync API URL is pointing to the web app instead of the API server. Use the server URL that exposes /api/auth/signup.'
      : 'Sync API did not return JSON.');
  }

  return response.json().catch(() => ({}));
}

function databasePayload(syncSettings: SyncSettings) {
  return {
    databaseUrl: syncSettings.database.databaseUrl.trim(),
    database: syncSettings.database.database.trim(),
    schemaName: syncSettings.database.schemaName.trim() || 'adoetzgpt',
    user: syncSettings.database.user.trim(),
    password: syncSettings.database.password,
    port: syncSettings.database.port.trim(),
  };
}

function loadLocalState(): PersistedAppState | null {
  try {
    const saved = localStorage.getItem(APP_STATE_KEY) || localStorage.getItem('appState');
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    console.warn('Unable to read local app state fallback.', error);
    return null;
  }
}

function saveLocalState(state: PersistedAppState): void {
  localStorage.setItem(APP_STATE_KEY, JSON.stringify(state));
}

export async function loadPersistedState(): Promise<PersistedAppState | null> {
  if (Capacitor.isNativePlatform()) {
    const { value } = await Preferences.get({ key: APP_STATE_KEY });
    return value ? JSON.parse(value) : null;
  }

  return loadLocalState();
}

export async function savePersistedState(state: PersistedAppState): Promise<void> {
  const payload = {
    ...state,
    savedAt: Date.now(),
  };

  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: APP_STATE_KEY, value: JSON.stringify(payload) });
    return;
  }

  saveLocalState(payload);
}

export async function signUp(username: string, password: string, syncSettings: SyncSettings) {
  if (shouldUseNativePostgres(syncSettings.apiBaseUrl)) {
    return NativePostgresSync.signUp({ username, password, dbConfig: databasePayload(syncSettings) });
  }

  const response = await fetch(apiUrl(syncSettings, '/api/auth/signup'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password, dbConfig: databasePayload(syncSettings) }),
  });

  const data = await readJsonResponse(response);
  if (!response.ok) throw new Error(data.error || 'Unable to sign up.');
  if (!data.user || !data.token) throw new Error('Sign up did not return a valid session. Check that Sync API URL points to the AdoetzGPT server, not directly to Postgres or the Android app.');
  return data as { user: UserAccount; token: string };
}

export async function login(username: string, password: string, syncSettings: SyncSettings) {
  if (shouldUseNativePostgres(syncSettings.apiBaseUrl)) {
    return NativePostgresSync.login({ username, password, dbConfig: databasePayload(syncSettings) });
  }

  const response = await fetch(apiUrl(syncSettings, '/api/auth/login'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password, dbConfig: databasePayload(syncSettings) }),
  });

  const data = await readJsonResponse(response);
  if (!response.ok) throw new Error(data.error || 'Unable to log in.');
  if (!data.user || !data.token) throw new Error('Login did not return a valid session. Check that Sync API URL points to the AdoetzGPT server, not directly to Postgres or the Android app.');
  return data as { user: UserAccount; token: string; state?: PersistedAppState | null };
}

export async function pushRemoteState(state: PersistedAppState): Promise<void> {
  if (!state.currentUser || !state.authToken || !state.syncSettings.enabled) return;
  const remoteState = {
    ...state,
    authToken: '',
    syncSettings: {
      ...state.syncSettings,
      database: {
        ...state.syncSettings.database,
        password: '',
      },
    },
  };

  if (shouldUseNativePostgres(state.syncSettings.apiBaseUrl)) {
    await NativePostgresSync.pushState({
      token: state.authToken,
      dbConfig: databasePayload(state.syncSettings),
      state: remoteState,
    });
    return;
  }

  const response = await fetch(apiUrl(state.syncSettings, '/api/sync/state'), {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${state.authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ state: remoteState, dbConfig: databasePayload(state.syncSettings) }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to sync state.');
}

export async function pullRemoteState(authToken: string, syncSettings: SyncSettings): Promise<PersistedAppState | null> {
  if (!authToken || !syncSettings.enabled) return null;

  if (shouldUseNativePostgres(syncSettings.apiBaseUrl)) {
    const data = await NativePostgresSync.pullState({ token: authToken, dbConfig: databasePayload(syncSettings) });
    return data.state || null;
  }

  const response = await fetch(apiUrl(syncSettings, '/api/sync/state/pull'), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ dbConfig: databasePayload(syncSettings) }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to pull remote state.');
  return data.state || null;
}
