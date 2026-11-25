export interface ProtectedBundleMetadata {
  format: 'capgo-rsa-aes-v1';
  checksum: string;
  sessionKey: string;
  encryptedSha256: string;
  encryptedSizeBytes: number;
}

export function isValidProtectedMetadata(value: unknown): value is ProtectedBundleMetadata {
  if (!value || typeof value !== 'object') return false;

  const metadata = value as ProtectedBundleMetadata;

  if (
    metadata.format !== 'capgo-rsa-aes-v1' ||
    typeof metadata.checksum !== 'string' ||
    !/^[a-f0-9]{512}$/.test(metadata.checksum) ||
    typeof metadata.encryptedSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(metadata.encryptedSha256) ||
    !Number.isSafeInteger(metadata.encryptedSizeBytes) ||
    metadata.encryptedSizeBytes < 16 ||
    metadata.encryptedSizeBytes > 104857616 ||
    metadata.encryptedSizeBytes % 16 !== 0 ||
    typeof metadata.sessionKey !== 'string' ||
    metadata.sessionKey.length !== 369
  ) {
    return false;
  }

  const parts = metadata.sessionKey.split(':');

  if (parts.length !== 2) return false;

  try {
    const iv = atob(parts[0]);
    const wrapped = atob(parts[1]);

    return (
      iv.length === 16 &&
      wrapped.length === 256 &&
      btoa(iv) === parts[0] &&
      btoa(wrapped) === parts[1]
    );
  } catch {
    return false;
  }
}

export function protectedPayload(metadata: ProtectedBundleMetadata) {
  if (!isValidProtectedMetadata(metadata)) {
    throw new Error('Invalid protected bundle metadata');
  }

  return [
    metadata.format,
    metadata.checksum,
    metadata.sessionKey,
    metadata.encryptedSha256,
    metadata.encryptedSizeBytes,
  ];
}
