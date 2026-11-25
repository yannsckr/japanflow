import { describe, expect, it } from 'vitest';
import {
  acquireUpdateLock,
  getOperationalLockState,
  registerOperationalBlocker,
} from '@/lib/operationalLock';
describe('OTA unsaved operation blocker', () => {
  it('blocks activation while a form is open', () => {
    const release = registerOperationalBlocker();
    try {
      expect(acquireUpdateLock()).toBeNull();
      expect(getOperationalLockState().activeOperations).toBe(1);
    } finally {
      release();
    }
  });
  it('keeps independent blockers and releases idempotently', () => {
    const first = registerOperationalBlocker();
    const second = registerOperationalBlocker();
    try {
      first();
      first();
      expect(acquireUpdateLock()).toBeNull();
    } finally {
      first();
      second();
    }
    const unlock = acquireUpdateLock();
    expect(unlock).not.toBeNull();
    unlock?.();
  });
});
