'use strict';

const crypto = require('node:crypto');

const MAX_BYTES = 100 * 1024 * 1024;
const MIN_NATIVE_CODE = 18;

function validManifest(m) {
  if (!m || typeof m !== 'object') return false;

  return (
    m.schemaVersion === 1 &&
    m.platform === 'android' &&
    typeof m.bundleVersion === 'string' &&
    /^[0-9]{1,6}[.][0-9]{1,6}[.][0-9]{1,6}$/.test(m.bundleVersion) &&
    typeof m.title === 'string' &&
    m.title.trim().length > 0 &&
    m.title.length <= 160 &&
    typeof m.notes === 'string' &&
    m.notes.trim().length > 0 &&
    m.notes.length <= 10000 &&
    ['stable', 'beta'].includes(m.channel) &&
    ['draft', 'published', 'revoked'].includes(m.status) &&
    Number.isSafeInteger(m.minNativeCode) &&
    Number.isSafeInteger(m.maxNativeCode) &&
    m.minNativeCode >= MIN_NATIVE_CODE &&
    m.maxNativeCode >= m.minNativeCode &&
    typeof m.sha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(m.sha256) &&
    Number.isSafeInteger(m.sizeBytes) &&
    m.sizeBytes > 0 &&
    m.sizeBytes <= MAX_BYTES &&
    typeof m.storagePath === 'string' &&
    /^japanflow[/]ota[/][A-Za-z0-9_-]+[/][a-f0-9-]{36}[.]zip$/.test(
      m.storagePath
    )
  );
}

function normalizeAudience(ids) {
  if (
    !Array.isArray(ids) ||
    ids.length > 250 ||
    !ids.every(
      id =>
        typeof id === 'string' &&
        /^[A-Za-z0-9_-]{1,128}$/.test(id)
    )
  ) {
    throw new Error('Invalid release audience');
  }

  return [...new Set(ids)].sort();
}

function canonicalPayload(release) {
  const m = release.manifest;

  return JSON.stringify([
    'japanflow-ota-v1',
    'com.japanflow.mobile',
    m.schemaVersion,
    m.bundleVersion,
    m.platform,
    m.title,
    m.notes,
    m.channel,
    m.status,
    m.minNativeCode,
    m.maxNativeCode,
    m.sha256,
    m.sizeBytes,
    m.storagePath,
    release.downloadUrl,
    release.sequence,
    release.expiresAt,
    release.targetUserIds,
  ]);
}

function trustedDownloadUrl(value, storagePath) {
  try {
    const url = new URL(value);

    return (
      url.protocol === 'https:' &&
      url.hostname === 'firebasestorage.googleapis.com' &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.hash &&
      url.pathname ===
        '/v0/b/japanflow-erp.firebasestorage.app/o/' +
          encodeURIComponent(storagePath) &&
      url.searchParams.get('alt') === 'media'
    );
  } catch {
    return false;
  }
}

function canReceiveRelease(
  release,
  userId,
  nativeCode,
  now = Date.now()
) {
  if (
    !release ||
    !validManifest(release.manifest) ||
    release.manifest.status !== 'published' ||
    !Number.isSafeInteger(release.sequence) ||
    release.sequence <= 0 ||
    !Number.isSafeInteger(release.expiresAt) ||
    release.expiresAt <= now ||
    !Number.isSafeInteger(nativeCode) ||
    nativeCode < release.manifest.minNativeCode ||
    nativeCode > release.manifest.maxNativeCode ||
    !userId
  ) return false;

  let audience;

  try {
    audience = normalizeAudience(release.targetUserIds);
  } catch {
    return false;
  }

  if (release.manifest.channel === 'beta') {
    return audience.includes(userId);
  }

  return (
    audience.length === 0 ||
    audience.includes(userId)
  );
}

function signRelease(release, privateKey) {
  if (
    !validManifest(release.manifest) ||
    release.manifest.status !== 'published' ||
    !trustedDownloadUrl(
      release.downloadUrl,
      release.manifest.storagePath
    ) ||
    !Number.isSafeInteger(release.sequence) ||
    release.sequence <= 0 ||
    !Number.isSafeInteger(release.expiresAt) ||
    release.expiresAt <= Date.now()
  ) {
    throw new Error('Invalid release payload');
  }

  const audience = normalizeAudience(
    release.targetUserIds
  );

  if (
    release.manifest.channel === 'beta' &&
    audience.length === 0
  ) {
    throw new Error('Beta release requires an audience');
  }

  const key = crypto.createPrivateKey(privateKey);

  if (
    key.asymmetricKeyType !== 'ec' ||
    key.asymmetricKeyDetails?.namedCurve !== 'prime256v1'
  ) {
    throw new Error('Invalid OTA signing key');
  }

  const normalized = {
    ...release,
    targetUserIds: audience,
  };

  const signature = crypto.sign(
    'sha256',
    Buffer.from(canonicalPayload(normalized), 'utf8'),
    {
      key,
      dsaEncoding: 'ieee-p1363',
    }
  ).toString('base64');

  return {
    ...normalized,
    signature,
  };
}

function verifyRelease(release, publicKey) {
  try {
    if (
      !validManifest(release.manifest) ||
      release.manifest.status !== 'published' ||
      !trustedDownloadUrl(
        release.downloadUrl,
        release.manifest.storagePath
      ) ||
      typeof release.signature !== 'string'
    ) {
      return false;
    }

    return crypto.verify(
      'sha256',
      Buffer.from(canonicalPayload(release), 'utf8'),
      {
        key: publicKey,
        dsaEncoding: 'ieee-p1363',
      },
      Buffer.from(release.signature, 'base64')
    );
  } catch {
    return false;
  }
}

module.exports = {
  validManifest,
  normalizeAudience,
  canonicalPayload,
  trustedDownloadUrl,
  canReceiveRelease,
  signRelease,
  verifyRelease,
};
