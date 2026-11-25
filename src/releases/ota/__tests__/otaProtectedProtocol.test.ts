import { describe, expect, it } from 'vitest';

import {
  isValidProtectedMetadata,
  protectedPayload,
  type ProtectedBundleMetadata,
} from '../otaProtectedProtocol';

const valid: ProtectedBundleMetadata = {
  format: 'capgo-rsa-aes-v1',
  checksum: 'a'.repeat(512),
  sessionKey: btoa('a'.repeat(16)) + ':' + btoa('b'.repeat(256)),
  encryptedSha256: 'b'.repeat(64),
  encryptedSizeBytes: 4096,
};

describe('JapanFlow protected OTA protocol', () => {
  it('accepts valid protected metadata', () => {
    expect(isValidProtectedMetadata(valid)).toBe(true);
  });

  it('rejects a plaintext SHA256 checksum', () => {
    expect(
      isValidProtectedMetadata({
        ...valid,
        checksum: 'a'.repeat(64),
      })
    ).toBe(false);
  });

  it('rejects malformed session keys', () => {
    expect(
      isValidProtectedMetadata({
        ...valid,
        sessionKey: 'invalid',
      })
    ).toBe(false);
  });

  it('requires a 16-byte IV', () => {
    expect(
      isValidProtectedMetadata({
        ...valid,
        sessionKey: btoa('a'.repeat(15)) + ':' + btoa('b'.repeat(256)),
      })
    ).toBe(false);
  });

  it('requires a 256-byte RSA session', () => {
    expect(
      isValidProtectedMetadata({
        ...valid,
        sessionKey: btoa('a'.repeat(16)) + ':' + btoa('b'.repeat(255)),
      })
    ).toBe(false);
  });

  it('rejects invalid encrypted hashes', () => {
    expect(
      isValidProtectedMetadata({
        ...valid,
        encryptedSha256: 'invalid',
      })
    ).toBe(false);
  });

  it('requires AES block alignment', () => {
    expect(
      isValidProtectedMetadata({
        ...valid,
        encryptedSizeBytes: 4097,
      })
    ).toBe(false);
  });

  it('rejects oversized packages', () => {
    expect(
      isValidProtectedMetadata({
        ...valid,
        encryptedSizeBytes: 104857632,
      })
    ).toBe(false);
  });

  it('rejects unsupported encryption formats', () => {
    expect(
      isValidProtectedMetadata({
        ...valid,
        format: 'unknown',
      })
    ).toBe(false);
  });

  it('serializes every authenticated field', () => {
    expect(protectedPayload(valid)).toEqual([
      valid.format,
      valid.checksum,
      valid.sessionKey,
      valid.encryptedSha256,
      valid.encryptedSizeBytes,
    ]);
  });

  it('refuses invalid canonical metadata', () => {
    expect(() =>
      protectedPayload({
        ...valid,
        checksum: '',
      })
    ).toThrow();
  });
});
