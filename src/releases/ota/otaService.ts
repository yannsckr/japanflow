import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';

import { OTA_COLLECTION, isValidOtaManifest, type OtaManifest } from './otaManifest';

export interface OtaRelease extends OtaManifest {
  id: string;
  createdBy: string;
  createdAt?: Timestamp;
}

const otaCollection = () => collection(db, OTA_COLLECTION);

export function subscribeOtaReleases(
  onValue: (releases: OtaRelease[]) => void,
  onError: (error: Error) => void
) {
  return onSnapshot(
    query(otaCollection(), orderBy('createdAt', 'desc'), limit(100)),
    (snapshot) =>
      onValue(
        snapshot.docs.map(
          (item) =>
            ({
              ...item.data(),
              id: item.id,
            }) as OtaRelease
        )
      ),
    onError
  );
}

export async function createOtaDraft(manifest: OtaManifest, userId: string): Promise<string> {
  const draft: OtaManifest = {
    schemaVersion: manifest.schemaVersion,
    bundleVersion: manifest.bundleVersion,
    platform: manifest.platform,
    title: manifest.title.trim(),
    notes: manifest.notes.trim(),
    channel: manifest.channel,
    status: 'draft',
    minNativeCode: manifest.minNativeCode,
    maxNativeCode: manifest.maxNativeCode,
    sha256: manifest.sha256,
    sizeBytes: manifest.sizeBytes,
    storagePath: manifest.storagePath,
  };

  if (!userId || !isValidOtaManifest(draft)) {
    throw new Error('Invalid OTA manifest');
  }

  if (!draft.storagePath.startsWith(`japanflow/ota/${userId}/`)) {
    throw new Error('Invalid OTA storage owner');
  }

  const document = await addDoc(otaCollection(), {
    ...draft,
    createdBy: userId,
    createdAt: serverTimestamp(),
  });

  return document.id;
}
