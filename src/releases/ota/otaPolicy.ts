import { isNativeCompatible } from './otaManifest';
import type { SignedOtaRelease } from './otaSecurity';

export const OTA_POLICY = {
  storeRadiusMeters: 100,
  maxIdleSpeedKmh: 2,
  minIdleSeconds: 60,
  checkIntervalMs: 5 * 60 * 1000,
  maxGpsAccuracyMeters: 50,
  maxLocationAgeMs: 30 * 1000,
} as const;

export interface OtaOperationalState {
  serverConfirmed: boolean;
  internetConnected: boolean;
  journeyKnown: boolean;
  journeyOpen: boolean;
  openRides: number;
  pendingWrites: number;
  pendingGpsRecords: number;
  operationBusy: boolean;
  foreground: boolean;

  locationKnown: boolean;
  locationAgeMs: number;
  distanceFromStoreMeters: number;
  gpsAccuracyMeters: number;
  speedKmh: number;
  idleSeconds: number;
}

export function isIdleAtStore(state: OtaOperationalState): boolean {
  return (
    state.locationKnown === true &&
    Number.isFinite(state.locationAgeMs) &&
    state.locationAgeMs >= 0 &&
    state.locationAgeMs <= OTA_POLICY.maxLocationAgeMs &&
    Number.isFinite(state.distanceFromStoreMeters) &&
    state.distanceFromStoreMeters >= 0 &&
    Number.isFinite(state.gpsAccuracyMeters) &&
    state.gpsAccuracyMeters > 0 &&
    state.gpsAccuracyMeters <= OTA_POLICY.maxGpsAccuracyMeters &&
    state.distanceFromStoreMeters + state.gpsAccuracyMeters <= OTA_POLICY.storeRadiusMeters &&
    Number.isFinite(state.speedKmh) &&
    state.speedKmh >= 0 &&
    state.speedKmh <= OTA_POLICY.maxIdleSpeedKmh &&
    Number.isFinite(state.idleSeconds) &&
    state.idleSeconds >= OTA_POLICY.minIdleSeconds
  );
}

export function canApplyOta(state: OtaOperationalState): boolean {
  const baseSafe =
    state.internetConnected === true &&
    state.serverConfirmed === true &&
    state.journeyKnown === true &&
    state.openRides === 0 &&
    state.pendingWrites === 0 &&
    state.pendingGpsRecords === 0 &&
    state.operationBusy === false &&
    state.foreground === true;

  if (!baseSafe) return false;

  if (state.journeyOpen === false) {
    return true;
  }

  if (state.journeyOpen === true) {
    return isIdleAtStore(state);
  }

  return false;
}

export function canDownloadOta(state: OtaOperationalState): boolean {
  return canApplyOta(state);
}

export function isEligibleForOta(
  release: SignedOtaRelease,
  device: {
    userId: string;
    nativeCode: number;
    lastAcceptedSequence: number;
  }
): boolean {
  if (
    !device.userId ||
    release.manifest.status !== 'published' ||
    !Number.isSafeInteger(release.expiresAt) ||
    release.expiresAt <= Date.now() ||
    !Number.isSafeInteger(device.lastAcceptedSequence) ||
    device.lastAcceptedSequence < 0 ||
    !Number.isSafeInteger(release.sequence) ||
    release.sequence <= device.lastAcceptedSequence ||
    !isNativeCompatible(device.nativeCode, release.manifest)
  )
    return false;

  if (release.manifest.channel === 'beta') {
    return release.targetUserIds.includes(device.userId);
  }

  return (
    release.manifest.channel === 'stable' &&
    (release.targetUserIds.length === 0 || release.targetUserIds.includes(device.userId))
  );
}

// V48.1 pilot only: do not interrupt an open journey, even at the store.
export function canApplyOtaPilot(state: OtaOperationalState): boolean {
  return state.journeyOpen === false && canApplyOta(state);
}
