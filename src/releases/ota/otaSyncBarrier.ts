import { Capacitor, registerPlugin } from '@capacitor/core';
import { waitForPendingWrites } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { inspectGpsQueue } from '@/lib/motoboyGpsQueue';
import { getOperationalLockState } from '@/lib/operationalLock';

interface NativeGpsReadiness {
  checkUpdateReadiness(): Promise<{
    confirmed: boolean;
    reason: string;
  }>;
}

const nativeGps = registerPlugin<NativeGpsReadiness>('JapanFlowNativeGps');

export interface SyncBarrierResult {
  confirmed: boolean;
  reason: string;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Synchronization timeout')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function confirmOtaSynchronization(userId: string): Promise<SyncBarrierResult> {
  if (!userId || !navigator.onLine) {
    return { confirmed: false, reason: 'offline' };
  }

  if (
    !Capacitor.isNativePlatform() ||
    Capacitor.getPlatform() !== 'android' ||
    !Capacitor.isPluginAvailable('JapanFlowNativeGps')
  ) {
    return {
      confirmed: false,
      reason: 'native-plugin-unavailable',
    };
  }

  if (inspectGpsQueue(userId) !== 0) {
    return {
      confirmed: false,
      reason: 'local-gps-pending',
    };
  }

  if (getOperationalLockState().activeOperations !== 0) {
    return {
      confirmed: false,
      reason: 'operation-active',
    };
  }

  try {
    await withTimeout(waitForPendingWrites(db), 5000);

    const native = await withTimeout(nativeGps.checkUpdateReadiness(), 7000);

    if (native.confirmed !== true) {
      return {
        confirmed: false,
        reason: native.reason || 'native-sync-unknown',
      };
    }

    if (!navigator.onLine) {
      return { confirmed: false, reason: 'offline' };
    }

    if (inspectGpsQueue(userId) !== 0) {
      return {
        confirmed: false,
        reason: 'new-gps-pending',
      };
    }

    if (getOperationalLockState().activeOperations !== 0) {
      return {
        confirmed: false,
        reason: 'new-operation-active',
      };
    }

    return {
      confirmed: true,
      reason: 'synchronized',
    };
  } catch {
    return {
      confirmed: false,
      reason: 'synchronization-failed',
    };
  }
}
