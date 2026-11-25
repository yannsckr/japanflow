import { beforeEach, describe, expect, it } from 'vitest';
import {
  isValidActivationRecord,
  readActivationJournal,
  writeActivationJournal,
  reconcileActivation,
  type OtaActivationRecord,
} from '../otaActivationJournal';

const record: OtaActivationRecord = {
  schemaVersion: 1,
  bundleId: 'bundle-test',
  bundleVersion: '48.0.1',
  sequence: 1,
  sha256: 'a'.repeat(64),
  status: 'downloaded',
  updatedAt: 100000,
};

describe('JapanFlow OTA activation journal', () => {
  beforeEach(() => {
    localStorage.removeItem('japanflow:ota:activation:v1');
  });

  it('recognizes a valid activation record', () => {
    expect(isValidActivationRecord(record)).toBe(true);
  });

  it('starts with an empty known journal', () => {
    expect(readActivationJournal()).toEqual({
      known: true,
      record: null,
    });
  });

  it('persists and reads an activation record', () => {
    writeActivationJournal(record);

    expect(readActivationJournal()).toEqual({
      known: true,
      record,
    });
  });

  it('rejects malformed checksums', () => {
    expect(
      isValidActivationRecord({
        ...record,
        sha256: 'invalid',
      })
    ).toBe(false);
  });

  it('rejects invalid sequences', () => {
    expect(
      isValidActivationRecord({
        ...record,
        sequence: -1,
      })
    ).toBe(false);
  });

  it('rejects invalid status values', () => {
    expect(
      isValidActivationRecord({
        ...record,
        status: 'unknown',
      })
    ).toBe(false);
  });

  it('does not persist invalid records', () => {
    expect(() =>
      writeActivationJournal({
        ...record,
        bundleId: '',
      })
    ).toThrow();
  });

  it('fails closed on corrupted storage', () => {
    localStorage.setItem('japanflow:ota:activation:v1', '{invalid');

    expect(readActivationJournal().known).toBe(false);
  });

  it('confirms a successfully started bundle', () => {
    expect(
      reconcileActivation({ ...record, status: 'activating' }, record.bundleId, true).status
    ).toBe('confirmed');
  });

  it('detects a return to another bundle', () => {
    expect(reconcileActivation({ ...record, status: 'activating' }, 'builtin', true).status).toBe(
      'failed'
    );
  });

  it('waits for successful startup confirmation', () => {
    expect(
      reconcileActivation({ ...record, status: 'activating' }, record.bundleId, false).status
    ).toBe('activating');
  });

  it('preserves a downloaded package', () => {
    expect(reconcileActivation(record, 'builtin', true)).toEqual(record);
  });

  it('preserves a previously failed update', () => {
    const failed = {
      ...record,
      status: 'failed' as const,
    };

    expect(reconcileActivation(failed, 'builtin', true)).toEqual(failed);
  });
});
