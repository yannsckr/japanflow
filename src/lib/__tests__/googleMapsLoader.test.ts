// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ready = () => {
  const maps = Object.fromEntries(
    ['Map', 'Marker', 'Geocoder', 'Polyline', 'LatLngBounds', 'Size', 'Point'].map((name) => [
      name,
      class {},
    ])
  );
  Reflect.set(window, 'google', { maps });
  return maps;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  Reflect.deleteProperty(window, 'google');
  Reflect.deleteProperty(window, '__japanFlowGoogleMapsReady');
  document
    .querySelectorAll('script[src*="maps.googleapis.com/maps/api/js"]')
    .forEach((script) => script.remove());
});

describe('Google Maps shared loader', () => {
  it('waits for constructors after script load and shares a single script', async () => {
    const { loadJapanFlowGoogleMaps } = await import('../googleMapsLoader');
    const first = loadJapanFlowGoogleMaps('test-key');
    const second = loadJapanFlowGoogleMaps('test-key');
    const scripts = document.querySelectorAll('script[src*="maps.googleapis.com/maps/api/js"]');
    expect(scripts).toHaveLength(1);
    scripts[0].dispatchEvent(new Event('load'));
    const maps = ready();
    await vi.advanceTimersByTimeAsync(200);
    await expect(first).resolves.toBe(maps);
    await expect(second).resolves.toBe(maps);
    await expect(loadJapanFlowGoogleMaps('test-key')).resolves.toBe(maps);
  });

  it('retries a network error without retaining the failed script', async () => {
    const { loadJapanFlowGoogleMaps } = await import('../googleMapsLoader');
    const result = loadJapanFlowGoogleMaps('test-key');
    const selector = 'script[src*="maps.googleapis.com/maps/api/js"]';
    document.querySelector(selector)?.dispatchEvent(new Event('error'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(document.querySelectorAll(selector)).toHaveLength(1);
    const maps = ready();
    await vi.advanceTimersByTimeAsync(200);
    await expect(result).resolves.toBe(maps);
  });

  it('does not inject a second script on a slow initialization', async () => {
    const { loadJapanFlowGoogleMaps } = await import('../googleMapsLoader');
    const result = loadJapanFlowGoogleMaps('test-key');
    await vi.advanceTimersByTimeAsync(21000);
    expect(
      document.querySelectorAll('script[src*="maps.googleapis.com/maps/api/js"]')
    ).toHaveLength(1);
    const maps = ready();
    await vi.advanceTimersByTimeAsync(200);
    await expect(result).resolves.toBe(maps);
  });
});
