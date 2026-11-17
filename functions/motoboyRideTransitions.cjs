"use strict";
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { isJourneyOpen, isValidRideTransition } = require('./motoboyRideTransitionsCore.cjs');

const db = getFirestore();
const region = 'southamerica-east1';
const today = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

async function getIdentity(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Autenticação obrigatória.');
  const link = await db.doc(`auth_links/${request.auth.uid}`).get();
  const userId = link.data()?.user_id;
  if (!userId || link.data()?.active === false) throw new HttpsError('permission-denied', 'Vínculo inválido.');
  const user = await db.doc(`users/${userId}`).get();
  if (!user.exists || user.data()?.active === false || !(user.data()?.sectors || []).includes('motoboys'))
    throw new HttpsError('permission-denied', 'Usuário não autorizado.');
  return userId;
}

// Todos os writes de transição para motoboys devem passar por esta Function.
// O cliente nunca informa userId; a identidade vem exclusivamente do token autenticado.
exports.motoboyRideTransition = onCall({ region, maxInstances: 8, timeoutSeconds: 60 }, async (request) => {
  const userId = await getIdentity(request);
  const action = request.data?.action;
  const rideId = request.data?.rideId;
  if (!['start', 'finish'].includes(action) || typeof rideId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,160}$/.test(rideId))
    throw new HttpsError('invalid-argument', 'Corrida ou ação inválida.');

  const journeyRef = db.doc(`motoboy_journeys/${userId}_${today()}`);
  const rideRef = db.doc(`motoboy_assignments/${rideId}`);
  let proofUrl = null;

  if (action === 'finish') {
    const storagePath = request.data?.storagePath;
    proofUrl = request.data?.proofUrl;
    if (typeof storagePath !== 'string' || !/^attachments\/receipts\/[A-Za-z0-9_.-]{4,160}$/.test(storagePath) ||
        typeof proofUrl !== 'string' || !proofUrl.startsWith('https://firebasestorage.googleapis.com/'))
      throw new HttpsError('invalid-argument', 'Comprovante de entrega inválido.');
    let metadata;
    try {
      [metadata] = await getStorage().bucket().file(storagePath).getMetadata();
    } catch {
      throw new HttpsError('failed-precondition', 'Foto da notinha não encontrada no Storage.');
    }
    if (!String(metadata.contentType || '').startsWith('image/') ||
        Number(metadata.size) > 12 * 1024 * 1024 || Number(metadata.size) <= 0)
      throw new HttpsError('invalid-argument', 'Foto da notinha inválida.');
    // A URL informada pelo cliente deve apontar para o mesmo objeto verificado no Storage.
    const encodedPath = encodeURIComponent(storagePath);
    if (!proofUrl.includes(`/o/${encodedPath}?`))
      throw new HttpsError('invalid-argument', 'O comprovante não corresponde ao arquivo enviado.');
  }

  await db.runTransaction(async (tx) => {
    const journey = await tx.get(journeyRef);
    const ride = await tx.get(rideRef);
    if (!isJourneyOpen(journey.data()))
      throw new HttpsError('failed-precondition', 'Valide o odômetro inicial e finalize o almoço antes de operar.');
    if (!isValidRideTransition(ride.data(), userId, action))
      throw new HttpsError('failed-precondition', 'Corrida indisponível ou alterada por outra pessoa.');
    const stamp = FieldValue.serverTimestamp();
    if (action === 'start') {
      tx.update(rideRef, { status: 'accepted', accepted_at: stamp, updated_at: stamp });
    } else {
      const notes = String(ride.data().notes || '').trim();
      tx.update(rideRef, {
        status: 'completed', proof_url: proofUrl,
        notes: `${notes ? notes + '\n' : ''}Cupom: ${proofUrl}`,
        completed_at: stamp, updated_at: stamp,
      });
    }
  });
  return { ok: true, rideId, status: action === 'start' ? 'accepted' : 'completed' };
});
