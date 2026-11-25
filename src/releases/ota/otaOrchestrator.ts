import { OTA_POLICY } from './otaPolicy';
import { selectOtaRelease, type OtaDeviceContext } from './otaReleaseSelector';
import type { SignedOtaRelease } from './otaSecurity';

export type OtaCheckResult =
  | { status: 'disabled' }
  | { status: 'busy' }
  | { status: 'throttled' }
  | { status: 'unavailable' }
  | { status: 'up-to-date' }
  | { status: 'error' }
  | {
      status: 'available';
      release: SignedOtaRelease;
    };

export interface OtaOrchestratorDependencies {
  enabled: () => boolean;
  getDevice: () => Promise<OtaDeviceContext | null>;
  fetchReleases: () => Promise<SignedOtaRelease[]>;
  now?: () => number;
}

export function createOtaOrchestrator(dependencies: OtaOrchestratorDependencies) {
  let checking = false;
  let lastCheck: number | null = null;

  const now = dependencies.now ?? Date.now;

  async function check(): Promise<OtaCheckResult> {
    if (!dependencies.enabled()) {
      return { status: 'disabled' };
    }

    if (checking) {
      return { status: 'busy' };
    }

    const timestamp = now();

    if (
      lastCheck !== null &&
      timestamp >= lastCheck &&
      timestamp - lastCheck < OTA_POLICY.checkIntervalMs
    ) {
      return { status: 'throttled' };
    }

    checking = true;
    lastCheck = timestamp;

    try {
      const device = await dependencies.getDevice();

      if (!device) {
        return { status: 'unavailable' };
      }

      const releases = await dependencies.fetchReleases();

      const release = await selectOtaRelease(releases, device);

      if (!dependencies.enabled()) {
        return { status: 'disabled' };
      }

      if (!release) {
        return { status: 'up-to-date' };
      }

      return {
        status: 'available',
        release,
      };
    } catch (error) {
      console.warn('[JapanFlow OTA] Release check failed', error);

      return { status: 'error' };
    } finally {
      checking = false;
    }
  }

  return { check };
}
