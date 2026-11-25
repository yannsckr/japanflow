import { describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  registerPlugin: () => ({}),
}));

vi.mock('../otaNativeSecurity', () => ({
  hasNativeOtaSecurity: () => false,
}));

import {
  isValidNativeSequenceState,
  canAttemptNativeSequence,
  getNativeSequenceState,
  type NativeOtaSequenceState,
} from '../otaNativeSequence';

const initial: NativeOtaSequenceState = {
  acceptedSequence: 0,
  attemptedSequence: 0,
  pendingSequence: 0,
  pendingBundleId: '',
};

const installed: NativeOtaSequenceState = {
  ...initial,
  acceptedSequence: 10,
  attemptedSequence: 10,
};

describe('JapanFlow native OTA sequences', () => {
  it('accepts the initial state', () => {
    expect(isValidNativeSequenceState(initial)).toBe(true);
  });

  it('allows the first sequence', () => {
    expect(canAttemptNativeSequence(initial, 1)).toBe(true);
  });

  it('rejects an installed sequence', () => {
    expect(canAttemptNativeSequence(installed, 10)).toBe(false);
  });

  it('rejects older sequences', () => {
    expect(canAttemptNativeSequence(installed, 9)).toBe(false);
  });

  it('allows newer sequences', () => {
    expect(canAttemptNativeSequence(installed, 11)).toBe(true);
  });

  it('rejects a failed attempted sequence', () => {
    expect(
      canAttemptNativeSequence(
        {
          ...installed,
          attemptedSequence: 11,
        },
        11
      )
    ).toBe(false);
  });

  it('allows a release after a failed sequence', () => {
    expect(
      canAttemptNativeSequence(
        {
          ...installed,
          attemptedSequence: 11,
        },
        12
      )
    ).toBe(true);
  });

  it('blocks updates during pending activation', () => {
    expect(
      canAttemptNativeSequence(
        {
          ...installed,
          attemptedSequence: 11,
          pendingSequence: 11,
          pendingBundleId: 'bundle-test',
        },
        12
      )
    ).toBe(false);
  });

  it('rejects inconsistent sequence state', () => {
    expect(
      isValidNativeSequenceState({
        ...initial,
        acceptedSequence: 20,
        attemptedSequence: 10,
      })
    ).toBe(false);
  });

  it('rejects negative sequence state', () => {
    expect(
      isValidNativeSequenceState({
        ...initial,
        attemptedSequence: -1,
      })
    ).toBe(false);
  });

  it('rejects missing pending bundle identity', () => {
    expect(
      isValidNativeSequenceState({
        ...initial,
        attemptedSequence: 1,
        pendingSequence: 1,
      })
    ).toBe(false);
  });

  it('rejects orphaned pending bundle identities', () => {
    expect(
      isValidNativeSequenceState({
        ...initial,
        pendingBundleId: 'orphan',
      })
    ).toBe(false);
  });

  it('rejects unsafe sequence numbers', () => {
    expect(canAttemptNativeSequence(initial, Number.MAX_SAFE_INTEGER + 1)).toBe(false);
  });

  it('fails closed without native support', async () => {
    expect(await getNativeSequenceState()).toBeNull();
  });
});
