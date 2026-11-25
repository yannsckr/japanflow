export type ActivationStatus = 'downloaded' | 'activating' | 'confirmed' | 'failed';

export interface OtaActivationRecord {
  schemaVersion: 1;
  bundleId: string;
  bundleVersion: string;
  sequence: number;
  sha256: string;
  status: ActivationStatus;
  updatedAt: number;
}

const JOURNAL_KEY = 'japanflow:ota:activation:v1';

export function isValidActivationRecord(value: unknown): value is OtaActivationRecord {
  if (!value || typeof value !== 'object') return false;

  const record = value as Record<string, unknown>;

  return (
    record.schemaVersion === 1 &&
    typeof record.bundleId === 'string' &&
    record.bundleId.length > 0 &&
    record.bundleId.length <= 128 &&
    typeof record.bundleVersion === 'string' &&
    /^[0-9]{1,6}[.][0-9]{1,6}[.][0-9]{1,6}$/.test(record.bundleVersion) &&
    typeof record.sequence === 'number' &&
    Number.isSafeInteger(record.sequence) &&
    record.sequence > 0 &&
    typeof record.sha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(record.sha256) &&
    typeof record.status === 'string' &&
    ['downloaded', 'activating', 'confirmed', 'failed'].includes(record.status) &&
    typeof record.updatedAt === 'number' &&
    Number.isSafeInteger(record.updatedAt) &&
    record.updatedAt > 0
  );
}

export type JournalResult =
  { known: true; record: OtaActivationRecord | null } | { known: false; record: null };

export function readActivationJournal(): JournalResult {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);

    if (raw === null) {
      return { known: true, record: null };
    }

    const data: unknown = JSON.parse(raw);

    if (!isValidActivationRecord(data)) {
      return { known: false, record: null };
    }

    return { known: true, record: data };
  } catch {
    return { known: false, record: null };
  }
}

export function writeActivationJournal(record: OtaActivationRecord): void {
  if (!isValidActivationRecord(record)) {
    throw new Error('Invalid OTA activation record');
  }

  const serialized = JSON.stringify(record);

  localStorage.setItem(JOURNAL_KEY, serialized);

  if (localStorage.getItem(JOURNAL_KEY) !== serialized) {
    throw new Error('OTA journal persistence failed');
  }
}

export function reconcileActivation(
  record: OtaActivationRecord,
  currentBundleId: string,
  startupConfirmed: boolean
): OtaActivationRecord {
  if (record.status !== 'activating') return record;

  if (currentBundleId !== record.bundleId) {
    return {
      ...record,
      status: 'failed',
      updatedAt: Date.now(),
    };
  }

  if (!startupConfirmed) return record;

  return {
    ...record,
    status: 'confirmed',
    updatedAt: Date.now(),
  };
}
