'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { verifyStoredOtaPackage } = require('./otaPackageVerification.cjs');
const { normalizeAudience } = require('./otaReleaseSecurity.cjs');
const { versionKey, signer, makePublication } = require('./otaPublicationCore.cjs');
const trusted = require('./otaTrustedKey.cjs');
const otaSigningKey=defineSecret('JAPANFLOW_OTA_SIGNING_KEY');
const COLLECTION='japanflow_ota_distribution';
async function requirePublisher(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated','Login required');
  const db=getFirestore();
  const link=(await db.doc(`auth_links/${request.auth.uid}`).get()).data();
  if (!link || link.active===false || typeof link.user_id!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(link.user_id)) throw new HttpsError('permission-denied','Invalid identity');
  const user=(await db.doc(`users/${link.user_id}`).get()).data();
  if (!user || user.active===false || !['ryan','japan-ti'].includes(user.username)) throw new HttpsError('permission-denied','Publisher required');
  return link.user_id;
}
exports.otaSigningKey=otaSigningKey;
exports.japanflowPublishOtaRelease=onCall({region:'southamerica-east1',enforceAppCheck:true,secrets:[otaSigningKey],memory:'1GiB',concurrency:1,maxInstances:2,timeoutSeconds:180},async request=>{
  const actor=await requirePublisher(request);
  const draftId=request.data?.draftId;
  if (typeof draftId!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(draftId)) throw new HttpsError('invalid-argument','Invalid draft ID');
  let ids;
  try { ids=normalizeAudience(request.data?.targetUserIds); } catch { throw new HttpsError('invalid-argument','Invalid audience'); }
  const db=getFirestore();
  const draftRef=db.collection('japanflow_ota_releases').doc(draftId);
  const initial=await draftRef.get();
  const draft=initial.data();
  if (!draft || draft.status!=='draft') throw new HttpsError('failed-precondition','Draft unavailable or already published');
  if (draft.channel==='beta' && !ids.length) throw new HttpsError('invalid-argument','Beta audience required');
  // Check target identities, never trust a client-supplied user role.
  if (ids.length) {
    const targets=await db.getAll(...ids.map(id=>db.doc(`users/${id}`)));
    if (targets.some(s=>!s.exists || s.data().active===false || !Array.isArray(s.data().sectors) || !s.data().sectors.includes('motoboys'))) throw new HttpsError('invalid-argument','Audience must contain active motoboys');
  }
  let verified, sign;
  try {
    sign=signer(otaSigningKey.value(),trusted);
    verified=await verifyStoredOtaPackage(draft);
  } catch { throw new HttpsError('failed-precondition','Signing or package verification failed'); }
  const releaseRef=db.collection(COLLECTION).doc('release-'+versionKey(draft.bundleVersion));
  const counterRef=db.collection(COLLECTION).doc('_sequence');
  return db.runTransaction(async tx=>{
    const [current, existing, counter]=await Promise.all([tx.get(draftRef),tx.get(releaseRef),tx.get(counterRef)]);
    if (!current.exists || !current.updateTime.isEqual(initial.updateTime) || current.data().status!=='draft' || existing.exists) throw new HttpsError('already-exists','Draft changed or version already published');
    const previous=counter.exists?counter.data().lastSequence:0;
    if (!Number.isSafeInteger(previous) || previous<0 || previous>=Number.MAX_SAFE_INTEGER) throw new HttpsError('failed-precondition','Invalid sequence counter');
    const sequence=previous+1;
    const p=makePublication(draft,draftId,verified.generation,sequence,ids,sign);
    tx.create(releaseRef,{...p,publishedBy:actor,publishedAt:FieldValue.serverTimestamp()});
    tx.set(counterRef,{lastSequence:sequence});
    tx.update(draftRef,{status:'published',sequence,publishedBy:actor,publishedAt:FieldValue.serverTimestamp()});
    return {published:true,sequence,bundleVersion:p.manifest.bundleVersion};
  });
});
