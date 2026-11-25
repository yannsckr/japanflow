import { describe, expect, it } from 'vitest';
import {
  acquireUpdateLock,
  beginOperation,
  getOperationalLockState,
  withOperationalLock,
} from '../operationalLock';

describe('JapanFlow operational lock', () => {
  it('starts without active operations', () => {
    expect(getOperationalLockState()).toEqual({
      updateLocked: false,
      activeOperations: 0,
    });
  });

  it('blocks OTA during operational work', () => {
    const release = beginOperation('ride:test');

    try {
      expect(acquireUpdateLock()).toBeNull();
      expect(getOperationalLockState().activeOperations).toBe(1);
    } finally {
      release();
    }
  });

  it('allows OTA when all operations finish', () => {
    const finish = beginOperation('camera');
    finish();

    const release = acquireUpdateLock();

    try {
      expect(release).not.toBeNull();
    } finally {
      release?.();
    }
  });

  it('blocks new operations during an update', () => {
    const release = acquireUpdateLock();

    try {
      expect(() => beginOperation('ride')).toThrow();
    } finally {
      release?.();
    }
  });

  it('prevents simultaneous update locks', () => {
    const release = acquireUpdateLock();

    try {
      expect(acquireUpdateLock()).toBeNull();
    } finally {
      release?.();
    }
  });

  it('counts overlapping operations', () => {
    const a = beginOperation('camera');
    const b = beginOperation('camera');

    try {
      expect(getOperationalLockState().activeOperations).toBe(2);

      a();

      expect(getOperationalLockState().activeOperations).toBe(1);
    } finally {
      a();
      b();
    }
  });

  it('safely ignores duplicate release calls', () => {
    const a = beginOperation('camera');
    const b = beginOperation('camera');

    try {
      a();
      a();

      expect(getOperationalLockState().activeOperations).toBe(1);
    } finally {
      a();
      b();
    }
  });

  it('releases operations after successful execution', async () => {
    const result = await withOperationalLock('test', async () => 'success');

    expect(result).toBe('success');
    expect(getOperationalLockState().activeOperations).toBe(0);
  });

  it('releases operations after failure', async () => {
    await expect(
      withOperationalLock('test', async () => {
        throw new Error('Test failure');
      })
    ).rejects.toThrow('Test failure');

    expect(getOperationalLockState().activeOperations).toBe(0);
  });

  it('rejects empty operation identifiers', () => {
    expect(() => beginOperation('')).toThrow();
  });

  it('does not release a newer update with an old callback', () => {
    const first = acquireUpdateLock();

    first?.();

    const second = acquireUpdateLock();

    try {
      first?.();

      expect(getOperationalLockState().updateLocked).toBe(true);
    } finally {
      second?.();
    }
  });
});
