export const OTA_COLLECTION = 'japanflow_ota_releases';

export const OTA_STORAGE_PREFIX = 'japanflow/ota';

export const OTA_MIN_NATIVE_CODE = 18;

export const OTA_MAX_BYTES = 100 * 1024 * 1024;

export type OtaChannel = 'stable' | 'beta';

export type OtaStatus = 'draft' | 'published' | 'revoked';

export interface OtaManifest {
  schemaVersion: 1;
  bundleVersion: string;
  platform: 'android';
  title: string;
  notes: string;
  channel: OtaChannel;
  status: OtaStatus;
  minNativeCode: number;
  maxNativeCode: number;
  sha256: string;
  sizeBytes: number;
  storagePath: string;
}

export function isValidBundleVersion(value: string): boolean {
  return /^[0-9]{1,6}[.][0-9]{1,6}[.][0-9]{1,6}$/.test(value);
}

export function isValidSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

export function isNativeCompatible(
  nativeCode: number,
  manifest: Pick<OtaManifest, 'minNativeCode' | 'maxNativeCode'>
): boolean {
  return (
    Number.isSafeInteger(nativeCode) &&
    Number.isSafeInteger(manifest.minNativeCode) &&
    Number.isSafeInteger(manifest.maxNativeCode) &&
    manifest.minNativeCode >= OTA_MIN_NATIVE_CODE &&
    manifest.maxNativeCode >= manifest.minNativeCode &&
    nativeCode >= manifest.minNativeCode &&
    nativeCode <= manifest.maxNativeCode
  );
}

export function isValidOtaManifest(value: OtaManifest): boolean {
  return (
    value.schemaVersion === 1 &&
    value.platform === 'android' &&
    isValidBundleVersion(value.bundleVersion) &&
    value.title.trim().length > 0 &&
    value.title.length <= 160 &&
    value.notes.trim().length > 0 &&
    value.notes.length <= 10000 &&
    ['stable', 'beta'].includes(value.channel) &&
    ['draft', 'published', 'revoked'].includes(value.status) &&
    isNativeCompatible(value.minNativeCode, value) &&
    isValidSha256(value.sha256) &&
    Number.isSafeInteger(value.sizeBytes) &&
    value.sizeBytes > 0 &&
    value.sizeBytes <= OTA_MAX_BYTES &&
    /^japanflow[/]ota[/][A-Za-z0-9_-]+[/][a-f0-9-]{36}[.]zip$/.test(value.storagePath)
  );
}
