import { describe, expect, it } from 'vitest';
import { createIdleDetector, distanceMeters, type OtaLocationSample } from '../otaIdleWindow';

const store = {
  lat: -23.2,
  lng: -45.9,
};

const start = 1000000;

function sample(seconds: number, overrides: Partial<OtaLocationSample> = {}): OtaLocationSample {
  return {
    ...store,
    accuracy: 10,
    speedKmh: 0,
    timestamp: start + seconds * 1000,
    ...overrides,
  };
}

describe('JapanFlow smart idle window', () => {
  it('calculates zero distance at the same point', () => {
    expect(distanceMeters(store, store)).toBe(0);
  });

  it('rejects invalid coordinates', () => {
    expect(
      distanceMeters(store, {
        lat: NaN,
        lng: 0,
      })
    ).toBe(Infinity);
  });

  it('does not immediately assume idleness', () => {
    const detector = createIdleDetector(store);
    expect(detector.observe(sample(0), start).idleSeconds).toBe(0);
  });

  it('detects sixty seconds of continuous idleness', () => {
    const detector = createIdleDetector(store);

    for (let t = 0; t <= 60; t += 10) {
      detector.observe(sample(t), start + t * 1000);
    }

    expect(detector.current(start + 60000).idleSeconds).toBe(60);
  });

  it('resets the timer when movement is detected', () => {
    const detector = createIdleDetector(store);

    detector.observe(sample(0), start);
    detector.observe(sample(10), start + 10000);

    expect(detector.observe(sample(20, { speedKmh: 15 }), start + 20000).idleSeconds).toBe(0);
  });

  it('resets when the user leaves the store area', () => {
    const detector = createIdleDetector(store);

    detector.observe(sample(0), start);

    expect(detector.observe(sample(10, { lat: -23.3 }), start + 10000).idleSeconds).toBe(0);
  });

  it('rejects uncertain GPS accuracy', () => {
    const detector = createIdleDetector(store);

    expect(detector.observe(sample(0, { accuracy: 100 }), start).locationKnown).toBe(false);
  });

  it('rejects unknown speed', () => {
    const detector = createIdleDetector(store);

    expect(detector.observe(sample(0, { speedKmh: null }), start).locationKnown).toBe(false);
  });

  it('rejects old location samples', () => {
    const detector = createIdleDetector(store);

    expect(detector.observe(sample(0), start + 60000).locationKnown).toBe(false);
  });

  it('resets after an observation gap', () => {
    const detector = createIdleDetector(store);

    detector.observe(sample(0), start);
    detector.observe(sample(10), start + 10000);

    expect(detector.observe(sample(60), start + 60000).idleSeconds).toBe(0);
  });

  it('invalidates a stale idle window', () => {
    const detector = createIdleDetector(store);

    detector.observe(sample(0), start);

    expect(detector.current(start + 31000).locationKnown).toBe(false);
  });

  it('rejects duplicate timestamps', () => {
    const detector = createIdleDetector(store);

    detector.observe(sample(0), start);

    expect(detector.observe(sample(0), start).locationKnown).toBe(false);
  });

  it('clears all observations on reset', () => {
    const detector = createIdleDetector(store);

    detector.observe(sample(0), start);
    detector.reset();

    expect(detector.current(start).locationKnown).toBe(false);
  });
});
