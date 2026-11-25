'use strict';

const crypto = require('node:crypto');

const {
  getStorage,
} = require('firebase-admin/storage');

const {
  validManifest,
} = require('./otaReleaseSecurity.cjs');

const {
  LIMITS,
  inspectOtaZip,
} = require('./otaZipValidator.cjs');

const BUCKET = 'japanflow-erp.firebasestorage.app';

async function verifyStoredOtaPackage(manifest) {
  if (
    !validManifest(manifest) ||
    manifest.status !== 'draft'
  ) {
    throw new Error('Invalid OTA draft');
  }

  const bucket = getStorage().bucket(BUCKET);
  const file = bucket.file(manifest.storagePath);

  const [metadata] = await file.getMetadata();

  const size = Number(metadata.size);

  if (
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > LIMITS.archiveBytes ||
    size !== manifest.sizeBytes ||
    metadata.contentType !== 'application/zip' ||
    !metadata.generation
  ) {
    throw new Error('Storage package metadata mismatch');
  }

  const generation = String(metadata.generation);

  const immutableFile = bucket.file(
    manifest.storagePath,
    { generation }
  );

  const chunks = [];
  const hash = crypto.createHash('sha256');

  let bytes = 0;

  for await (const chunk of immutableFile.createReadStream()) {
    bytes += chunk.length;

    if (
      bytes > LIMITS.archiveBytes ||
      bytes > manifest.sizeBytes
    ) {
      throw new Error('OTA download limit exceeded');
    }

    hash.update(chunk);
    chunks.push(chunk);
  }

  const sha256 = hash.digest('hex');

  if (
    bytes !== manifest.sizeBytes ||
    sha256 !== manifest.sha256
  ) {
    throw new Error('OTA package checksum mismatch');
  }

  const inspection = await inspectOtaZip(
    Buffer.concat(chunks, bytes)
  );

  return {
    verified: true,
    sha256,
    sizeBytes: bytes,
    generation,
    ...inspection,
  };
}

module.exports = {
  verifyStoredOtaPackage,
};
