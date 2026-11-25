import { verifySignedRelease, type SignedOtaRelease } from './otaSecurity';
import { isEligibleForOta } from './otaPolicy';
import { isValidBundleVersion } from './otaManifest';

export interface OtaDeviceContext {
  userId: string;
  nativeCode: number;
  currentBundleVersion: string;
  lastAcceptedSequence: number;
  failedSequences: number[];
}

export function compareBundleVersions(first: string, second: string): number {
  if (!isValidBundleVersion(first) || !isValidBundleVersion(second)) {
    throw new Error('Invalid bundle version');
  }

  const a = first.split('.').map(Number);
  const b = second.split('.').map(Number);

  for (let index = 0; index < 3; index++) {
    if (a[index] > b[index]) return 1;
    if (a[index] < b[index]) return -1;
  }

  return 0;
}

export function isReleaseCandidate(release: SignedOtaRelease, device: OtaDeviceContext): boolean {
  try {
    if (!isEligibleForOta(release, device)) {
      return false;
    }

    if (device.failedSequences.includes(release.sequence)) {
      return false;
    }

    if (compareBundleVersions(release.manifest.bundleVersion, device.currentBundleVersion) <= 0) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export async function selectOtaRelease(
  releases: SignedOtaRelease[],
  device: OtaDeviceContext
): Promise<SignedOtaRelease | null> {
  const candidates = releases.filter((release) => isReleaseCandidate(release, device));

  candidates.sort((a, b) => b.sequence - a.sequence);

  for (const candidate of candidates) {
    if (await verifySignedRelease(candidate)) {
      return candidate;
    }
  }

  return null;
}
