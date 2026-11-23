import app, { db } from '@/lib/firebase';
import { doc, getDocFromServer } from 'firebase/firestore';
import {
  couldBeCommittedDespiteError,
  isRideTransitionConfirmed,
  type TransitionAction,
} from './rideTransitionRecovery';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { uploadImage } from '@/lib/uploadImage';
import { withRideOperationLock } from './rideOperationLock';

// Mesma coleção e transições usadas em Departamental -> Motoboys.
// A transação evita aceitar/finalizar registros já alterados por outro cliente.
// Transições validadas no servidor: jornada OCR aberta e titular da corrida.
const rideTransition = httpsCallable<
  { action: 'start' | 'finish'; rideId: string; storagePath?: string; proofUrl?: string },
  { ok: boolean }
>(getFunctions(app, 'southamerica-east1'), 'motoboyRideTransition');

/** Em falha ambigua, revalida no servidor; nunca usa cache e nunca repete o comando. */
async function confirmAfterTransportFailure(
  error: unknown,
  action: TransitionAction,
  rideId: string,
  userId: string,
  proofUrl?: string
): Promise<boolean> {
  if (!couldBeCommittedDespiteError(error)) return false;
  try {
    const snapshot = await getDocFromServer(doc(db, 'motoboy_assignments', rideId));
    return (
      snapshot.exists() && isRideTransitionConfirmed(action, snapshot.data(), userId, proofUrl)
    );
  } catch (lookupError) {
    console.warn(
      '[motoboyWorkflow] não foi possível confirmar a transição no servidor',
      lookupError
    );
    return false;
  }
}

export async function startRide(rideId: string, userId: string) {
  return withRideOperationLock(rideId, async () => {
    try {
      await rideTransition({ action: 'start', rideId });
    } catch (error) {
      if (await confirmAfterTransportFailure(error, 'start', rideId, userId)) return;
      throw error;
    }
  });
}

export async function finishRide(rideId: string, userId: string, file: File) {
  return withRideOperationLock(rideId, async () => {
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
    try {
      await rideTransition({ action: 'finish', rideId, storagePath, proofUrl: publicUrl });
    } catch (error) {
      if (await confirmAfterTransportFailure(error, 'finish', rideId, userId, publicUrl)) return;
      throw error;
    }
  });
}

const sendOccurrence = httpsCallable<
  { rideId: string; category: string; message: string },
  { ok: boolean }
>(getFunctions(app, 'southamerica-east1'), 'motoboyReportOccurrence');

export async function reportRideOccurrence(
  rideId: string,
  _userId: string,
  category: string,
  message: string
) {
  if (message.trim().length < 10)
    throw new Error('Descreva o problema em pelo menos 10 caracteres.');
  await sendOccurrence({ rideId, category, message: message.trim() });
}
