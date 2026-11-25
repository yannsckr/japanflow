import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';

export function isOtaSupported(): boolean {
  return (
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === 'android' &&
    Capacitor.isPluginAvailable('CapacitorUpdater')
  );
}

export async function getOtaState() {
  if (!isOtaSupported()) return null;

  const current = await CapacitorUpdater.current();
  const available = await CapacitorUpdater.list();

  return {
    current,
    available,
  };
}

export async function confirmOtaStartup(): Promise<boolean> {
  if (!isOtaSupported()) return false;

  await CapacitorUpdater.notifyAppReady();

  return true;
}
