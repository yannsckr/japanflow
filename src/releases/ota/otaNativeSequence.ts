import { registerPlugin } from '@capacitor/core';
import { hasNativeOtaSecurity } from './otaNativeSecurity';

export interface NativeOtaSequenceState {
  acceptedSequence: number;
  attemptedSequence: number;
  pendingSequence: number;
  pendingBundleId: string;
}

interface NativeOtaSequencePlugin {
  getSequenceState(): Promise<NativeOtaSequenceState>;
}

const plugin = registerPlugin<NativeOtaSequencePlugin>('JapanFlowOtaSecurity');

export function isValidNativeSequenceState(value: unknown): value is NativeOtaSequenceState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const state = value as NativeOtaSequenceState;

  const numbers = [state.acceptedSequence, state.attemptedSequence, state.pendingSequence];

  if (
    !numbers.every((number) => Number.isSafeInteger(number) && number >= 0) ||
    state.acceptedSequence > state.attemptedSequence ||
    typeof state.pendingBundleId !== 'string'
  ) {
    return false;
  }

  if (state.pendingSequence === 0) {
    return state.pendingBundleId === '';
  }

  return (
    state.pendingSequence > state.acceptedSequence &&
    state.pendingSequence === state.attemptedSequence &&
    /^[A-Za-z0-9_-]{1,128}$/.test(state.pendingBundleId)
  );
}

export async function getNativeSequenceState(): Promise<NativeOtaSequenceState | null> {
  if (!hasNativeOtaSecurity()) {
    return null;
  }

  try {
    const state = await plugin.getSequenceState();

    return isValidNativeSequenceState(state) ? state : null;
  } catch {
    return null;
  }
}

export function canAttemptNativeSequence(state: NativeOtaSequenceState, sequence: number): boolean {
  return (
    isValidNativeSequenceState(state) &&
    Number.isSafeInteger(sequence) &&
    sequence > 0 &&
    state.pendingSequence === 0 &&
    sequence > state.acceptedSequence &&
    sequence > state.attemptedSequence
  );
}
