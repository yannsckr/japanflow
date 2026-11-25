import {
  protectedPayload,
  isValidProtectedMetadata,
  type ProtectedBundleMetadata,
} from './otaProtectedProtocol';
import { OTA_PUBLIC_KEY } from './otaPublicKey';
import { isValidOtaManifest, type OtaManifest } from './otaManifest';

export interface SignedOtaRelease {
  manifest: OtaManifest;
  downloadUrl: string;
  sequence: number;
  expiresAt: number;
  targetUserIds: string[];
  signature: string;
  protectedBundle?: ProtectedBundleMetadata;
  protectedStoragePath?: string;
  protectedGeneration?: string;
}

export function canonicalPayload(release: SignedOtaRelease): string {
  const m = release.manifest;

  const payload = [
    'japanflow-ota-v1',
    'com.japanflow.mobile',
    m.schemaVersion,
    m.bundleVersion,
    m.platform,
    m.title,
    m.notes,
    m.channel,
    m.status,
    m.minNativeCode,
    m.maxNativeCode,
    m.sha256,
    m.sizeBytes,
    m.storagePath,
    release.downloadUrl,
    release.sequence,
    release.expiresAt,
    release.targetUserIds,
  ];

  if (release.protectedBundle !== undefined) {
    payload[0] = 'japanflow-ota-v2';
    return JSON.stringify([
      ...payload,
      protectedPayload(release.protectedBundle),
      release.protectedStoragePath,
      release.protectedGeneration,
    ]);
  }

  return JSON.stringify(payload);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

export function isTrustedDownloadUrl(value: string, storagePath: string): boolean {
  try {
    const url = new URL(value);
    const expectedPath =
      '/v0/b/japanflow-erp.firebasestorage.app/o/' + encodeURIComponent(storagePath);

    if (url.hostname === 'storage.googleapis.com') {
      return (
        url.protocol === 'https:' &&
        !url.port &&
        !url.username &&
        !url.password &&
        !url.hash &&
        decodeURIComponent(url.pathname) === '/japanflow-erp.firebasestorage.app/' + storagePath &&
        url.searchParams.get('X-Goog-Algorithm') === 'GOOG4-RSA-SHA256' &&
        /^[0-9]+$/.test(url.searchParams.get('generation') ?? '') &&
        !!url.searchParams.get('X-Goog-Signature')
      );
    }

    return (
      url.protocol === 'https:' &&
      url.hostname === 'firebasestorage.googleapis.com' &&
      url.port === '' &&
      !url.username &&
      !url.password &&
      !url.hash &&
      url.pathname === expectedPath &&
      url.searchParams.get('alt') === 'media'
    );
  } catch {
    return false;
  }
}

export function isTrustedProtectedUrl(release: SignedOtaRelease): boolean {
  try {
    const path = release.protectedStoragePath;
    const generation = release.protectedGeneration;
    if (
      typeof path !== 'string' ||
      !/^japanflow\/ota-protected\/[A-Za-z0-9_-]{1,128}\/[a-f0-9-]{36}\.bundle$/.test(path) ||
      typeof generation !== 'string' ||
      !/^[0-9]+$/.test(generation) ||
      !release.protectedBundle ||
      release.protectedBundle.encryptedSizeBytes !==
        (Math.floor(release.manifest.sizeBytes / 16) + 1) * 16
    )
      return false;
    const url = new URL(release.downloadUrl);
    return (
      url.hostname === 'storage.googleapis.com' &&
      isTrustedDownloadUrl(release.downloadUrl, path) &&
      url.searchParams.getAll('generation').length === 1 &&
      url.searchParams.get('generation') === generation
    );
  } catch {
    return false;
  }
}

export async function verifySignedRelease(
  release: SignedOtaRelease,
  publicKey = OTA_PUBLIC_KEY
): Promise<boolean> {
  try {
    if (
      !isValidOtaManifest(release.manifest) ||
      (release.protectedBundle !== undefined &&
        !isValidProtectedMetadata(release.protectedBundle)) ||
      release.manifest.status !== 'published' ||
      !Number.isSafeInteger(release.sequence) ||
      release.sequence <= 0 ||
      !Number.isSafeInteger(release.expiresAt) ||
      release.expiresAt <= Date.now() ||
      !Array.isArray(release.targetUserIds) ||
      release.targetUserIds.length > 250 ||
      !release.targetUserIds.every((id) => typeof id === 'string' && id.length > 0) ||
      !(release.protectedBundle !== undefined
        ? isTrustedProtectedUrl(release)
        : isTrustedDownloadUrl(release.downloadUrl, release.manifest.storagePath))
    )
      return false;

    if (!/^[A-Za-z0-9+/]{86}==$/.test(release.signature)) return false;
    const signatureBytes = fromBase64(release.signature);
    if (
      signatureBytes.length !== 64 ||
      btoa(String.fromCharCode(...signatureBytes)) !== release.signature
    )
      return false;

    const key = await crypto.subtle.importKey(
      'spki',
      fromBase64(publicKey),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );

    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      signatureBytes,
      new TextEncoder().encode(canonicalPayload(release))
    );
  } catch {
    return false;
  }
}
