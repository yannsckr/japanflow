import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  getPlatform: vi.fn(),
  isPluginAvailable: vi.fn(),
  current: vi.fn(),
  list: vi.fn(),
  notifyAppReady: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: mocks.isNativePlatform,
    getPlatform: mocks.getPlatform,
    isPluginAvailable: mocks.isPluginAvailable,
  },
}));

vi.mock('@capgo/capacitor-updater', () => ({
  CapacitorUpdater: {
    current: mocks.current,
    list: mocks.list,
    notifyAppReady: mocks.notifyAppReady,
  },
}));

import { isOtaSupported, getOtaState, confirmOtaStartup } from '../otaEngine';

describe('JapanFlow OTA engine', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.isNativePlatform.mockReturnValue(true);
    mocks.getPlatform.mockReturnValue('android');
    mocks.isPluginAvailable.mockReturnValue(true);

    mocks.current.mockResolvedValue({
      bundle: {
        id: 'builtin',
        version: '1.0.17',
      },
    });

    mocks.list.mockResolvedValue({
      bundles: [],
    });

    mocks.notifyAppReady.mockResolvedValue({});
  });

  it('supports Android with the native OTA plugin', () => {
    expect(isOtaSupported()).toBe(true);
  });

  it('does not support web browsers', () => {
    mocks.isNativePlatform.mockReturnValue(false);
    expect(isOtaSupported()).toBe(false);
  });

  it('does not support other native platforms', () => {
    mocks.getPlatform.mockReturnValue('ios');
    expect(isOtaSupported()).toBe(false);
  });

  it('rejects Android without the OTA plugin', () => {
    mocks.isPluginAvailable.mockReturnValue(false);
    expect(isOtaSupported()).toBe(false);
  });

  it('reads the current bundle and installed bundles', async () => {
    const state = await getOtaState();

    expect(state).not.toBeNull();
    expect(mocks.current).toHaveBeenCalledOnce();
    expect(mocks.list).toHaveBeenCalledOnce();
  });

  it('does not invoke native APIs on unsupported platforms', async () => {
    mocks.isNativePlatform.mockReturnValue(false);

    expect(await getOtaState()).toBeNull();
    expect(await confirmOtaStartup()).toBe(false);

    expect(mocks.current).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.notifyAppReady).not.toHaveBeenCalled();
  });

  it('confirms successful application startup', async () => {
    expect(await confirmOtaStartup()).toBe(true);
    expect(mocks.notifyAppReady).toHaveBeenCalledOnce();
  });

  it('propagates native startup confirmation failures', async () => {
    mocks.notifyAppReady.mockRejectedValue(new Error('Native OTA failure'));

    await expect(confirmOtaStartup()).rejects.toThrow('Native OTA failure');
  });
});
