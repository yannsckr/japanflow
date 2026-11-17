import { describe, expect, it } from 'vitest';
import { summarizeJourneyGps, type JourneyGpsPoint } from '../motoboyJourneyGps';

const p = (lat: number, at: number, day = '2026-11-17'): JourneyGpsPoint => ({
  lat,
  lng: -45.88,
  accuracy: 3,
  timestamp: at,
  day,
});

describe('trilha de jornada sem kilometros duplicados', () => {
  it('nao soma salto de 10 minutos quando GPS fica indisponivel', () => {
    const start = 1_763_400_000_000;
    const result = summarizeJourneyGps([
      p(-23.2, start),
      p(-23.199, start + 20_000),
      p(-23.195, start + 620_000),
    ]);
    expect(result.validSegments).toBe(1);
    expect(result.gaps).toBe(1);
    expect(result.distanceKm).toBeGreaterThan(0);
    expect(result.distanceKm).toBeLessThan(1);
  });
  it('nao liga dois dias diferentes num mesmo segmento', () => {
    const start = 1_763_400_000_000;
    const result = summarizeJourneyGps([p(-23.2, start), p(-23.199, start + 20_000, '2026-11-18')]);
    expect(result.distanceKm).toBe(0);
    expect(result.gaps).toBe(1);
  });
  it('ignora movimentos estacionarios', () => {
    const start = 1_763_400_000_000;
    const result = summarizeJourneyGps([p(-23.2, start), p(-23.2, start + 20_000)]);
    expect(result.distanceKm).toBe(0);
    expect(result.validSegments).toBe(0);
  });
});
