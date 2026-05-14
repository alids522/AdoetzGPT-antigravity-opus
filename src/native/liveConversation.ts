import { Capacitor, registerPlugin } from '@capacitor/core';

interface LiveConversationServicePlugin {
  start(): Promise<{ active: boolean }>;
  stop(): Promise<{ active: boolean }>;
  status(): Promise<{ active: boolean }>;
}

const LiveConversationService = registerPlugin<LiveConversationServicePlugin>('LiveConversationService');

export async function startNativeLiveConversationService() {
  if (!Capacitor.isNativePlatform()) return;
  await LiveConversationService.start();
}

export async function stopNativeLiveConversationService() {
  if (!Capacitor.isNativePlatform()) return;
  await LiveConversationService.stop();
}
