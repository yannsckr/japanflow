import { collection, onSnapshot, orderBy, query, limit, type Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type CosmosRelease = {
  id: string;
  version: string;
  title: string;
  notes: string;
  channel: 'stable' | 'beta';
  status: 'published' | 'draft';
  mandatory: boolean;
  downloadUrl: string;
  createdAt?: Timestamp;
  publishedAt?: Timestamp;
  createdBy?: string;
};
export const releasesCollection = () => collection(db, 'cosmos_releases');
export function subscribeCosmosReleases(
  onValue: (items: CosmosRelease[]) => void,
  onError: (e: Error) => void
) {
  return onSnapshot(
    query(releasesCollection(), orderBy('createdAt', 'desc'), limit(100)),
    (snap) => onValue(snap.docs.map((item) => ({ ...item.data(), id: item.id }) as CosmosRelease)),
    onError
  );
}
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/i, '')
      .split('-')[0]
      .split('.')
      .map((p) => Number(p));
  const left = parse(a),
    right = parse(b);
  if (![...left, ...right].every(Number.isFinite)) return 0;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff) return diff > 0 ? 1 : -1;
  }
  return 0;
}
export function validHttpsUrl(value: string) {
  if (!value) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
