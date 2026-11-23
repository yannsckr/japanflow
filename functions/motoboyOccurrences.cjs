"use strict";
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// Registra a ocorrência de uma corrida atribuída ao usuário autenticado.
// A criação dispara cosmosNotifyOccurrence após o deploy dos gatilhos.
exports.motoboyReportOccurrence = onCall(
  { region: 'southamerica-east1', maxInstances: 6, timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Autenticação necessária.');
    const { rideId, category, message } = request.data || {};
    if (typeof rideId !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(rideId) ||
        typeof category !== 'string' || !/^[^\r\n]{1,80}$/.test(category) ||
        typeof message !== 'string' || message.trim().length < 10 || message.trim().length > 1000)
      throw new HttpsError('invalid-argument', 'Dados da ocorrência inválidos.');
    const db = getFirestore();
    const link = await db.doc(`auth_links/${request.auth.uid}`).get();
    const userId = link.data()?.user_id;
    if (!userId || link.data()?.active === false)
      throw new HttpsError('permission-denied', 'Usuário sem vínculo ativo.');
    const user = await db.doc(`users/${userId}`).get();
    if (!user.exists || user.data()?.active === false ||
        !(user.data()?.sectors || []).includes('motoboys'))
      throw new HttpsError('permission-denied', 'Acesso não autorizado.');
    const rideRef = db.doc(`motoboy_assignments/${rideId}`);
    const occurrenceRef = db.collection('motoboy_occurrences').doc();
    await db.runTransaction(async tx => {
      const ride = await tx.get(rideRef);
      if (!ride.exists || ride.data()?.assigned_to !== userId ||
          !['pending', 'accepted'].includes(ride.data()?.status))
        throw new HttpsError('failed-precondition', 'Corrida indisponível.');
      const notes = String(ride.data()?.notes || '').trim();
      const entry = `[Ocorrência ${category.trim()}]: ${message.trim()}`;
      tx.update(rideRef, {
        notes: `${notes ? notes + '\n' : ''}${entry}`.slice(-12000),
        updated_at: FieldValue.serverTimestamp(),
      });
      tx.create(occurrenceRef, {
        ride_id: rideId,
        user_id: userId,
        category: category.trim(),
        message: message.trim(),
        created_at: FieldValue.serverTimestamp(),
      });
    });
    return { ok: true };
  }
);
