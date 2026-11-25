'use strict';

const crypto = require('node:crypto');

const MAX_BYTES = 100 * 1024 * 1024;

function protectCapgoBundle(zip, privateKey) {
  if (
    !Buffer.isBuffer(zip) ||
    zip.length < 4 ||
    zip.length > MAX_BYTES ||
    zip.readUInt32LE(0) !== 0x04034b50
  ) {
    throw new Error('Invalid frontend ZIP');
  }

  const key = privateKey instanceof crypto.KeyObject
    ? privateKey
    : crypto.createPrivateKey(privateKey);

  if (
    key.type !== 'private' ||
    key.asymmetricKeyType !== 'rsa' ||
    key.asymmetricKeyDetails?.modulusLength !== 2048
  ) {
    throw new Error('Invalid Capgo RSA private key');
  }

  const session = crypto.randomBytes(16);
  const iv = crypto.randomBytes(16);

  try {
    const digest = crypto
      .createHash('sha256')
      .update(zip)
      .digest();

    const cipher = crypto.createCipheriv(
      'aes-128-cbc',
      session,
      iv
    );

    const encrypted = Buffer.concat([
      cipher.update(zip),
      cipher.final(),
    ]);

    const wrap = value => crypto.privateEncrypt(
      {
        key,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      value
    );

    const checksum = wrap(digest).toString('hex');

    const sessionKey =
      iv.toString('base64') +
      ':' +
      wrap(session).toString('base64');

    return {
      encrypted,
      sha256: digest.toString('hex'),
      encryptedSha256: crypto
        .createHash('sha256')
        .update(encrypted)
        .digest('hex'),
      checksum,
      sessionKey,
      sizeBytes: zip.length,
      encryptedSizeBytes: encrypted.length,
    };
  } finally {
    session.fill(0);
  }
}

function verifyProtectedBundle(result, publicKey) {
  try {
    if (
      !result ||
      !Buffer.isBuffer(result.encrypted) ||
      !/^[a-f0-9]{64}$/.test(result.sha256) ||
      !/^[a-f0-9]{512}$/.test(result.checksum) ||
      result.encrypted.length !== result.encryptedSizeBytes
    ) {
      return false;
    }

    const key = publicKey instanceof crypto.KeyObject
      ? publicKey
      : crypto.createPublicKey(publicKey);

    if (
      key.type !== 'public' ||
      key.asymmetricKeyType !== 'rsa' ||
      key.asymmetricKeyDetails?.modulusLength !== 2048
    ) {
      return false;
    }

    const parts = result.sessionKey.split(':');

    if (parts.length !== 2) return false;

    const iv = Buffer.from(parts[0], 'base64');
    const wrapped = Buffer.from(parts[1], 'base64');

    if (
      iv.length !== 16 ||
      wrapped.length !== 256
    ) {
      return false;
    }

    const unwrap = value => crypto.publicDecrypt(
      {
        key,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      value
    );

    const session = unwrap(wrapped);

    try {
      if (session.length !== 16) return false;

      const expected = unwrap(
        Buffer.from(result.checksum, 'hex')
      );

      if (expected.length !== 32) return false;

      const decipher = crypto.createDecipheriv(
        'aes-128-cbc',
        session,
        iv
      );

      const original = Buffer.concat([
        decipher.update(result.encrypted),
        decipher.final(),
      ]);

      const digest = crypto
        .createHash('sha256')
        .update(original)
        .digest();

      const encryptedDigest = crypto
        .createHash('sha256')
        .update(result.encrypted)
        .digest('hex');

      return (
        crypto.timingSafeEqual(expected, digest) &&
        digest.toString('hex') === result.sha256 &&
        encryptedDigest === result.encryptedSha256 &&
        original.length === result.sizeBytes
      );
    } finally {
      session.fill(0);
    }
  } catch {
    return false;
  }
}

module.exports = {
  protectCapgoBundle,
  verifyProtectedBundle,
};
