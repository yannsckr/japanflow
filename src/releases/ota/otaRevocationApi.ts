import { getFunctions, httpsCallable } from 'firebase/functions';
import app from '@/lib/firebase';
const revoke = httpsCallable<{ draftId: string }, { revoked: boolean }>(
  getFunctions(app, 'southamerica-east1'),
  'japanflowRevokeOtaRelease'
);
export async function revokeOtaRelease(draftId: string): Promise<void> {
  const response = await revoke({ draftId });
  if (response.data.revoked !== true) throw new Error('Revocation not confirmed');
}
