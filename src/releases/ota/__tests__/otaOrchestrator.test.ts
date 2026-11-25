import { describe, expect, it, vi } from 'vitest';
import { createOtaOrchestrator } from '../otaOrchestrator';

const device = {
  userId: 'motoboy-test',
  nativeCode: 18,
  currentBundleVersion: '48.0.1',
  lastAcceptedSequence: 1,
  failedSequences: [],
};

function dependencies() {
  return {
    enabled: vi.fn(() => true),
    getDevice: vi.fn(async () => device),
    fetchReleases: vi.fn(async () => []),
    now: vi.fn(() => 1000000),
  };
}

describe('JapanFlow OTA orchestrator', () => {
  it('does not check while disabled', async () => {
    const deps = dependencies();
    deps.enabled.mockReturnValue(false);

    const controller = createOtaOrchestrator(deps);

    expect(await controller.check()).toEqual({
      status: 'disabled',
    });

    expect(deps.fetchReleases).not.toHaveBeenCalled();
  });

  it('reports no available updates', async () => {
    const controller = createOtaOrchestrator(dependencies());

    expect(await controller.check()).toEqual({
      status: 'up-to-date',
    });
  });

  it('limits repeated release checks', async () => {
    const deps = dependencies();
    const controller = createOtaOrchestrator(deps);

    await controller.check();

    expect(await controller.check()).toEqual({
      status: 'throttled',
    });

    expect(deps.fetchReleases).toHaveBeenCalledOnce();
  });

  it('allows a check after five minutes', async () => {
    const deps = dependencies();
    const controller = createOtaOrchestrator(deps);

    await controller.check();

    deps.now.mockReturnValue(1300000);

    await controller.check();

    expect(deps.fetchReleases).toHaveBeenCalledTimes(2);
  });

  it('prevents concurrent checks', async () => {
    const controller = createOtaOrchestrator(dependencies());

    const pending = controller.check();

    expect(await controller.check()).toEqual({
      status: 'busy',
    });

    await pending;
  });

  it('handles release query failure', async () => {
    const deps = dependencies();

    deps.fetchReleases.mockRejectedValue(new Error('Network failure'));

    const controller = createOtaOrchestrator(deps);

    expect(await controller.check()).toEqual({
      status: 'error',
    });
  });

  it('rechecks the enabled state after querying', async () => {
    const deps = dependencies();

    deps.fetchReleases.mockImplementation(async () => {
      deps.enabled.mockReturnValue(false);
      return [];
    });

    const controller = createOtaOrchestrator(deps);

    expect(await controller.check()).toEqual({
      status: 'disabled',
    });
  });
});
