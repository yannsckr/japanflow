'use strict';

const crypto = require('node:crypto');
const { getStorage } = require('firebase-admin/storage');

const {
  validManifest,
} = require('./otaReleaseSecurity.cjs');

const {
  inspectOtaZip,
} = require('./otaZipValidator.cjs');

const {
  protectCapgoBundle,
  verifyProtectedBundle,
} = require('./otaCapgoCrypto.cjs');

const {
  validProtectedMetadata,
} = require('./otaProtectedProtocol.cjs');

async function prepareProtectedPackage(
  draft,
  draftId,
  generation,
  privateKey,
  trustedPublicKey
) {
  if (
    !validManifest(draft) ||
    draft.status !== 'draft' ||
    typeof draftId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(draftId) ||
    typeof generation !== 'string' ||
    !/^[0-9]+$/.test(generation)
  ) {
    throw new Error('Invalid protected package request');
  }

  const key = crypto.createPrivateKey(privateKey);
  const derived = crypto.createPublicKey(key).export({
    type: 'spki',
    format: 'der',
  });

  const expected = crypto.createPublicKey(
    trustedPublicKey
  ).export({
    type: 'spki',
    format: 'der',
  });

  if (!derived.equals(expected)) {
    throw new Error('Capgo signing identity mismatch');
  }

  const bucket = getStorage().bucket(
    'japanflow-erp.firebasestorage.app'
  );

  const original = bucket.file(
    draft.storagePath,
    { generation }
  );

  const chunks = [];

  let bytes = 0;

  for await (const chunk of original.createReadStream()) {
    bytes += chunk.length;

    if (bytes > draft.sizeBytes) {
      throw new Error('Package size exceeded');
    }

    chunks.push(chunk);
  }

  const zip = Buffer.concat(chunks, bytes);

  if (zip.length !== draft.sizeBytes) {
    throw new Error('Package size mismatch');
  }

  const digest = crypto
    .createHash('sha256')
    .update(zip)
    .digest('hex');

  if (digest !== draft.sha256) {
    throw new Error('Package SHA256 mismatch');
  }

  await inspectOtaZip(zip);

  const protectedPackage = protectCapgoBundle(
    zip,
    key
  );

  if (
    !verifyProtectedBundle(
      protectedPackage,
      crypto.createPublicKey(key)
    )
  ) {
    throw new Error('Protected package verification failed');
  }

  const protectedBundle = {
    format: 'capgo-rsa-aes-v1',
    checksum: protectedPackage.checksum,
    sessionKey: protectedPackage.sessionKey,
    encryptedSha256: protectedPackage.encryptedSha256,
    encryptedSizeBytes: protectedPackage.encryptedSizeBytes,
  };

  if (!validProtectedMetadata(protectedBundle)) {
    throw new Error('Invalid protected metadata');
  }

  const storagePath =
    'japanflow/ota-protected/' +
    draftId +
    '/' +
    crypto.randomUUID() +
    '.bundle';

  const destination = bucket.file(storagePath);

  await destination.save(
    protectedPackage.encrypted,
    {
      resumable: false,
      validation: 'crc32c',
      preconditionOpts: {
        ifGenerationMatch: 0,
      },
      metadata: {
        contentType: 'application/octet-stream',
        cacheControl: 'private, no-store',
      },
    }
  );

  const [metadata] = await destination.getMetadata();

  if (!metadata.generation) {
    throw new Error('Protected object generation missing');
  }

  return {
    storagePath,
    generation: String(metadata.generation),
    protectedBundle,
  };
}

module.exports = {
  prepareProtectedPackage,
};
