'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { privateKey, publicKey } =
  crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicExponent: 65537,
  });

test('uses a 2048-bit RSA key', () => {
  assert.equal(
    publicKey.asymmetricKeyDetails.modulusLength,
    2048
  );
});

test('exports a PKCS1 public key', () => {
  const pem = publicKey.export({
    type: 'pkcs1',
    format: 'pem',
  });

  assert.ok(
    pem.startsWith(
      '-----BEGIN RSA PUBLIC KEY-----'
    )
  );
});

test('recovers RSA wrapped SHA256 bytes', () => {
  const checksum = crypto
    .createHash('sha256')
    .update('JapanFlow OTA fixture')
    .digest();

  const wrapped = crypto.privateEncrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    checksum
  );

  const recovered = crypto.publicDecrypt(
    {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    wrapped
  );

  assert.deepEqual(recovered, checksum);
});

test('rejects a modified RSA payload', () => {
  const wrapped = crypto.privateEncrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    Buffer.from('JapanFlow')
  );

  wrapped.fill(0);

  assert.throws(() =>
    crypto.publicDecrypt(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      wrapped
    )
  );
});

test('rejects a different RSA identity', () => {
  const other = crypto.generateKeyPairSync(
    'rsa',
    { modulusLength: 2048 }
  );

  const wrapped = crypto.privateEncrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    Buffer.from('JapanFlow')
  );

  assert.throws(() =>
    crypto.publicDecrypt(
      {
        key: other.publicKey,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      wrapped
    )
  );
});
