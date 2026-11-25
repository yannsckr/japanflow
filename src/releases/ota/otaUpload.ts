import { ref, uploadBytesResumable } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import {
  OTA_MAX_BYTES,
  OTA_STORAGE_PREFIX,
  isValidOtaManifest,
  type OtaManifest,
} from './otaManifest';
import { createOtaDraft } from './otaService';

export type OtaDraftInput = Pick<
  OtaManifest,
  'bundleVersion' | 'title' | 'notes' | 'channel' | 'minNativeCode' | 'maxNativeCode'
>;

export async function calculateSha256(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function uploadOtaDraft(
  file: File,
  input: OtaDraftInput,
  userId: string,
  onProgress: (percent: number) => void
): Promise<string> {
  if (
    !/^[A-Za-z0-9_-]+$/.test(userId) ||
    !file.name.toLowerCase().endsWith('.zip') ||
    file.size <= 0 ||
    file.size > OTA_MAX_BYTES
  ) {
    throw new Error('Arquivo ZIP ou usuario invalido.');
  }

  const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());

  if (header[0] !== 0x50 || header[1] !== 0x4b || header[2] !== 0x03 || header[3] !== 0x04) {
    throw new Error('O arquivo nao possui um cabecalho ZIP valido.');
  }

  const manifest: OtaManifest = {
    ...input,
    title: input.title.trim(),
    notes: input.notes.trim(),
    schemaVersion: 1,
    platform: 'android',
    status: 'draft',
    sha256: await calculateSha256(file),
    sizeBytes: file.size,
    storagePath: `${OTA_STORAGE_PREFIX}/${userId}/${crypto.randomUUID()}.zip`,
  };

  if (!isValidOtaManifest(manifest)) {
    throw new Error('Dados do manifesto invalidos.');
  }

  const task = uploadBytesResumable(ref(storage, manifest.storagePath), file, {
    contentType: 'application/zip',
  });

  await new Promise<void>((resolve, reject) => {
    task.on(
      'state_changed',
      (snapshot) => {
        onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
      },
      reject,
      () => resolve()
    );
  });

  return createOtaDraft(manifest, userId);
}
