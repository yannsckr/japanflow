'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const db = getFirestore();
const dayInSaoPaulo = (now) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

/** Only the authenticated motoboy with an active journey can create a native Firebase session. */
exports.motoboyNativeSession = onCall({
  region: 'southamerica-east1', maxInstances: 5, timeoutSeconds: 30,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Login obrigatório.');
  const link = await db.doc(`auth_links/${uid}`).get();
  const userId = link.data()?.user_id;
  if (typeof userId !== 'string' || !userId || link.data()?.active === false) {
    throw new HttpsError('permission-denied', 'Vínculo de usuário inválido.');
  }
  const user = await db.doc(`users/${userId}`).get();
  if (!user.exists || user.data()?.active === false ||
      !Array.isArray(user.data()?.sectors) || !user.data().sectors.includes('motoboys')) {
    throw new HttpsError('permission-denied', 'Apenas motoboys ativos.');
  }
  const day = dayInSaoPaulo(new Date());
  const journeyId = `${userId}_${day}`;
  const journey = await db.doc(`motoboy_journeys/${journeyId}`).get();
  const j = journey.data();
  if (!j?.started_at || j?.ended_at || (j?.lunch_started_at && !j?.lunch_ended_at)) {
    throw new HttpsError('failed-precondition', 'Jornada não está ativa.');
  }
  // The token is the same auth identity, not a new privileged/service identity.
  // The Android Firestore SDK receives its own renewable Firebase login.
  const customToken = await getAuth().createCustomToken(uid);
  return { customToken, userId, journeyId, day };
});
