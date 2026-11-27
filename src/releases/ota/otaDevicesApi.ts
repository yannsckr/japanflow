import { getFunctions, httpsCallable } from 'firebase/functions';
import app from '@/lib/firebase';
export type OtaDevice = {
  id: string;
  userId: string;
  nativeVersion: string;
  nativeCode: number;
  bundleVersion: string;
  lastSeen: number;
};
export const otaDevices = httpsCallable<
  Record<string, unknown>,
  { ok?: boolean; devices?: OtaDevice[] }
>(getFunctions(app, 'southamerica-east1'), 'japanflowOtaDevices');
