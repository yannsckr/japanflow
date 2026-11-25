import { describe, expect, it } from 'vitest';
import {
  canApplyOta,
  canApplyOtaPilot,
  canDownloadOta,
  isIdleAtStore,
  isEligibleForOta,
  type OtaOperationalState,
} from '../otaPolicy';
import type { SignedOtaRelease } from '../otaSecurity';

const safe: OtaOperationalState = {
  serverConfirmed: true,
  internetConnected: true,
  journeyKnown: true,
  journeyOpen: false,
  openRides: 0,
  pendingWrites: 0,
  pendingGpsRecords: 0,
  operationBusy: false,
  foreground: true,
  locationKnown: true,
  locationAgeMs: 1000,
  distanceFromStoreMeters: 20,
  gpsAccuracyMeters: 10,
  speedKmh: 0,
  idleSeconds: 120,
};

const idleAtStore: OtaOperationalState = {
  ...safe,
  journeyOpen: true,
};

const release: SignedOtaRelease = {
  manifest: {
    schemaVersion: 1,
    bundleVersion: '48.0.1',
    platform: 'android',
    title: 'JapanFlow OTA',
    notes: 'Test release',
    channel: 'stable',
    status: 'published',
    minNativeCode: 18,
    maxNativeCode: 18,
    sha256: 'a'.repeat(64),
    sizeBytes: 100,
    storagePath: 'japanflow/ota/ti-user/00000000-0000-4000-8000-000000000001.zip',
  },
  downloadUrl: '',
  signature: '',
  sequence: 2,
  expiresAt: Date.now() + 600000,
  targetUserIds: [],
};

const device = {
  userId: 'motoboy-test',
  nativeCode: 18,
  lastAcceptedSequence: 1,
};

describe('JapanFlow OTA operational safety', () => {
  it('allows updates after the journey ends', () => {
    expect(canApplyOta(safe)).toBe(true);
  });

  it.each([
    { serverConfirmed: false },
    { internetConnected: false },
    { journeyKnown: false },
    { openRides: 1 },
    { pendingWrites: 1 },
    { pendingGpsRecords: 1 },
    { operationBusy: true },
    { foreground: false },
  ])('blocks unsafe operational state %j', (override) => {
    expect(
      canApplyOta({
        ...safe,
        ...override,
      })
    ).toBe(false);
  });
});

describe('JapanFlow OTA idle at store', () => {
  it('allows the exact geofence boundary', () => {
    expect(
      canApplyOta({
        ...idleAtStore,
        distanceFromStoreMeters: 90,
        gpsAccuracyMeters: 10,
      })
    ).toBe(true);
  });

  it('detects a stationary motoboy at the store', () => {
    expect(isIdleAtStore(idleAtStore)).toBe(true);
  });

  it('allows updates during an open idle journey', () => {
    expect(canApplyOta(idleAtStore)).toBe(true);
  });

  it('allows automatic downloads at the store', () => {
    expect(canDownloadOta(idleAtStore)).toBe(true);
  });

  it.each([
    { locationKnown: false },
    { distanceFromStoreMeters: 150 },
    { speedKmh: 20 },
    { idleSeconds: 10 },
    { gpsAccuracyMeters: 100 },
    { locationAgeMs: 60000 },
    { speedKmh: -1 },
    { distanceFromStoreMeters: NaN },
    { distanceFromStoreMeters: 91 },
    { locationAgeMs: -1 },
    { gpsAccuracyMeters: 0 },
  ])('blocks unsafe location state %j', (override) => {
    expect(
      canApplyOta({
        ...idleAtStore,
        ...override,
      })
    ).toBe(false);
  });

  it.each([
    { openRides: 1 },
    { pendingWrites: 1 },
    { pendingGpsRecords: 1 },
    { internetConnected: false },
    { operationBusy: true },
  ])('blocks store updates during operations %j', (override) => {
    const state = {
      ...idleAtStore,
      ...override,
    };

    expect(canApplyOta(state)).toBe(false);
    expect(canDownloadOta(state)).toBe(false);
  });

  it('allows updates outside the store after journey ends', () => {
    expect(
      canApplyOta({
        ...safe,
        journeyOpen: false,
        locationKnown: false,
      })
    ).toBe(true);
  });
});

describe('JapanFlow OTA eligibility', () => {
  it('accepts compatible stable releases', () => {
    expect(isEligibleForOta(release, device)).toBe(true);
  });

  it('blocks previous native versions', () => {
    expect(
      isEligibleForOta(release, {
        ...device,
        nativeCode: 17,
      })
    ).toBe(false);
  });

  it('blocks unsupported future native versions', () => {
    expect(
      isEligibleForOta(release, {
        ...device,
        nativeCode: 19,
      })
    ).toBe(false);
  });

  it('blocks replayed sequences', () => {
    expect(
      isEligibleForOta(release, {
        ...device,
        lastAcceptedSequence: 2,
      })
    ).toBe(false);
  });

  it('blocks expired releases', () => {
    expect(
      isEligibleForOta(
        {
          ...release,
          expiresAt: 1,
        },
        device
      )
    ).toBe(false);
  });

  it('blocks draft releases', () => {
    expect(
      isEligibleForOta(
        {
          ...release,
          manifest: {
            ...release.manifest,
            status: 'draft',
          },
        },
        device
      )
    ).toBe(false);
  });

  it('blocks revoked releases', () => {
    expect(
      isEligibleForOta(
        {
          ...release,
          manifest: {
            ...release.manifest,
            status: 'revoked',
          },
        },
        device
      )
    ).toBe(false);
  });

  it('blocks unselected beta users', () => {
    expect(
      isEligibleForOta(
        {
          ...release,
          manifest: {
            ...release.manifest,
            channel: 'beta',
          },
          targetUserIds: ['other-user'],
        },
        device
      )
    ).toBe(false);
  });

  it('accepts selected beta users', () => {
    expect(
      isEligibleForOta(
        {
          ...release,
          manifest: {
            ...release.manifest,
            channel: 'beta',
          },
          targetUserIds: [device.userId],
        },
        device
      )
    ).toBe(true);
  });

  it('blocks unselected stable users', () => {
    expect(
      isEligibleForOta(
        {
          ...release,
          targetUserIds: ['other-user'],
        },
        device
      )
    ).toBe(false);
  });

  it('rejects negative accepted sequences', () => {
    expect(
      isEligibleForOta(release, {
        ...device,
        lastAcceptedSequence: -1,
      })
    ).toBe(false);
  });

  it('rejects unidentified users', () => {
    expect(
      isEligibleForOta(release, {
        ...device,
        userId: '',
      })
    ).toBe(false);
  });
});

it('pilot only allows closed journeys', () => {
  expect(canApplyOtaPilot(safe)).toBe(true);
  expect(canApplyOtaPilot(idleAtStore)).toBe(false);
  expect(canApplyOtaPilot({ ...safe, pendingWrites: 1 })).toBe(false);
});
