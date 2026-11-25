import { getFunctions, httpsCallable } from 'firebase/functions';
import app from '@/lib/firebase';
const publish = httpsCallable<
  { draftId: string; targetUserIds: string[] },
  { published: boolean; sequence: number; bundleVersion: string }
>(getFunctions(app, 'southamerica-east1'), 'japanflowPublishOtaRelease', { timeout: 190000 });
export async function publishOtaRelease(draftId: string, targetUserIds: string[]) {
  const { data } = await publish({ draftId, targetUserIds });
  if (data.published !== true || !Number.isSafeInteger(data.sequence) || data.sequence <= 0)
    throw new Error('Invalid publication response');
  return data;
}
