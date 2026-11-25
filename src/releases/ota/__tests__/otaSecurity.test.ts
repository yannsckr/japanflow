// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';

import { canonicalPayload, verifySignedRelease, type SignedOtaRelease } from '../otaSecurity';

const keys = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
});

const publicKey = keys.publicKey
  .export({
    type: 'spki',
    format: 'der',
  })
  .toString('base64');

function signedRelease(): SignedOtaRelease {
  const storagePath = 'japanflow/ota/ti-user/00000000-0000-4000-8000-000000000001.zip';

  const release: SignedOtaRelease = {
    manifest: {
      schemaVersion: 1,
      bundleVersion: '48.0.1',
      platform: 'android',
      title: 'OTA Security',
      notes: 'Test release',
      channel: 'beta',
      status: 'published',
      minNativeCode: 18,
      maxNativeCode: 18,
      sha256: 'a'.repeat(64),
      sizeBytes: 100,
      storagePath,
    },
    sequence: 2,
    expiresAt: Date.now() + 60000,
    targetUserIds: ['test-user'],
    downloadUrl:
      'https://firebasestorage.googleapis.com/v0/b/' +
      'japanflow-erp.firebasestorage.app/o/' +
      encodeURIComponent(storagePath) +
      '?alt=media',
    signature: '',
  };

  release.signature = sign('sha256', Buffer.from(canonicalPayload(release)), {
    key: keys.privateKey,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64');

  return release;
}

describe('JapanFlow OTA signatures', () => {
  it('accepts valid signatures', async () => {
    expect(await verifySignedRelease(signedRelease(), publicKey)).toBe(true);
  });

  it('rejects an altered checksum', async () => {
    const release = signedRelease();
    release.manifest.sha256 = 'b'.repeat(64);
    expect(await verifySignedRelease(release, publicKey)).toBe(false);
  });

  it('rejects an altered audience', async () => {
    const release = signedRelease();
    release.targetUserIds = ['unauthorized-user'];
    expect(await verifySignedRelease(release, publicKey)).toBe(false);
  });

  it('rejects an altered URL', async () => {
    const release = signedRelease();
    release.downloadUrl += '&token=changed';
    expect(await verifySignedRelease(release, publicKey)).toBe(false);
  });

  it('rejects an altered sequence', async () => {
    const release = signedRelease();
    release.sequence++;
    expect(await verifySignedRelease(release, publicKey)).toBe(false);
  });

  it('rejects an expired release', async () => {
    const release = signedRelease();
    release.expiresAt = 1;
    expect(await verifySignedRelease(release, publicKey)).toBe(false);
  });

  it('rejects invalid signatures', async () => {
    const release = signedRelease();
    release.signature = 'invalid';
    expect(await verifySignedRelease(release, publicKey)).toBe(false);
  });

  it('rejects an altered native compatibility range', async () => {
    const release = signedRelease();
    release.manifest.maxNativeCode = 19;
    expect(await verifySignedRelease(release, publicKey)).toBe(false);
  });

  it('rejects a signature from an untrusted key', async () => {
    const otherKeys = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });

    const otherPublicKey = otherKeys.publicKey
      .export({
        type: 'spki',
        format: 'der',
      })
      .toString('base64');

    expect(await verifySignedRelease(signedRelease(), otherPublicKey)).toBe(false);
  });

  it('rejects a modified distribution channel', async () => {
    const release = signedRelease();
    release.manifest.channel = 'stable';
    expect(await verifySignedRelease(release, publicKey)).toBe(false);
  });
});
