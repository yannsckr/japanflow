import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import app, { db } from '@/lib/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { uploadImage } from '@/lib/uploadImage';

// Mesma coleção e transições usadas em Departamental -> Motoboys.
// A transação evita aceitar/finalizar registros já alterados por outro cliente.
// Transições validadas no servidor: jornada OCR aberta e titular da corrida.
const rideTransition = httpsCallable<
  { action: 'start' | 'finish'; rideId: string; storagePath?: string; proofUrl?: string },
  { ok: boolean }
>(getFunctions(app, 'southamerica-east1'), 'motoboyRideTransition');

export async function startRide(rideId: string, _userId: string) {
  await rideTransition({ action: 'start', rideId });
}

export async function finishRide(rideId: string, userId: string, file: File) {
  if (!file.type.startsWith('image/'))
    throw new Error('Envie uma foto válida da notinha assinada.');
  if (file.size > 12 * 1024 * 1024) throw new Error('A foto deve ter no máximo 12 MB.');
  const { publicUrl, storagePath } = await uploadImage(file, {
    pathPrefix: 'receipts',
    sourceTable: 'motoboy_assignments',
    sourceId: rideId,
    sourceField: 'notes',
    uploadedBy: userId,
  });
  if (!publicUrl || !storagePath) throw new Error('Falha ao salvar o comprovante.');
  await rideTransition({ action: 'finish', rideId, storagePath, proofUrl: publicUrl });
}

export async function reportRideOccurrence(
  rideId: string,
  userId: string,
  category: string,
  message: string
) {
  if (message.trim().length < 10)
    throw new Error('Descreva o problema em pelo menos 10 caracteres.');
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'motoboy_assignments', rideId);
    const snapshot = await tx.get(ref);
    if (!snapshot.exists() || snapshot.data().assigned_to !== userId)
      throw new Error('Corrida não encontrada para sua conta.');
    const notes = String(snapshot.data().notes || '').trim();
    const entry = `[Ocorrência ${category} — ${new Date().toLocaleString('pt-BR')}]: ${message.trim().slice(0, 1000)}`;
    tx.update(ref, {
      notes: `${notes ? notes + '\n' : ''}${entry}`,
      updated_at: serverTimestamp(),
    });
  });
}
