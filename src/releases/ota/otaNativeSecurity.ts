import { Capacitor, registerPlugin } from '@capacitor/core';

import { canonicalPayload, verifySignedRelease, type SignedOtaRelease } from './otaSecurity';

interface NativeOtaSecurityPlugin {
  verifySignature(options: { payload: string; signature: string }): Promise<{
    verified: boolean;
  }>;
}

const nativeSecurity = registerPlugin<NativeOtaSecurityPlugin>('JapanFlowOtaSecurity');

export function hasNativeOtaSecurity(): boolean {
  return (
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === 'android' &&
    Capacitor.isPluginAvailable('JapanFlowOtaSecurity')
  );
}

export async function verifyNativeOtaRelease(release: SignedOtaRelease): Promise<boolean> {
  if (!hasNativeOtaSecurity()) {
    return false;
  }

  try {
    if (!(await verifySignedRelease(release))) {
      return false;
    }

    const response = await nativeSecurity.verifySignature({
      payload: canonicalPayload(release),
      signature: release.signature,
    });

    return response.verified === true;
  } catch {
    return false;
  }
}
