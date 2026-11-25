'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  protectCapgoBundle,
  verifyProtectedBundle,
} = require('../otaCapgoCrypto.cjs');

const { privateKey, publicKey } =
  crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

const zip = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  crypto.randomBytes(4096),
]);

const protect = () =>
  protectCapgoBundle(zip, privateKey);

test('protects and verifies a bundle', () => {
  assert.equal(
    verifyProtectedBundle(protect(), publicKey),
    true
  );
});

test('preserves original SHA256', () => {
  const expected = crypto
    .createHash('sha256')
    .update(zip)
    .digest('hex');

  assert.equal(protect().sha256, expected);
});

test('produces a 256-byte RSA checksum', () => {
  assert.equal(protect().checksum.length, 512);
});

test('produces a 16-byte IV', () => {
  const [iv] = protect().sessionKey.split(':');

  assert.equal(
    Buffer.from(iv, 'base64').length,
    16
  );
});

test('produces a 256-byte wrapped session', () => {
  const [, session] =
    protect().sessionKey.split(':');

  assert.equal(
    Buffer.from(session, 'base64').length,
    256
  );
});

test('uses a fresh session for every bundle', () => {
  const first = protect();
  const second = protect();

  assert.notEqual(
    first.sessionKey,
    second.sessionKey
  );

  assert.notDeepEqual(
    first.encrypted,
    second.encrypted
  );
});

test('rejects a modified encrypted package', () => {
  const result = protect();

  result.encrypted[0] ^= 0xff;

  assert.equal(
    verifyProtectedBundle(result, publicKey),
    false
  );
});

test('rejects an altered original hash', () => {
  const result = protect();

  result.sha256 = '0'.repeat(64);

  assert.equal(
    verifyProtectedBundle(result, publicKey),
    false
  );
});

test('rejects an altered encrypted hash', () => {
  const result = protect();

  result.encryptedSha256 = '0'.repeat(64);

  assert.equal(
    verifyProtectedBundle(result, publicKey),
    false
  );
});

test('rejects an invalid session', () => {
  const result = protect();

  result.sessionKey = 'invalid';

  assert.equal(
    verifyProtectedBundle(result, publicKey),
    false
  );
});

test('rejects an invalid RSA checksum', () => {
  const result = protect();

  result.checksum = '0'.repeat(512);

  assert.equal(
    verifyProtectedBundle(result, publicKey),
    false
  );
});

test('rejects another RSA identity', () => {
  const other = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  assert.equal(
    verifyProtectedBundle(protect(), other.publicKey),
    false
  );
});

test('rejects non-ZIP input', () => {
  assert.throws(() =>
    protectCapgoBundle(
      Buffer.from('invalid'),
      privateKey
    )
  );
});

test('rejects truncated encrypted data', () => {
  const result = protect();

  result.encrypted =
    result.encrypted.subarray(0, 32);

  assert.equal(
    verifyProtectedBundle(result, publicKey),
    false
  );
});

test('rejects an invalid declared size', () => {
  const result = protect();

  result.sizeBytes++;

  assert.equal(
    verifyProtectedBundle(result, publicKey),
    false
  );
});

test('rejects an unsupported RSA key size', () => {
  const other = crypto.generateKeyPairSync('rsa', {
    modulusLength: 1024,
  });

  assert.throws(() =>
    protectCapgoBundle(zip, other.privateKey)
  );
});
