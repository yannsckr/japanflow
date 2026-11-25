'use strict';

function validProtectedMetadata(value) {
  if (!value || typeof value !== 'object') return false;

  if (
    value.format !== 'capgo-rsa-aes-v1' ||
    typeof value.checksum !== 'string' ||
    !/^[a-f0-9]{512}$/.test(value.checksum) ||
    typeof value.encryptedSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.encryptedSha256) ||
    !Number.isSafeInteger(value.encryptedSizeBytes) ||
    value.encryptedSizeBytes < 16 ||
    value.encryptedSizeBytes > 104857616 ||
    value.encryptedSizeBytes % 16 !== 0 ||
    typeof value.sessionKey !== 'string' ||
    value.sessionKey.length !== 369
  ) {
    return false;
  }

  const parts = value.sessionKey.split(':');

  if (parts.length !== 2) return false;

  try {
    const iv = Buffer.from(parts[0], 'base64');
    const wrapped = Buffer.from(parts[1], 'base64');

    return (
      iv.length === 16 &&
      wrapped.length === 256 &&
      iv.toString('base64') === parts[0] &&
      wrapped.toString('base64') === parts[1]
    );
  } catch {
    return false;
  }
}

function protectedPayload(metadata) {
  if (!validProtectedMetadata(metadata)) {
    throw new Error('Invalid protected bundle metadata');
  }

  return [
    metadata.format,
    metadata.checksum,
    metadata.sessionKey,
    metadata.encryptedSha256,
    metadata.encryptedSizeBytes,
  ];
}

module.exports = {
  validProtectedMetadata,
  protectedPayload,
};
