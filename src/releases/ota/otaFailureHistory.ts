const FAILURE_KEY = 'japanflow:ota:failures:v1';

export interface OtaFailureRecord {
  sequence: number;
  failedAt: number;
}

function validRecord(value: unknown): value is OtaFailureRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.sequence === 'number' &&
    Number.isSafeInteger(record.sequence) &&
    record.sequence > 0 &&
    typeof record.failedAt === 'number' &&
    Number.isSafeInteger(record.failedAt) &&
    record.failedAt > 0
  );
}

export function readOtaFailures(): OtaFailureRecord[] | null {
  try {
    const raw = localStorage.getItem(FAILURE_KEY);

    if (raw === null) return [];

    const data: unknown = JSON.parse(raw);

    if (!Array.isArray(data) || !data.every(validRecord)) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

export function rememberOtaFailure(sequence: number): void {
  if (!Number.isSafeInteger(sequence) || sequence <= 0) {
    throw new Error('Invalid OTA failure sequence');
  }

  const previous = readOtaFailures();

  if (previous === null) {
    throw new Error('OTA failure history unavailable');
  }

  if (previous.some((item) => item.sequence === sequence)) return;

  const records = [
    ...previous,
    {
      sequence,
      failedAt: Date.now(),
    },
  ];

  const serialized = JSON.stringify(records);

  localStorage.setItem(FAILURE_KEY, serialized);

  if (localStorage.getItem(FAILURE_KEY) !== serialized) {
    throw new Error('OTA failure persistence failed');
  }
}

export function failedOtaSequences(): number[] | null {
  const records = readOtaFailures();

  if (records === null) return null;

  return records.map((item) => item.sequence);
}
