import { describe, expect, it } from 'vitest';

import {
  isNativeCompatible,
  isValidOtaManifest,
  OTA_MAX_BYTES,
  type OtaManifest,
} from '../otaManifest';

const manifest: OtaManifest = {
  schemaVersion: 1,
  bundleVersion: '48.0.1',
  platform: 'android',
  title: 'JapanFlow OTA',
  notes: 'Test bundle',
  channel: 'beta',
  status: 'draft',
  minNativeCode: 18,
  maxNativeCode: 18,
  sha256: 'a'.repeat(64),
  sizeBytes: 1024,
  storagePath: 'japanflow/ota/test-user/00000000-0000-4000-8000-000000000000.zip',
};

describe('JapanFlow OTA manifest', () => {
  it('accepts a valid manifest', () => {
    expect(isValidOtaManifest(manifest)).toBe(true);
  });

  it('rejects invalid bundle versions', () => {
    expect(
      isValidOtaManifest({
        ...manifest,
        bundleVersion: 'invalid',
      })
    ).toBe(false);
  });

  it('rejects malformed checksums', () => {
    expect(
      isValidOtaManifest({
        ...manifest,
        sha256: '123',
      })
    ).toBe(false);
  });

  it('rejects oversized bundles', () => {
    expect(
      isValidOtaManifest({
        ...manifest,
        sizeBytes: OTA_MAX_BYTES + 1,
      })
    ).toBe(false);
  });

  it('rejects empty bundles', () => {
    expect(
      isValidOtaManifest({
        ...manifest,
        sizeBytes: 0,
      })
    ).toBe(false);
  });

  it('rejects incompatible native versions', () => {
    expect(isNativeCompatible(17, manifest)).toBe(false);
    expect(isNativeCompatible(18, manifest)).toBe(true);
    expect(isNativeCompatible(19, manifest)).toBe(false);
  });

  it('rejects inverted compatibility ranges', () => {
    expect(
      isValidOtaManifest({
        ...manifest,
        minNativeCode: 20,
        maxNativeCode: 18,
      })
    ).toBe(false);
  });

  it('rejects APK storage paths', () => {
    expect(
      isValidOtaManifest({
        ...manifest,
        storagePath: 'japanflow/releases/user/test.apk',
      })
    ).toBe(false);
  });

  it('rejects path traversal', () => {
    expect(
      isValidOtaManifest({
        ...manifest,
        storagePath: 'japanflow/ota/../bundle.zip',
      })
    ).toBe(false);
  });
});
