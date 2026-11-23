import { Capacitor, registerPlugin } from '@capacitor/core';
import { getFunctions, httpsCallable } from 'firebase/functions';
import app from '@/lib/firebase';

interface TransportPlugin {
  start(options: { customToken: string; userId: string; journeyId: string }): Promise<void>;
  stop(): Promise<void>;
}
const transport = registerPlugin<TransportPlugin>('JapanFlowNativeGps');
const issueSession = httpsCallable<
  Record<string, never>,
  { customToken: string; userId: string; journeyId: string; day: string }
>(getFunctions(app, 'southamerica-east1'), 'motoboyNativeSession');

let activeUser: string | null = null;
let starting: Promise<void> | null = null;

export const hasNativeGpsTransport = () =>
  Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('JapanFlowNativeGps');

export async function startNativeGpsTransport(userId: string): Promise<void> {
  if (!hasNativeGpsTransport() || !navigator.onLine) return;
  if (activeUser === userId) return;
  if (starting) return starting;
  starting = (async () => {
    if (activeUser && activeUser !== userId) await transport.stop();
    activeUser = null;
    const response = await issueSession({});
    if (response.data.userId !== userId || !response.data.customToken) {
      throw new Error('A sessão nativa não corresponde ao usuário logado.');
    }
    await transport.start({
      customToken: response.data.customToken,
      userId: response.data.userId,
      journeyId: response.data.journeyId,
    });
    activeUser = userId;
  })();
  try {
    await starting;
  } finally {
    starting = null;
  }
}

export async function stopNativeGpsTransport(): Promise<void> {
  // Stop is safe even if this WebView did not start the service (e.g. after restart).
  if (!hasNativeGpsTransport()) return;
  if (starting) await starting.catch(() => undefined);
  activeUser = null;
  await transport.stop();
}
