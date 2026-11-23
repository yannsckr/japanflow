import { describe, expect, it } from 'vitest';
import { sanitizeGpsQueue, validPendingPoint } from '../motoboyGpsQueue';
const now = 1_795_436_000_000;
const point = (timestamp: number) => ({
  day: '2026-11-23',
  lat: -23.18,
  lng: -45.88,
  accuracy: 8,
  timestamp,
  rideId: null,
});
describe('V46.1 fila GPS', () => {
  it('rejeita amostras antigas, irreais e imprecisas', () => {
    expect(validPendingPoint(point(now - 25 * 3600_000), now)).toBe(false);
    expect(validPendingPoint({ ...point(now), lat: 200 }, now)).toBe(false);
    expect(validPendingPoint({ ...point(now), accuracy: 51 }, now)).toBe(false);
    expect(validPendingPoint(point(now - 1_000), now)).toBe(true);
  });
  it('limita a fila a 240 pontos, sem timestamps duplicados', () => {
    const points = Array.from({ length: 260 }, (_, i) => point(now - 300_000 + i * 1_000));
    const output = sanitizeGpsQueue([...points, points[259]], now);
    expect(output).toHaveLength(240);
    expect(output[0].timestamp).toBe(points[20].timestamp);
  });
});
