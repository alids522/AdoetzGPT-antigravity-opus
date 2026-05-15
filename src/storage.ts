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
const LEGACY_APP_STATE_KEY = 'appState';
const LOCAL_TEXT_LIMIT = 12000;
const LOCAL_ATTACHMENT_DATA_LIMIT = 2_000_000;
const STORAGE_ATTEMPTS = [
  { textLimit: LOCAL_TEXT_LIMIT, attachmentDataLimit: LOCAL_ATTACHMENT_DATA_LIMIT },
  { textLimit: LOCAL_TEXT_LIMIT, attachmentDataLimit: 0 },
  { textLimit: 4000, attachmentDataLimit: 0 },
  { textLimit: 1200, attachmentDataLimit: 0 },
];

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
    const saved = localStorage.getItem(APP_STATE_KEY) || localStorage.getItem(LEGACY_APP_STATE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    console.warn('Unable to read local app state fallback.', error);
    return null;
  }
}

function isQuotaExceeded(error: any): boolean {
  return error?.name === 'QuotaExceededError' || error?.code === 22 || error?.code === 1014;
}

function compactText(text: string, limit: number): string {
  if (!text || text.length <= limit) return text;
  return `${text.slice(0, Math.floor(limit * 0.65))}\n\n[Earlier saved content compacted]\n\n${text.slice(-Math.floor(limit * 0.35))}`;
}

function compactMessage(message: Session['messages'][number], textLimit: number, attachmentDataLimit: number) {
  return {
    ...message,
    text: compactText(message.text, textLimit),
    attachments: message.attachments?.map((attachment) => {
      const keepData = attachmentDataLimit > 0 && attachment.data.length <= attachmentDataLimit;
      return {
        ...attachment,
        data: keepData ? attachment.data : '',
        url: undefined,
      };
    }),
  };
}

function compactStateForStorage(state: PersistedAppState, textLimit = LOCAL_TEXT_LIMIT, attachmentDataLimit = LOCAL_ATTACHMENT_DATA_LIMIT): PersistedAppState {
  return {
    ...state,
    sessions: state.sessions.map((session) => ({
      ...session,
      messages: session.messages.map((message) => compactMessage(message, textLimit, attachmentDataLimit)),
    })),
    tokenUsageData: state.tokenUsageData.slice(-500),
  };
}

function saveStateJson(json: string): void {
  localStorage.removeItem(LEGACY_APP_STATE_KEY);
  localStorage.setItem(APP_STATE_KEY, json);
}

function saveLocalState(state: PersistedAppState): void {
  let lastError: unknown;

  for (const attempt of STORAGE_ATTEMPTS) {
    try {
      saveStateJson(JSON.stringify(compactStateForStorage(state, attempt.textLimit, attempt.attachmentDataLimit)));
      return;
    } catch (error: any) {
      if (!isQuotaExceeded(error)) throw error;
      lastError = error;
    }
  }

  try {
    saveStateJson(JSON.stringify({
      ...state,
      sessions: state.sessions.map((session) => ({
        id: session.id,
        title: session.title,
        updatedAt: session.updatedAt,
        pinned: session.pinned,
        deleted: session.deleted,
        messages: [],
      })),
      memories: [],
      tokenUsageData: [],
      customCounters: [],
      savedAt: state.savedAt,
    }));
  } catch (error) {
    console.warn('[Storage] Local storage is full; saved only current session pointer.', error || lastError);
    try {
      localStorage.setItem('adoetzgpt.currentSession', state.currentSessionId);
    } catch {
      // Nothing else can be persisted in this browser quota.
    }
  }
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
    let lastError: unknown;
    for (const attempt of STORAGE_ATTEMPTS) {
      try {
        await Preferences.set({
          key: APP_STATE_KEY,
          value: JSON.stringify(compactStateForStorage(payload, attempt.textLimit, attempt.attachmentDataLimit)),
        });
        return;
      } catch (error) {
        lastError = error;
      }
    }
    console.warn('[Storage] Native preferences rejected compact app state.', lastError);
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

  const syncToDb = async (dbConfigPayload: any) => {
    if (shouldUseNativePostgres(state.syncSettings.apiBaseUrl)) {
      await NativePostgresSync.pushState({
        token: state.authToken,
        dbConfig: dbConfigPayload,
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
      body: JSON.stringify({ state: remoteState, dbConfig: dbConfigPayload }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Unable to sync state.');
  };

  // 1. Sync to primary database
  await syncToDb(databasePayload(state.syncSettings));

  // 2. Sync to backup databases
  if (state.syncSettings.autoSyncBackups && state.syncSettings.backupDatabases) {
    for (const backupDb of state.syncSettings.backupDatabases) {
      if (!backupDb.databaseUrl || !backupDb.database) continue;
      try {
        await syncToDb({
          databaseUrl: backupDb.databaseUrl.trim(),
          database: backupDb.database.trim(),
          schemaName: backupDb.schemaName?.trim() || 'adoetzgpt',
          user: backupDb.user.trim(),
          password: backupDb.password || '',
          port: backupDb.port?.trim() || '',
        });
      } catch (err) {
        console.warn('Failed to sync to backup database', backupDb.databaseUrl, err);
      }
    }
  }
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
