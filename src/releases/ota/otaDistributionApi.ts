import { getFunctions, httpsCallable } from 'firebase/functions';

import app from '@/lib/firebase';

import type { SignedOtaRelease } from './otaSecurity';

interface OtaListRequest {
  nativeCode: number;
}

interface OtaListResponse {
  enabled: boolean;
  releases: SignedOtaRelease[];
}

const listOtaReleases = httpsCallable<OtaListRequest, OtaListResponse>(
  getFunctions(app, 'southamerica-east1'),
  'japanflowListOtaReleases',
  {
    timeout: 15000,
  }
);

export async function fetchDistributedOtaReleases(nativeCode: number): Promise<SignedOtaRelease[]> {
  if (!Number.isSafeInteger(nativeCode) || nativeCode < 18) {
    return [];
  }

  const response = await listOtaReleases({
    nativeCode,
  });

  if (response.data.enabled !== true) {
    return [];
  }

  if (!Array.isArray(response.data.releases) || response.data.releases.length > 10) {
    throw new Error('Invalid OTA distribution response');
  }

  return response.data.releases;
}
