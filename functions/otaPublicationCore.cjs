'use strict';
const crypto = require('node:crypto');
const { validManifest, normalizeAudience, canonicalPayload } = require('./otaReleaseSecurity.cjs');
const FIELDS = ['schemaVersion','bundleVersion','platform','title','notes','channel','status','minNativeCode','maxNativeCode','sha256','sizeBytes','storagePath'];
function manifestOf(draft) {
  const m = Object.fromEntries(FIELDS.map(k => [k, draft[k]]));
  if (!validManifest(m) || m.status !== 'draft') throw new Error('Invalid draft');
  return {...m, status: 'published'};
}
function versionKey(version) {
  if (typeof version !== 'string' || !/^[0-9]{1,6}(\.[0-9]{1,6}){2}$/.test(version)) throw new Error('Invalid version');
  return version.split('.').map(Number).join('.');
}
function publicationPayload(p) {
  return JSON.stringify(['japanflow-ota-publication-v1', 'com.japanflow.mobile', FIELDS.map(k=>p.manifest[k]), p.generation, p.sequence, p.targetUserIds, p.draftId]);
}
function signer(pem, trustedDer) {
  const key = crypto.createPrivateKey(pem);
  const pub = crypto.createPublicKey(key);
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1' || pub.export({type:'spki',format:'der'}).toString('base64') !== trustedDer) throw new Error('Signing key mismatch');
  return payload => crypto.sign('sha256',Buffer.from(payload,'utf8'),{key,dsaEncoding:'ieee-p1363'}).toString('base64');
}
function makePublication(draft, draftId, generation, sequence, ids, sign) {
  const manifest = manifestOf(draft);
  const targetUserIds = normalizeAudience(ids);
  if (manifest.channel === 'beta' && !targetUserIds.length) throw new Error('Beta audience required');
  if (!/^[0-9]+$/.test(generation) || !Number.isSafeInteger(sequence) || sequence <= 0 || !/^[A-Za-z0-9_-]{1,128}$/.test(draftId)) throw new Error('Invalid publication metadata');
  const p = {manifest,generation,sequence,targetUserIds,draftId};
  return {...p, publicationSignature:sign(publicationPayload(p))};
}
function verifyPublication(p, trustedDer) {
  try {
    if (!validManifest(p.manifest) || p.manifest.status !== 'published' || !/^[0-9]+$/.test(p.generation) || !Number.isSafeInteger(p.sequence) || p.sequence <= 0 || !/^[A-Za-z0-9_-]{1,128}$/.test(p.draftId)) return false;
    const ids = normalizeAudience(p.targetUserIds);
    if (JSON.stringify(ids)!==JSON.stringify(p.targetUserIds) || (p.manifest.channel==='beta' && !ids.length)) return false;
    const key=crypto.createPublicKey({key:Buffer.from(trustedDer,'base64'),format:'der',type:'spki'});
    return crypto.verify('sha256',Buffer.from(publicationPayload(p)),{key,dsaEncoding:'ieee-p1363'},Buffer.from(p.publicationSignature,'base64'));
  } catch { return false; }
}
function signDelivery(p, downloadUrl, expiresAt, sign) {
  const r={manifest:p.manifest,downloadUrl,sequence:p.sequence,expiresAt,targetUserIds:p.targetUserIds};
  return {...r,signature:sign(canonicalPayload(r))};
}
module.exports={versionKey,signer,makePublication,verifyPublication,signDelivery};
