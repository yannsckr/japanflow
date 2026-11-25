import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../otaSecurity', () => ({
  verifySignedRelease: vi.fn(),
}));

import { verifySignedRelease } from '../otaSecurity';
import type { SignedOtaRelease } from '../otaSecurity';

import {
  compareBundleVersions,
  isReleaseCandidate,
  selectOtaRelease,
  type OtaDeviceContext,
} from '../otaReleaseSelector';

const device: OtaDeviceContext = {
  userId: 'motoboy-test',
  nativeCode: 18,
  currentBundleVersion: '48.0.1',
  lastAcceptedSequence: 1,
  failedSequences: [],
};

function release(sequence = 2, version = '48.0.2'): SignedOtaRelease {
  return {
    manifest: {
      schemaVersion: 1,
      bundleVersion: version,
      platform: 'android',
      title: 'OTA test',
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
    signature: 'test',
    sequence,
    expiresAt: Date.now() + 600000,
    targetUserIds: [],
  };
}

describe('JapanFlow OTA release selection', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(verifySignedRelease).mockResolvedValue(true);
  });

  it('compares numeric versions correctly', () => {
    expect(compareBundleVersions('48.0.10', '48.0.9')).toBe(1);
  });

  it('detects older versions', () => {
    expect(compareBundleVersions('48.0.1', '48.0.2')).toBe(-1);
  });

  it('detects equal versions', () => {
    expect(compareBundleVersions('48.0.1', '48.0.1')).toBe(0);
  });

  it('rejects invalid version formats', () => {
    expect(() => compareBundleVersions('latest', '48.0.1')).toThrow();
  });

  it('accepts a new eligible release', () => {
    expect(isReleaseCandidate(release(), device)).toBe(true);
  });

  it('rejects older bundle versions', () => {
    expect(isReleaseCandidate(release(2, '47.0.1'), device)).toBe(false);
  });

  it('rejects the currently installed version', () => {
    expect(isReleaseCandidate(release(2, '48.0.1'), device)).toBe(false);
  });

  it('rejects previously failed sequences', () => {
    expect(
      isReleaseCandidate(release(), {
        ...device,
        failedSequences: [2],
      })
    ).toBe(false);
  });

  it('rejects invalid signatures', async () => {
    vi.mocked(verifySignedRelease).mockResolvedValue(false);

    expect(await selectOtaRelease([release()], device)).toBeNull();
  });

  it('selects the latest eligible sequence', async () => {
    const result = await selectOtaRelease(
      [release(2, '48.0.2'), release(4, '48.0.4'), release(3, '48.0.3')],
      device
    );

    expect(result?.sequence).toBe(4);
  });

  it('skips invalid signatures', async () => {
    vi.mocked(verifySignedRelease).mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const result = await selectOtaRelease([release(2, '48.0.2'), release(3, '48.0.3')], device);

    expect(result?.sequence).toBe(2);
  });

  it('returns null without eligible releases', async () => {
    expect(await selectOtaRelease([], device)).toBeNull();
  });
});
