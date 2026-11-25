'use strict';

const {
  onCall,
  HttpsError,
} = require('firebase-functions/v2/https');

const {
  getFirestore,
} = require('firebase-admin/firestore');

const {
  verifyStoredOtaPackage,
} = require('./otaPackageVerification.cjs');

async function requirePublisher(request) {
  const uid = request.auth?.uid;

  if (!uid) {
    throw new HttpsError(
      'unauthenticated',
      'Authentication required'
    );
  }

  const db = getFirestore();

  const link = await db.doc(
    `auth_links/${uid}`
  ).get();

  const identity = link.data();

  if (
    !link.exists ||
    identity?.active === false ||
    typeof identity?.user_id !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(identity.user_id)
  ) {
    throw new HttpsError(
      'permission-denied',
      'Invalid identity'
    );
  }

  const user = await db.doc(
    `users/${identity.user_id}`
  ).get();

  const data = user.data();

  const username = String(
    data?.username || ''
  ).trim().toLowerCase();

  if (
    !user.exists ||
    data?.active === false ||
    !['ryan', 'japan-ti'].includes(username)
  ) {
    throw new HttpsError(
      'permission-denied',
      'OTA publisher permission required'
    );
  }

  return identity.user_id;
}

exports.japanflowValidateOtaPackage = onCall(
  {
    region: 'southamerica-east1', serviceAccount: 'japanflow-ota@japanflow-erp.iam.gserviceaccount.com',
    enforceAppCheck: true,
    memory: '1GiB',
    concurrency: 1,
    maxInstances: 2,
    timeoutSeconds: 120,
  },
  async request => {
    await requirePublisher(request);

    const draftId = request.data?.draftId;

    if (
      typeof draftId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(draftId)
    ) {
      throw new HttpsError(
        'invalid-argument',
        'Invalid draft identifier'
      );
    }

    const snapshot = await getFirestore()
      .collection('japanflow_ota_releases')
      .doc(draftId)
      .get();

    if (
      !snapshot.exists ||
      snapshot.data()?.status !== 'draft'
    ) {
      throw new HttpsError(
        'failed-precondition',
        'OTA draft unavailable'
      );
    }

    try {
      return await verifyStoredOtaPackage(
        snapshot.data()
      );
    } catch (error) {
      console.warn(
        '[JapanFlow OTA] Package validation rejected:',
        error instanceof Error ? error.message : 'Unknown error'
      );

      throw new HttpsError(
        'failed-precondition',
        'OTA package failed validation'
      );
    }
  }
);
