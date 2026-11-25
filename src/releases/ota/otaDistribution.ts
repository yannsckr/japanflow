import { recordOtaDiagnostic } from './otaDiagnostics';
import { isValidProtectedMetadata } from './otaProtectedProtocol';
import { getNativeSequenceState, canAttemptNativeSequence } from './otaNativeSequence';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { acquireUpdateLock } from '@/lib/operationalLock';
import { readActivationJournal, writeActivationJournal } from './otaActivationJournal';
import { reserveNativeActivation } from './otaActivationBridge';
import { nativeUpdater } from '../nativeUpdater';
import { isOtaSupported } from './otaEngine';
import {
  canApplyOta,
  canDownloadOta,
  isEligibleForOta,
  type OtaOperationalState,
} from './otaPolicy';
import type { SignedOtaRelease } from './otaSecurity';
import { verifyNativeOtaRelease } from './otaNativeSecurity';

export const OTA_DISTRIBUTION_ENABLED = false;

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

    if (native.signingChannel !== 'release') {
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

    if (!canDownloadOta(beforeDownload)) {
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
    const bundle = await CapacitorUpdater.download({
      url: release.downloadUrl,
      version: release.manifest.bundleVersion,
      checksum: release.protectedBundle.checksum,
      sessionKey: release.protectedBundle.sessionKey,
    });

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
    if (!canApplyOta(beforeApply)) return false;
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
    writeActivationJournal(record);
    if (!(await reserveNativeActivation(release, bundle.id))) {
      writeActivationJournal({ ...record, status: 'failed', updatedAt: Date.now() });
      return false;
    }
    // A failed or interrupted set is reconciled on the next startup.
    if (!canApplyOta(await context.getOperationalState())) {
      // Leave the reservation pending for startup reconciliation. Never activate an unsafe bundle.
      return false;
    }
    recordOtaDiagnostic('activation-requested');
    await CapacitorUpdater.set({ id: bundle.id });
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
