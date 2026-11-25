import { recordOtaDiagnostic } from './otaDiagnostics';
import { isValidProtectedMetadata } from './otaProtectedProtocol';
import { getNativeSequenceState, canAttemptNativeSequence } from './otaNativeSequence';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { acquireUpdateLock } from '@/lib/operationalLock';
import { readActivationJournal, writeActivationJournal } from './otaActivationJournal';
import { fetchDistributedOtaReleases } from './otaDistributionApi';
import { canonicalPayload } from './otaSecurity';
import { nativeUpdater } from '../nativeUpdater';
import { isOtaSupported } from './otaEngine';
import { canApplyOtaPilot, isEligibleForOta, type OtaOperationalState } from './otaPolicy';
import type { SignedOtaRelease } from './otaSecurity';
import { verifyNativeOtaRelease } from './otaNativeSecurity';

export const OTA_DISTRIBUTION_ENABLED = true;

let running = false;

export interface OtaDistributionContext {
  userId: string;
  lastAcceptedSequence: number;
  getOperationalState: () => Promise<OtaOperationalState>;
  onProgress?: (percent: number) => void;
}

export async function distributeOta(
  release: SignedOtaRelease,
  context: OtaDistributionContext
): Promise<boolean> {
  if (!OTA_DISTRIBUTION_ENABLED || !isOtaSupported() || running) {
    return false;
  }

  running = true;
  let unlock: (() => void) | null = null;
  let listener: { remove: () => Promise<void> } | undefined;

  try {
    if (!(await verifyNativeOtaRelease(release))) {
      return false;
    }

    const native = await nativeUpdater.getVersion();

    if (
      native.signingChannel !== 'release' ||
      native.versionCode < 19 ||
      release.manifest.channel !== 'beta' ||
      release.manifest.minNativeCode < 19
    ) {
      return false;
    }

    const device = {
      userId: context.userId,
      nativeCode: native.versionCode,
      lastAcceptedSequence: context.lastAcceptedSequence,
    };

    if (!isEligibleForOta(release, device)) {
      return false;
    }

    const sequenceState = await getNativeSequenceState();

    if (!sequenceState || !canAttemptNativeSequence(sequenceState, release.sequence)) {
      return false;
    }

    const beforeDownload = await context.getOperationalState();

    if (!canApplyOtaPilot(beforeDownload)) {
      return false;
    }

    if (!release.protectedBundle || !isValidProtectedMetadata(release.protectedBundle)) {
      return false;
    }

    listener = await CapacitorUpdater.addListener('download', (event) => {
      context.onProgress?.(Math.max(0, Math.min(100, event.percent)));
    });
    context.onProgress?.(0);
    recordOtaDiagnostic('download-start');
    const downloadOptions = {
      payload: canonicalPayload(release),
      signature: release.signature,
      url: release.downloadUrl,
      version: release.manifest.bundleVersion,
      checksum: release.protectedBundle.checksum,
      sessionKey: release.protectedBundle.sessionKey,
    };
    const bundle = await CapacitorUpdater.download(downloadOptions);

    if (!bundle.checksum || bundle.checksum.toLowerCase() !== release.manifest.sha256) {
      throw new Error('OTA checksum mismatch');
    }

    if (!(await verifyNativeOtaRelease(release))) {
      return false;
    }

    if (!isEligibleForOta(release, device)) {
      return false;
    }

    unlock = acquireUpdateLock();
    if (!unlock) return false;
    const beforeApply = await context.getOperationalState();
    if (!canApplyOtaPilot(beforeApply)) return false;
    const journal = readActivationJournal();
    if (!journal.known || journal.record?.status === 'activating') return false;
    if (!(await verifyNativeOtaRelease(release))) return false;
    const record = {
      schemaVersion: 1 as const,
      bundleId: bundle.id,
      bundleVersion: release.manifest.bundleVersion,
      sequence: release.sequence,
      sha256: release.manifest.sha256,
      status: 'activating' as const,
      updatedAt: Date.now(),
    };
    // Recheck remote authorization and revocation after download, before activation.
    const fresh = (await fetchDistributedOtaReleases(native.versionCode)).find(
      (item) =>
        item.sequence === release.sequence &&
        item.manifest.sha256 === release.manifest.sha256 &&
        item.manifest.bundleVersion === release.manifest.bundleVersion
    );
    if (!fresh || !(await verifyNativeOtaRelease(fresh)) || !isEligibleForOta(fresh, device))
      return false;
    if (!canApplyOtaPilot(await context.getOperationalState())) return false;
    writeActivationJournal(record);
    recordOtaDiagnostic('activation-requested');
    const activationOptions = {
      id: bundle.id,
      payload: canonicalPayload(fresh),
      signature: fresh.signature,
    };
    // The patched native set() verifies and reserves the real bundle atomically.
    try {
      await CapacitorUpdater.set(activationOptions);
    } catch (error) {
      const after = await getNativeSequenceState();
      if (after && after.pendingSequence === 0 && after.acceptedSequence < release.sequence) {
        writeActivationJournal({ ...record, status: 'failed', updatedAt: Date.now() });
      }
      throw error;
    }
    return true;
  } finally {
    try {
      await listener?.remove();
    } finally {
      unlock?.();
      running = false;
    }
  }
}
