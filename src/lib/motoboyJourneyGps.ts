import { dayInSaoPaulo, measureGpsSegment, type GpsSample } from '@/lib/motoboyTelemetry';

export type JourneyGpsPoint = GpsSample & { day: string };
export type JourneyGpsSummary = {
  distanceKm: number;
  validSegments: number;
  gaps: number;
  rejectedSegments: number;
};

export function cleanJourneyGpsPoint(position: {
  latitude: number;
  longitude: number;
  accuracy: number;
  time: number | null;
}): JourneyGpsPoint | null {
  const timestamp =
    typeof position.time === 'number' && position.time > 0 ? position.time : Date.now();
  const point = {
    lat: position.latitude,
    lng: position.longitude,
    accuracy: position.accuracy,
    timestamp,
  };
  if (
    ![point.lat, point.lng, point.accuracy, point.timestamp].every(Number.isFinite) ||
    Math.abs(point.lat) > 90 ||
    Math.abs(point.lng) > 180 ||
    point.accuracy < 0 ||
    point.accuracy > 50 ||
    Math.abs(point.timestamp - Date.now()) > 2 * 60 * 1000
  )
    return null;
  return { ...point, day: dayInSaoPaulo(new Date(point.timestamp)) };
}

/** Nao cria trecho imaginario quando perde GPS ou atravessa dias. */
export function summarizeJourneyGps(points: JourneyGpsPoint[]): JourneyGpsSummary {
  const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);
  let meters = 0;
  let validSegments = 0;
  let gaps = 0;
  let rejectedSegments = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1],
      next = sorted[i];
    if (prev.day !== next.day) {
      gaps++;
      continue;
    }
    const segment = measureGpsSegment(prev, next);
    if (segment.accepted) {
      meters += segment.meters;
      validSegments++;
    } else if (segment.reason === 'time') gaps++;
    else if (segment.reason !== 'stationary') rejectedSegments++;
  }
  return { distanceKm: Math.round(meters / 10) / 100, validSegments, gaps, rejectedSegments };
}
