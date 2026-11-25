import { registerPlugin } from '@capacitor/core';
import { canonicalPayload, type SignedOtaRelease } from './otaSecurity';
import { hasNativeOtaSecurity } from './otaNativeSecurity';
interface ActivationPlugin {
  reserveActivation(input: {
    payload: string;
    signature: string;
    bundleId: string;
  }): Promise<{ ok: boolean }>;
  reconcileActivation(input: { currentBundleId: string }): Promise<{ ok: boolean }>;
}
const plugin = registerPlugin<ActivationPlugin>('JapanFlowOtaSecurity');
export async function reserveNativeActivation(release: SignedOtaRelease, bundleId: string) {
  if (!hasNativeOtaSecurity()) return false;
  return (
    (
      await plugin.reserveActivation({
        payload: canonicalPayload(release),
        signature: release.signature,
        bundleId,
      })
    ).ok === true
  );
}
export async function reconcileNativeActivation(currentBundleId: string) {
  if (!hasNativeOtaSecurity()) return false;
  return (await plugin.reconcileActivation({ currentBundleId })).ok === true;
}
