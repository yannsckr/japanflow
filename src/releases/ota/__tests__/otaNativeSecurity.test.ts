import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SignedOtaRelease } from '../otaSecurity';

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  getPlatform: vi.fn(),
  isPluginAvailable: vi.fn(),
  verifySignature: vi.fn(),
  verifySignedRelease: vi.fn(),
  canonicalPayload: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: mocks.isNativePlatform,
    getPlatform: mocks.getPlatform,
    isPluginAvailable: mocks.isPluginAvailable,
  },
  registerPlugin: () => ({
    verifySignature: mocks.verifySignature,
  }),
}));

vi.mock('../otaSecurity', () => ({
  verifySignedRelease: mocks.verifySignedRelease,
  canonicalPayload: mocks.canonicalPayload,
}));

import { hasNativeOtaSecurity, verifyNativeOtaRelease } from '../otaNativeSecurity';

const release = {
  signature: 'test-signature',
} as SignedOtaRelease;

describe('JapanFlow native OTA security', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.isNativePlatform.mockReturnValue(true);
    mocks.getPlatform.mockReturnValue('android');
    mocks.isPluginAvailable.mockReturnValue(true);

    mocks.verifySignedRelease.mockResolvedValue(true);

    mocks.canonicalPayload.mockReturnValue('signed-payload');

    mocks.verifySignature.mockResolvedValue({
      verified: true,
    });
  });

  it('detects Android native security', () => {
    expect(hasNativeOtaSecurity()).toBe(true);
  });

  it('blocks web platforms', () => {
    mocks.isNativePlatform.mockReturnValue(false);

    expect(hasNativeOtaSecurity()).toBe(false);
  });

  it('blocks unsupported platforms', () => {
    mocks.getPlatform.mockReturnValue('ios');

    expect(hasNativeOtaSecurity()).toBe(false);
  });

  it('blocks installations without native plugin', async () => {
    mocks.isPluginAvailable.mockReturnValue(false);

    expect(await verifyNativeOtaRelease(release)).toBe(false);
  });

  it('requires both signature checks', async () => {
    expect(await verifyNativeOtaRelease(release)).toBe(true);

    expect(mocks.verifySignature).toHaveBeenCalledWith({
      payload: 'signed-payload',
      signature: 'test-signature',
    });
  });

  it('blocks invalid web signatures', async () => {
    mocks.verifySignedRelease.mockResolvedValue(false);

    expect(await verifyNativeOtaRelease(release)).toBe(false);

    expect(mocks.verifySignature).not.toHaveBeenCalled();
  });

  it('blocks invalid native signatures', async () => {
    mocks.verifySignature.mockResolvedValue({
      verified: false,
    });

    expect(await verifyNativeOtaRelease(release)).toBe(false);
  });

  it('fails closed when native verification throws', async () => {
    mocks.verifySignature.mockRejectedValue(new Error('Native failure'));

    expect(await verifyNativeOtaRelease(release)).toBe(false);
  });
});
