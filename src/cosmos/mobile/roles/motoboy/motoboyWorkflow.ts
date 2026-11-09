import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { uploadImage } from '@/lib/uploadImage';

// Mesma coleção e transições usadas em Departamental -> Motoboys.
// A transação evita aceitar/finalizar registros já alterados por outro cliente.
export async function startRide(rideId: string, userId: string) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'motoboy_assignments', rideId);
    const snapshot = await tx.get(ref);
    if (!snapshot.exists()) throw new Error('A corrida não existe mais.');
    const data = snapshot.data();
    if (data.assigned_to !== userId) throw new Error('Esta corrida não está atribuída a você.');
    if (data.status !== 'pending') throw new Error('A corrida já foi atualizada.');
    tx.update(ref, {
      status: 'accepted',
      accepted_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
  });
}

export async function finishRide(rideId: string, userId: string, file: File) {
  if (!file.type.startsWith('image/'))
    throw new Error('Envie uma foto válida da notinha assinada.');
  if (file.size > 12 * 1024 * 1024) throw new Error('A foto deve ter no máximo 12 MB.');
  // Conferir antes do upload para evitar anexos de corridas inválidas.
  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(doc(db, 'motoboy_assignments', rideId));
    if (
      !snapshot.exists() ||
      snapshot.data().assigned_to !== userId ||
      snapshot.data().status !== 'accepted'
    )
      throw new Error('Esta corrida não está em andamento para sua conta.');
  });
  const { publicUrl } = await uploadImage(file, {
    pathPrefix: 'receipts',
    sourceTable: 'motoboy_assignments',
    sourceId: rideId,
    sourceField: 'notes',
    uploadedBy: userId,
  });
  if (!publicUrl) throw new Error('Falha ao salvar o comprovante.');
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'motoboy_assignments', rideId);
    const snapshot = await tx.get(ref);
    if (
      !snapshot.exists() ||
      snapshot.data().assigned_to !== userId ||
      snapshot.data().status !== 'accepted'
    )
      throw new Error('A corrida foi modificada enquanto a foto era enviada.');
    const notes = String(snapshot.data().notes || '').trim();
    tx.update(ref, {
      status: 'completed',
      proof_url: publicUrl,
      notes: `${notes ? notes + '\n' : ''}Cupom: ${publicUrl}`,
      completed_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
  });
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
