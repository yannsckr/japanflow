'use strict';
const crypto = require('node:crypto');
const { validManifest, normalizeAudience, canonicalPayload } = require('./otaReleaseSecurity.cjs');
const { protectedPayload, validProtectedMetadata } = require('./otaProtectedProtocol.cjs');
const { makePublication, verifyPublication } = require('./otaPublicationCore.cjs');
function validLocator(p) {
  return validProtectedMetadata(p.protectedBundle) &&
    typeof p.protectedStoragePath === 'string' &&
    /^japanflow\/ota-protected\/[A-Za-z0-9_-]{1,128}\/[a-f0-9-]{36}\.bundle$/.test(p.protectedStoragePath) &&
    p.protectedStoragePath.split('/')[2] === p.draftId &&
    typeof p.protectedGeneration === 'string' && /^[0-9]+$/.test(p.protectedGeneration) &&
    p.protectedBundle.encryptedSizeBytes === (Math.floor(p.manifest.sizeBytes / 16) + 1) * 16;
}
function payload(p) {
  if (!validLocator(p)) throw new Error('Invalid protected locator');
  return JSON.stringify(['japanflow-protected-publication-v2', p.publicationSignature,
    p.protectedStoragePath, p.protectedGeneration, protectedPayload(p.protectedBundle)]);
}
function makeProtectedPublication(draft, draftId, generation, sequence, ids, sign, prepared) {
  const p = {...makePublication(draft,draftId,generation,sequence,ids,sign),
    protectedStoragePath: prepared.storagePath, protectedGeneration: prepared.generation,
    protectedBundle: prepared.protectedBundle};
  return {...p, protectedSignature: sign(payload(p))};
}
function verifyProtectedPublication(p, trusted) {
  try {
    if (p.revokedAt || !verifyPublication(p,trusted) || !validLocator(p)) return false;
    const key=crypto.createPublicKey({key:Buffer.from(trusted,'base64'),format:'der',type:'spki'});
    if (
      typeof p.protectedSignature !== 'string' ||
      !/^[A-Za-z0-9+/]{86}==$/.test(p.protectedSignature)
    ) {
      return false;
    }

    const signatureBytes = Buffer.from(
      p.protectedSignature,
      'base64'
    );

    if (
      signatureBytes.length !== 64 ||
      signatureBytes.toString('base64') !== p.protectedSignature
    ) {
      return false;
    }

    return crypto.verify(
      'sha256',
      Buffer.from(payload(p)),
      { key, dsaEncoding: 'ieee-p1363' },
      signatureBytes
    );
  } catch { return false; }
}
function signProtectedDelivery(p, downloadUrl, expiresAt, sign) {
  if (!validLocator(p) || !validManifest(p.manifest)) throw new Error('Invalid protected publication');
  const url = new URL(downloadUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'storage.googleapis.com' || url.port || url.username || url.password || url.hash ||
      decodeURIComponent(url.pathname) !== '/japanflow-erp.firebasestorage.app/' + p.protectedStoragePath ||
      url.searchParams.get('X-Goog-Algorithm') !== 'GOOG4-RSA-SHA256' || !url.searchParams.get('X-Goog-Signature') ||
      url.searchParams.getAll('generation').length !== 1 || url.searchParams.get('generation') !== p.protectedGeneration ||
      !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) throw new Error('Invalid delivery URL');
  const r={manifest:p.manifest,downloadUrl,sequence:p.sequence,expiresAt,targetUserIds:normalizeAudience(p.targetUserIds),
    protectedStoragePath:p.protectedStoragePath,protectedGeneration:p.protectedGeneration,protectedBundle:p.protectedBundle};
  return {...r,signature:sign(canonicalPayload(r))};
}
module.exports={makeProtectedPublication,verifyProtectedPublication,signProtectedDelivery};
