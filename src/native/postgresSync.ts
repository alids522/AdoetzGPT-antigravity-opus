import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PersistedAppState } from '../storage';
import type { DatabaseSettings, UserAccount } from '../App';

export interface NativePostgresAuthResult {
  user: UserAccount;
  token: string;
  state?: PersistedAppState | null;
}

interface NativePostgresSyncPlugin {
  signUp(options: { username: string; password: string; dbConfig: DatabaseSettings }): Promise<NativePostgresAuthResult>;
  login(options: { username: string; password: string; dbConfig: DatabaseSettings }): Promise<NativePostgresAuthResult>;
  pushState(options: { token: string; dbConfig: DatabaseSettings; state: PersistedAppState }): Promise<{ ok: boolean }>;
  pullState(options: { token: string; dbConfig: DatabaseSettings }): Promise<{ state?: PersistedAppState | null }>;
}

const NativePostgresSync = registerPlugin<NativePostgresSyncPlugin>('NativePostgresSync');

export function shouldUseNativePostgres(syncApiUrl?: string) {
  return Capacitor.isNativePlatform() && !syncApiUrl?.trim();
}

export default NativePostgresSync;
