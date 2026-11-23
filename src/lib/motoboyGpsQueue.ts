/** V46.1: fila pequena de localizações pendentes, isolada por usuário.
 * Apenas amostras de jornada ativa são armazenadas e reenviadas.
 * Não substitui envio nativo nem garante entrega quando o processo Android é encerrado.
 */
export type PendingGpsPoint = {
  day: string;
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
  rideId: string | null;
};

const MAX_POINTS = 240;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const key = (userId: string) => `japanflow:gps-pending:v46:${userId}`;

export function validPendingPoint(p: unknown, now = Date.now()): p is PendingGpsPoint {
  if (!p || typeof p !== 'object') return false;
  const q = p as Record<string, unknown>;
  return (
    typeof q.day === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(q.day) &&
    typeof q.lat === 'number' &&
    Number.isFinite(q.lat) &&
    Math.abs(q.lat) <= 90 &&
    typeof q.lng === 'number' &&
    Number.isFinite(q.lng) &&
    Math.abs(q.lng) <= 180 &&
    typeof q.accuracy === 'number' &&
    Number.isFinite(q.accuracy) &&
    q.accuracy >= 0 &&
    q.accuracy <= 50 &&
    typeof q.timestamp === 'number' &&
    Number.isFinite(q.timestamp) &&
    q.timestamp <= now + 120000 &&
    q.timestamp > now - MAX_AGE_MS &&
    (q.rideId === null || (typeof q.rideId === 'string' && q.rideId.length <= 160))
  );
}

export function sanitizeGpsQueue(data: unknown, now = Date.now()): PendingGpsPoint[] {
  if (!Array.isArray(data)) return [];
  const valid = data.filter((p): p is PendingGpsPoint => validPendingPoint(p, now));
  const seen = new Set<number>();
  return valid
    .filter((p) => {
      if (seen.has(p.timestamp)) return false;
      seen.add(p.timestamp);
      return true;
    })
    .slice(-MAX_POINTS);
}

export function readGpsQueue(userId: string): PendingGpsPoint[] {
  try {
    return sanitizeGpsQueue(JSON.parse(localStorage.getItem(key(userId)) || '[]'));
  } catch {
    return [];
  }
}

export function storeGpsQueue(userId: string, points: PendingGpsPoint[]): void {
  try {
    const cleaned = sanitizeGpsQueue(points);
    if (cleaned.length) localStorage.setItem(key(userId), JSON.stringify(cleaned));
    else localStorage.removeItem(key(userId));
  } catch (error) {
    console.warn('[journeyGPS] armazenamento local indisponível', error);
  }
}

export function appendGpsPoint(userId: string, point: PendingGpsPoint): void {
  storeGpsQueue(userId, [...readGpsQueue(userId), point]);
}
