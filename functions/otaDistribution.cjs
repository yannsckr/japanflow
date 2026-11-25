'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { canReceiveRelease } = require('./otaReleaseSecurity.cjs');
const { signer, verifyPublication, signDelivery } = require('./otaPublicationCore.cjs');
const { otaSigningKey } = require('./otaPublication.cjs');
const trusted = require('./otaTrustedKey.cjs');
const DISTRIBUTION_ENABLED = false;
exports.japanflowListOtaReleases=onCall({region:'southamerica-east1',enforceAppCheck:true,secrets:[otaSigningKey],maxInstances:3,timeoutSeconds:30},async request=>{
  if (!request.auth?.uid) throw new HttpsError('unauthenticated','Login required');
  const db=getFirestore();
  const link=(await db.doc(`auth_links/${request.auth.uid}`).get()).data();
  if (!link || link.active===false || typeof link.user_id!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(link.user_id)) throw new HttpsError('permission-denied','Invalid identity');
  const user=(await db.doc(`users/${link.user_id}`).get()).data();
  if (!user || user.active===false || !Array.isArray(user.sectors) || !user.sectors.includes('motoboys')) throw new HttpsError('permission-denied','Active motoboy required');
  if (!DISTRIBUTION_ENABLED) return {enabled:false,releases:[]};
  const nativeCode=request.data?.nativeCode;
  if (!Number.isSafeInteger(nativeCode) || nativeCode<18) throw new HttpsError('invalid-argument','Invalid native version');
  const sign=signer(otaSigningKey.value(),trusted);
  const snapshot=await db.collection('japanflow_ota_distribution').orderBy('sequence','desc').limit(50).get();
  const releases=[];
  for (const doc of snapshot.docs) {
    const p=doc.data();
    const expiresAt=Date.now()+15*60*1000;
    if (!verifyPublication(p,trusted) || !canReceiveRelease({...p,expiresAt},link.user_id,nativeCode)) continue;
    const file=getStorage().bucket('japanflow-erp.firebasestorage.app').file(p.manifest.storagePath,{generation:p.generation});
    const [url]=await file.getSignedUrl({version:'v4',action:'read',expires:expiresAt,queryParams:{generation:p.generation}});
    releases.push(signDelivery(p,url,expiresAt,sign));
    if (releases.length===10) break;
  }
  return {enabled:true,releases};
});
