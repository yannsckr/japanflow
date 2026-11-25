'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { canReceiveRelease } = require('./otaReleaseSecurity.cjs');
const { signer } = require('./otaPublicationCore.cjs');
const { verifyProtectedPublication, signProtectedDelivery } = require('./otaProtectedPublication.cjs');
const { otaSigningKey } = require('./otaPublication.cjs');
const trusted = require('./otaTrustedKey.cjs');
const { pilotAllowed, pilotReleaseAllowed } = require('./otaPilotControl.cjs');
exports.japanflowListOtaReleases=onCall({region:'southamerica-east1', serviceAccount: 'japanflow-ota@japanflow-erp.iam.gserviceaccount.com',enforceAppCheck:true,secrets:[otaSigningKey],maxInstances:3,timeoutSeconds:30},async request=>{
  if (!request.auth?.uid) throw new HttpsError('unauthenticated','Login required');
  const db=getFirestore();
  const link=(await db.doc(`auth_links/${request.auth.uid}`).get()).data();
  if (!link || link.active===false || typeof link.user_id!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(link.user_id)) throw new HttpsError('permission-denied','Invalid identity');
  const user=(await db.doc(`users/${link.user_id}`).get()).data();
  if (!user || user.active===false || !Array.isArray(user.sectors) || !user.sectors.includes('motoboys')) throw new HttpsError('permission-denied','Active motoboy required');
  const nativeCode=request.data?.nativeCode;
  const control=(await db.doc('japanflow_ota_distribution/_control').get()).data();
  if (!pilotAllowed(control, link.user_id, nativeCode, request.app?.appId)) return {enabled:false,releases:[]};
  const sign=signer(otaSigningKey.value(),trusted);
  const snapshot=await db.collection('japanflow_ota_distribution').orderBy('sequence','desc').limit(50).get();
  const releases=[];
  for (const doc of snapshot.docs) {
    const p=doc.data();
    const expiresAt=Date.now()+15*60*1000;
    if (!pilotReleaseAllowed(p,link.user_id) || !verifyProtectedPublication(p,trusted) || !canReceiveRelease({...p,expiresAt},link.user_id,nativeCode)) continue;
    const file=getStorage().bucket('japanflow-erp.firebasestorage.app').file(p.protectedStoragePath,{generation:p.protectedGeneration});
    const [url]=await file.getSignedUrl({version:'v4',action:'read',expires:expiresAt,queryParams:{generation:p.protectedGeneration}});
    releases.push(signProtectedDelivery(p,url,expiresAt,sign));
    if (releases.length===10) break;
  }
  return {enabled:true,releases};
});
