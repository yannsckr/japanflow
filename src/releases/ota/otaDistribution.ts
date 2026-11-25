import { CapacitorUpdater } from '@capgo/capacitor-updater';
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
  persistSequence: (sequence: number) => Promise<void>;
}

export async function distributeOta(
  release: SignedOtaRelease,
  context: OtaDistributionContext
): Promise<boolean> {
  if (!OTA_DISTRIBUTION_ENABLED || !isOtaSupported() || running) {
    return false;
  }

  running = true;

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

    const beforeDownload = await context.getOperationalState();

    if (!canDownloadOta(beforeDownload)) {
      return false;
    }

    const bundle = await CapacitorUpdater.download({
      url: release.downloadUrl,
      version: release.manifest.bundleVersion,
      checksum: release.manifest.sha256,
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

    const beforeApply = await context.getOperationalState();

    if (!canApplyOta(beforeApply)) {
      return false;
    }

    // Application remains disabled until an exclusive operational
    // lock and durable activation journal are implemented.
    return false;
  } finally {
    running = false;
  }
}
