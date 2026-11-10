'use strict';
// Cloud Functions v2 — gatilho por notificação direcionada persistida pelo backend.
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

exports.cosmosSendNativeNotification = onDocumentCreated(
  { document: 'system_notifications/{notificationId}', region: 'southamerica-east1', maxInstances: 5 },
  async (event) => {
    const notification = event.data?.data();
    const userId = notification?.recipient_user_id;
    if (typeof userId !== 'string' || !userId || userId.length > 180) return;
    const db = getFirestore();
    const tokenRef = db.doc(`motoboy_device_tokens/${userId}`);
    const tokenSnap = await tokenRef.get();
    if (!tokenSnap.exists || !tokenSnap.data()?.token) return;
    const token = tokenSnap.data().token;
    // O corpo do push pode aparecer na tela bloqueada: não enviar dados sensíveis ou valores de corridas.
    const title = 'JapanFlow COSMOS';
    const body = 'Você tem uma nova notificação no JapanFlow.';
    try {
      await getMessaging().send({
        token,
        notification: { title, body },
        data: { type: 'cosmos_notification', notificationId: event.params.notificationId },
        android: { priority: 'high', notification: { channelId: 'cosmos_updates' } },
      });
    } catch (err) {
      const code = String(err?.code || '');
      console.error('Falha FCM COSMOS', code);
      if (['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(code)) {
        // Apaga somente se o token não foi substituído por um novo entre o envio e a limpeza.
        await db.runTransaction(async (tx) => {
          const fresh = await tx.get(tokenRef);
          if (fresh.exists && fresh.data()?.token === token) tx.delete(tokenRef);
        });
      }
    }
  }
);

// Registra ocorrência como notificação interna para membros da equipe autorizados.
exports.cosmosNotifyOccurrence = onDocumentCreated(
  { document: 'motoboy_occurrences/{occurrenceId}', region: 'southamerica-east1', maxInstances: 4 },
  async (event) => {
    const data = event.data?.data();
    if (!data || typeof data.ride_id !== 'string' || typeof data.user_id !== 'string') return;
    const db = getFirestore();
    const usersSnap = await db.collection('users').get();
    const recipients = usersSnap.docs.filter(doc => {
      const u = doc.data();
      return u.active !== false && (u.role === 'admin' || Array.isArray(u.sectors) && (u.sectors.includes('expedicao') || u.sectors.includes('ti')));
    }).slice(0, 40);
    if (!recipients.length) return;
    const batch = db.batch();
    for (const user of recipients) {
      const ref = db.collection('system_notifications').doc(`cosmos_occ_${event.params.occurrenceId}_${user.id}`);
      batch.set(ref, {
        recipient_user_id: user.id,
        title: 'Ocorrência de entrega',
        source: 'cosmos',
        severity: 'attention',
        message: `Nova ocorrência em corrida #${data.ride_id.slice(0, 8)}.`,
        read: false,
        created_at: FieldValue.serverTimestamp(),
        type: 'cosmos_occurrence',
        ride_id: data.ride_id,
      }, { merge: false });
    }
    await batch.commit();
  }
);

// Uma atribuição nova gera notificação ao motoboy, mesmo com app fechado.
exports.cosmosNotifyNewRide = onDocumentCreated(
  { document: 'motoboy_assignments/{rideId}', region: 'southamerica-east1', maxInstances: 5 },
  async event => {
    const ride = event.data?.data();
    const userId = ride?.assigned_to;
    if (typeof userId !== 'string' || !userId || userId.length > 180) return;
    const db = getFirestore();
    await db.collection('system_notifications').doc(`cosmos_ride_${event.params.rideId}`).set({
      recipient_user_id: userId,
      title: 'Nova corrida',
      source: 'cosmos',
      severity: 'info',
      message: 'Uma nova corrida foi atribuída a você.',
      read: false,
      created_at: FieldValue.serverTimestamp(),
      type: 'cosmos_ride',
      ride_id: event.params.rideId,
    });
  }
);

// Push de nova mensagem privada. O conteúdo da conversa jamais é enviado ao Android.
exports.cosmosNotifyChat = onDocumentCreated(
  { document: 'messages/{messageId}', region: 'southamerica-east1', maxInstances: 5 },
  async event => {
    const m = event.data?.data();
    const receiver = m?.receiverId;
    if (typeof receiver !== 'string' || !receiver || receiver === m.senderId || receiver.length > 180) return;
    await getFirestore().collection('system_notifications').doc(`cosmos_chat_${event.params.messageId}`).set({
      recipient_user_id: receiver,
      title: 'Mensagem no chat',
      source: 'cosmos',
      severity: 'info',
      message: 'Você recebeu uma nova mensagem no chat.',
      read: false,
      created_at: FieldValue.serverTimestamp(),
      type: 'cosmos_chat',
    });
  }
);
