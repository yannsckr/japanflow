import { getFunctions, httpsCallable } from 'firebase/functions';

import app from '@/lib/firebase';

export interface OtaPackageValidation {
  verified: boolean;
  sha256: string;
  sizeBytes: number;
  generation: string;
  entryCount: number;
  totalBytes: number;
  hasIndex: boolean;
  hasJavaScript: boolean;
}

const validatePackage = httpsCallable<{ draftId: string }, OtaPackageValidation>(
  getFunctions(app, 'southamerica-east1'),
  'japanflowValidateOtaPackage',
  { timeout: 130000 }
);

export async function validateOtaPackage(draftId: string): Promise<OtaPackageValidation> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(draftId)) {
    throw new Error('Invalid OTA draft identifier');
  }

  const response = await validatePackage({
    draftId,
  });

  const result = response.data;

  if (
    result.verified !== true ||
    result.hasIndex !== true ||
    result.hasJavaScript !== true ||
    !/^[a-f0-9]{64}$/.test(result.sha256) ||
    typeof result.generation !== 'string' ||
    !result.generation
  ) {
    throw new Error('Invalid OTA validation response');
  }

  return result;
}
