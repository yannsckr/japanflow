import { beforeEach, describe, expect, it } from 'vitest';

import { readOtaFailures, rememberOtaFailure, failedOtaSequences } from '../otaFailureHistory';

const key = 'japanflow:ota:failures:v1';

describe('JapanFlow OTA failure history', () => {
  beforeEach(() => {
    localStorage.removeItem(key);
  });

  it('starts with an empty history', () => {
    expect(readOtaFailures()).toEqual([]);
  });

  it('persists failed sequences', () => {
    rememberOtaFailure(2);

    expect(failedOtaSequences()).toEqual([2]);
  });

  it('does not duplicate failures', () => {
    rememberOtaFailure(2);
    rememberOtaFailure(2);

    expect(failedOtaSequences()).toEqual([2]);
  });

  it('preserves multiple failed sequences', () => {
    rememberOtaFailure(2);
    rememberOtaFailure(4);

    expect(failedOtaSequences()).toEqual([2, 4]);
  });

  it('rejects invalid sequences', () => {
    expect(() => rememberOtaFailure(-1)).toThrow();
  });

  it('detects corrupted storage', () => {
    localStorage.setItem(key, '{invalid');

    expect(readOtaFailures()).toBeNull();
  });

  it('does not overwrite corrupted history', () => {
    localStorage.setItem(key, '{invalid');

    expect(() => rememberOtaFailure(2)).toThrow();

    expect(localStorage.getItem(key)).toBe('{invalid');
  });
});
