'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');

const db = getFirestore();
const visionKey = defineSecret('GOOGLE_VISION_SERVER_KEY');
const REGION = 'southamerica-east1';
const REGION_TIMEZONE = 'America/Sao_Paulo';

const dateParts = (date) => Object.fromEntries(new Intl.DateTimeFormat('en-US', {
  timeZone: REGION_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
}).formatToParts(date).map(({ type, value }) => [type, value]));
const today = (date) => { const x = dateParts(date); return `${x.year}-${x.month}-${x.day}`; };
const asReading = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 9999999) {
    throw new HttpsError('invalid-argument', 'Informe um odômetro numérico válido.');
  }
  return Math.round(value * 10) / 10;
};
const validPhotoPath = (userId, path) =>
  typeof path === 'string' && /^odometer-proof\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{12,100}\.(jpg|jpeg|png|webp)$/.test(path)
    && path.startsWith(`odometer-proof/${userId}/`);

async function identity(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Login obrigatório.');
  const link = await db.doc(`auth_links/${request.auth.uid}`).get();
  const userId = link.data()?.user_id;
  if (!userId || link.data().active === false) throw new HttpsError('permission-denied', 'Conta inativa.');
  const user = await db.doc(`users/${userId}`).get();
  if (!user.exists || user.data()?.active === false || !(user.data()?.sectors || []).includes('motoboys')) {
    throw new HttpsError('permission-denied', 'Apenas motoboys ativos podem registrar jornada.');
  }
  return userId;
}

// OCR de painel veicular com verificação conservadora: candidato único e coincidência numérica.
// Leitura incerta nunca é marcada como aprovada por IA.
async function verifyOdometer(userId, storagePath, entered) {
  if (!validPhotoPath(userId, storagePath)) throw new HttpsError('invalid-argument', 'Foto inválida para este usuário.');
  const file = getStorage().bucket().file(storagePath);
  const [metadata] = await file.getMetadata().catch(() => {
    throw new HttpsError('failed-precondition', 'Foto não encontrada no armazenamento.');
  });
  if (!String(metadata.contentType || '').startsWith('image/') || Number(metadata.size) > 8 * 1024 * 1024)
    throw new HttpsError('invalid-argument', 'Arquivo de imagem inválido.');
  const [bytes] = await file.download();
  let response;
  try {
    response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(visionKey.value())}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ image: { content: bytes.toString('base64') }, features: [{ type: 'TEXT_DETECTION', maxResults: 1 }] }] }),
      signal: AbortSignal.timeout(14000),
    });
  } catch {
    throw new HttpsError('unavailable', 'Validação da fotografia indisponível. Tente novamente.');
  }
  if (!response.ok) {
    console.error('[motoboyJourney] Vision API status', response.status);
    throw new HttpsError('unavailable', 'A validação da foto está indisponível.');
  }
  const result = await response.json();
  const fullText = String(result.responses?.[0]?.fullTextAnnotation?.text || result.responses?.[0]?.textAnnotations?.[0]?.description || '');
  // Evitar converter valores separados por pontuação de painel (hora, velocidade, trip).
  const candidates = [...fullText.matchAll(/(?<!\d)(\d{4,7})(?:[.,](\d))?(?!\d)/g)]
    .map((m) => Number(m[1]) + (m[2] ? Number(m[2]) / 10 : 0));
  const matches = [...new Set(candidates.filter((n) => Math.abs(n - entered) <= 0.1))];
  if (matches.length !== 1) {
    throw new HttpsError('failed-precondition', 'Não foi possível confirmar o odômetro na foto. Tire outra foto legível e informe o valor exato.');
  }
  return { reading: matches[0], verified: true };
}

exports.motoboyJourney = onCall({
  region: REGION, secrets: [visionKey], maxInstances: 4, timeoutSeconds: 60,
}, async (request) => {
  const userId = await identity(request);
  const action = request.data?.action;
  const now = new Date();
  const date = today(now);
  const docRef = db.doc(`motoboy_journeys/${userId}_${date}`);
  const daySnap = await docRef.get();
  const jornada = daySnap.data();

  if (action === 'status') return { day: date, journey: jornada || null };

  if (action === 'start') {
    if (Number(dateParts(now).hour) < 7)
      throw new HttpsError('failed-precondition', 'A jornada só pode ser iniciada a partir das 07h.');
    if (jornada?.started_at) throw new HttpsError('already-exists', 'Jornada já iniciada hoje.');
    const odometer = asReading(request.data?.odometer);
    const photoPath = request.data?.photoPath;
    const validated = await verifyOdometer(userId, photoPath, odometer);
    await db.runTransaction(async (tx) => {
      const live = await tx.get(docRef);
      if (live.exists && live.data().started_at) throw new HttpsError('already-exists', 'Jornada já iniciada.');
      tx.set(docRef, {
        user_id: userId, day: date, started_at: FieldValue.serverTimestamp(),
        start_odometer: odometer, start_photo_path: photoPath,
        start_ocr_reading: validated.reading, start_ai_verified: true,
        end_odometer: null, end_photo_path: null, ended_at: null,
        lunch_started_at: null, lunch_ended_at: null,
        created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp(),
      });
    });
    return { ok: true, day: date };
  }

  if (!jornada?.started_at) throw new HttpsError('failed-precondition', 'Registre primeiro o odômetro inicial.');
  if (jornada.ended_at) throw new HttpsError('failed-precondition', 'Jornada já encerrada.');

  if (action === 'lunchStart') {
    await db.runTransaction(async (tx) => {
      const live = await tx.get(docRef);
      if (!live.exists || !live.data().started_at || live.data().ended_at || live.data().lunch_started_at)
        throw new HttpsError('failed-precondition', 'Almoço já iniciado ou jornada encerrada.');
      tx.update(docRef, { lunch_started_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp() });
    });
    return { ok: true };
  }
  if (action === 'lunchEnd') {
    await db.runTransaction(async (tx) => {
      const live = await tx.get(docRef);
      if (!live.exists || !live.data().lunch_started_at || live.data().lunch_ended_at || live.data().ended_at)
        throw new HttpsError('failed-precondition', 'Almoço ainda não iniciado ou já encerrado.');
      tx.update(docRef, { lunch_ended_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp() });
    });
    return { ok: true };
  }
  if (action === 'end') {
    if (jornada.lunch_started_at && !jornada.lunch_ended_at)
      throw new HttpsError('failed-precondition', 'Finalize o almoço antes de encerrar a jornada.');
    const active = await db.collection('motoboy_assignments').where('assigned_to', '==', userId).where('status', 'in', ['pending', 'accepted']).limit(1).get();
    if (!active.empty) throw new HttpsError('failed-precondition', 'Ainda existem corridas pendentes ou em andamento.');
    const odometer = asReading(request.data?.odometer);
    if (odometer < jornada.start_odometer) throw new HttpsError('invalid-argument', 'Odômetro final inferior ao inicial.');
    const photoPath = request.data?.photoPath;
    if (photoPath === jornada.start_photo_path) throw new HttpsError('invalid-argument', 'Envie uma nova foto de encerramento.');
    const validated = await verifyOdometer(userId, photoPath, odometer);
    const result = await db.runTransaction(async (tx) => {
      const live = await tx.get(docRef);
      if (!live.exists || live.data().ended_at) throw new HttpsError('failed-precondition', 'Jornada já encerrada.');
      if (odometer < live.data().start_odometer) throw new HttpsError('invalid-argument', 'Leitura final inválida.');
      const totalKm = Math.round((odometer - live.data().start_odometer) * 10) / 10;
      tx.update(docRef, {
        ended_at: FieldValue.serverTimestamp(), end_odometer: odometer,
        end_photo_path: photoPath, end_ocr_reading: validated.reading,
        end_ai_verified: true, odometer_km: totalKm, updated_at: FieldValue.serverTimestamp(),
      });
      return totalKm;
    });
    return { ok: true, day: date, odometerKm: result };
  }
  throw new HttpsError('invalid-argument', 'Ação de jornada desconhecida.');
});
