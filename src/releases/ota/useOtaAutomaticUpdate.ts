import { useEffect, useRef, useState } from 'react';
import { nativeUpdater } from '../nativeUpdater';
import { getOtaState, isOtaSupported } from './otaEngine';
import { getNativeSequenceState } from './otaNativeSequence';
import { failedOtaSequences } from './otaFailureHistory';
import { createOtaOrchestrator } from './otaOrchestrator';
import { fetchDistributedOtaReleases } from './otaDistributionApi';
import { distributeOta, OTA_DISTRIBUTION_ENABLED } from './otaDistribution';
import { canDownloadOta, type OtaOperationalState } from './otaPolicy';
import { isValidBundleVersion } from './otaManifest';
export function useOtaAutomaticUpdate(
  userId: string | undefined,
  getOperationalState: () => Promise<OtaOperationalState>
) {
  const [progress, setProgress] = useState<number | null>(null);
  const active = useRef(false);
  useEffect(() => {
    if (!OTA_DISTRIBUTION_ENABLED || !userId || !isOtaSupported()) return;
    let disposed = false;
    let nativeCode = 0;
    let accepted = 0;
    const orchestrator = createOtaOrchestrator({
      enabled: () => !disposed && OTA_DISTRIBUTION_ENABLED,
      getDevice: async () => {
        const native = await nativeUpdater.getVersion();
        const state = await getOtaState();
        const sequence = await getNativeSequenceState();
        const failed = failedOtaSequences();
        if (
          !state ||
          !sequence ||
          !failed ||
          sequence.pendingSequence !== 0 ||
          native.signingChannel !== 'release'
        )
          return null;
        const version =
          state.current.bundle.id === 'builtin' ? '0.0.0' : state.current.bundle.version;
        if (!isValidBundleVersion(version)) return null;
        nativeCode = native.versionCode;
        accepted = Math.max(sequence.acceptedSequence, sequence.attemptedSequence);
        return {
          userId,
          nativeCode,
          currentBundleVersion: version,
          lastAcceptedSequence: accepted,
          failedSequences: failed,
        };
      },
      fetchReleases: () => fetchDistributedOtaReleases(nativeCode),
    });
    async function tick() {
      if (disposed || active.current || !userId) return;
      active.current = true;
      try {
        if (!canDownloadOta(await getOperationalState()) || disposed) return;
        const result = await orchestrator.check();
        if (disposed || result.status !== 'available') return;
        await distributeOta(result.release, {
          userId,
          lastAcceptedSequence: accepted,
          getOperationalState: async () => {
            if (disposed) throw new Error('OTA session ended');
            const state = await getOperationalState();
            if (disposed) throw new Error('OTA session ended');
            return state;
          },
          onProgress: (percent) => {
            if (!disposed) setProgress(percent);
          },
        });
      } catch {
        console.warn('[JapanFlow OTA] Update deferred');
      } finally {
        active.current = false;
        if (!disposed) setProgress(null);
      }
    }
    const timer = window.setInterval(() => void tick(), 15000);
    void tick();
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [userId, getOperationalState]);
  return progress;
}
