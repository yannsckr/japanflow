import { OTA_PUBLIC_KEY } from './otaPublicKey';
import { isValidOtaManifest, type OtaManifest } from './otaManifest';

export interface SignedOtaRelease {
  manifest: OtaManifest;
  downloadUrl: string;
  sequence: number;
  expiresAt: number;
  targetUserIds: string[];
  signature: string;
}

export function canonicalPayload(release: SignedOtaRelease): string {
  const m = release.manifest;

  return JSON.stringify([
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
  ]);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

export function isTrustedDownloadUrl(value: string, storagePath: string): boolean {
  try {
    const url = new URL(value);
    const expectedPath =
      '/v0/b/japanflow-erp.firebasestorage.app/o/' + encodeURIComponent(storagePath);

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

export async function verifySignedRelease(
  release: SignedOtaRelease,
  publicKey = OTA_PUBLIC_KEY
): Promise<boolean> {
  try {
    if (
      !isValidOtaManifest(release.manifest) ||
      release.manifest.status !== 'published' ||
      !Number.isSafeInteger(release.sequence) ||
      release.sequence <= 0 ||
      !Number.isSafeInteger(release.expiresAt) ||
      release.expiresAt <= Date.now() ||
      !Array.isArray(release.targetUserIds) ||
      release.targetUserIds.length > 250 ||
      !release.targetUserIds.every((id) => typeof id === 'string' && id.length > 0) ||
      !isTrustedDownloadUrl(release.downloadUrl, release.manifest.storagePath)
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
      fromBase64(release.signature),
      new TextEncoder().encode(canonicalPayload(release))
    );
  } catch {
    return false;
  }
}
