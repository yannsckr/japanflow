import { useEffect } from 'react';
import { nativeUpdater } from '../nativeUpdater';
import { getOtaState, isOtaSupported } from './otaEngine';
import { otaDevices } from './otaDevicesApi';

export function useOtaDeviceReport(userId?: string) {
  useEffect(() => {
    if (!userId || !isOtaSupported()) return;
    let disposed = false;
    let busy = false;
    const report = async () => {
      if (disposed || busy || !navigator.onLine || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        const [native, state] = await Promise.all([nativeUpdater.getVersion(), getOtaState()]);
        if (disposed || !state || native.versionCode < 20 || native.signingChannel !== 'release')
          return;
        const key = 'japanflow:ota:installation:v1';
        let installationId = localStorage.getItem(key);
        if (!installationId || !/^[a-f0-9-]{36}$/.test(installationId)) {
          installationId = crypto.randomUUID();
          localStorage.setItem(key, installationId);
        }
        await otaDevices({
          action: 'report',
          userId,
          installationId,
          nativeVersion: native.version,
          nativeCode: native.versionCode,
          bundleVersion:
            state.current.bundle.id === 'builtin' ? 'builtin' : state.current.bundle.version,
        });
      } catch {
        /* telemetry must never block deliveries */
      } finally {
        busy = false;
      }
    };
    const timer = window.setInterval(() => void report(), 300000);
    const wake = () => void report();
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', wake);
    void report();
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener('online', wake);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [userId]);
}
