'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  validManifest,
  normalizeAudience,
  trustedDownloadUrl,
  canReceiveRelease,
  signRelease,
  verifyRelease,
} = require('../otaReleaseSecurity.cjs');

const { privateKey, publicKey } =
  crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
  });

function release() {
  const storagePath =
    'japanflow/ota/ti-user/00000000-0000-4000-8000-000000000001.zip';

  return {
    manifest: {
      schemaVersion: 1,
      bundleVersion: '48.0.1',
      platform: 'android',
      title: 'OTA Test',
      notes: 'Test release',
      channel: 'stable',
      status: 'published',
      minNativeCode: 18,
      maxNativeCode: 18,
      sha256: 'a'.repeat(64),
      sizeBytes: 100,
      storagePath,
    },
    downloadUrl:
      'https://firebasestorage.googleapis.com/v0/b/' +
      'japanflow-erp.firebasestorage.app/o/' +
      encodeURIComponent(storagePath) +
      '?alt=media',
    sequence: 1,
    expiresAt: Date.now() + 600000,
    targetUserIds: [],
  };
}

test('accepts a valid manifest', () => {
  assert.equal(
    validManifest(release().manifest),
    true
  );
});

test('rejects an oversized package', () => {
  const r = release();
  r.manifest.sizeBytes = 104857601;

  assert.equal(validManifest(r.manifest), false);
});

test('rejects old native versions', () => {
  const r = release();
  r.manifest.minNativeCode = 17;

  assert.equal(validManifest(r.manifest), false);
});

test('normalizes target users', () => {
  assert.deepEqual(
    normalizeAudience(['b', 'a', 'b']),
    ['a', 'b']
  );
});

test('rejects invalid target users', () => {
  assert.throws(() =>
    normalizeAudience(['invalid/user'])
  );
});

test('signs and verifies a valid release', () => {
  const signed = signRelease(
    release(),
    privateKey
  );

  assert.equal(
    verifyRelease(signed, publicKey),
    true
  );
});

test('rejects altered signed manifests', () => {
  const signed = signRelease(
    release(),
    privateKey
  );

  signed.manifest.sha256 = 'b'.repeat(64);

  assert.equal(
    verifyRelease(signed, publicKey),
    false
  );
});

test('rejects altered audience', () => {
  const signed = signRelease(
    release(),
    privateKey
  );

  signed.targetUserIds = ['other-user'];

  assert.equal(
    verifyRelease(signed, publicKey),
    false
  );
});

test('rejects publication of a draft', () => {
  const r = release();
  r.manifest.status = 'draft';

  assert.throws(() => signRelease(r, privateKey));
});

test('requires explicit beta audience', () => {
  const r = release();
  r.manifest.channel = 'beta';

  assert.throws(() => signRelease(r, privateKey));
});

test('blocks unauthorized beta users', () => {
  const r = release();
  r.manifest.channel = 'beta';
  r.targetUserIds = ['allowed-user'];

  assert.equal(
    canReceiveRelease(r, 'other-user', 18),
    false
  );
});

test('allows authorized beta users', () => {
  const r = release();
  r.manifest.channel = 'beta';
  r.targetUserIds = ['allowed-user'];

  assert.equal(
    canReceiveRelease(r, 'allowed-user', 18),
    true
  );
});

test('blocks expired releases', () => {
  const r = release();
  r.expiresAt = 1;

  assert.equal(
    canReceiveRelease(r, 'user-test', 18),
    false
  );
});

test('blocks incompatible devices', () => {
  assert.equal(
    canReceiveRelease(release(), 'user-test', 17),
    false
  );
});

test('rejects an untrusted download host', () => {
  const r = release();

  assert.equal(
    trustedDownloadUrl(
      'https://example.com/package.zip',
      r.manifest.storagePath
    ),
    false
  );
});
