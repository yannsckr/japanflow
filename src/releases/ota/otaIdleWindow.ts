import { OTA_POLICY } from './otaPolicy';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface OtaLocationSample extends GeoPoint {
  accuracy: number;
  speedKmh: number | null;
  timestamp: number;
}

export interface IdleWindow {
  locationKnown: boolean;
  locationAgeMs: number;
  distanceFromStoreMeters: number;
  gpsAccuracyMeters: number;
  speedKmh: number;
  idleSeconds: number;
}

export function unknownIdleWindow(): IdleWindow {
  return {
    locationKnown: false,
    locationAgeMs: Infinity,
    distanceFromStoreMeters: Infinity,
    gpsAccuracyMeters: Infinity,
    speedKmh: Infinity,
    idleSeconds: 0,
  };
}

export function validCoordinates(point: GeoPoint): boolean {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180
  );
}

export function distanceMeters(first: GeoPoint, second: GeoPoint): number {
  if (!validCoordinates(first) || !validCoordinates(second)) return Infinity;

  const radians = (value: number) => (value * Math.PI) / 180;

  const lat1 = radians(first.lat);
  const lat2 = radians(second.lat);

  const dLat = radians(second.lat - first.lat);
  const dLng = radians(second.lng - first.lng);

  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}

export function createIdleDetector(store: GeoPoint) {
  let idleSince: number | null = null;
  let lastTimestamp: number | null = null;
  let latest: IdleWindow = unknownIdleWindow();

  function reset() {
    idleSince = null;
    lastTimestamp = null;
    latest = unknownIdleWindow();
  }

  function observe(point: OtaLocationSample, now = Date.now()): IdleWindow {
    const age = now - point.timestamp;
    const distance = distanceMeters(point, store);

    const valid =
      Number.isFinite(age) &&
      age >= 0 &&
      age <= OTA_POLICY.maxLocationAgeMs &&
      Number.isFinite(point.accuracy) &&
      point.accuracy > 0 &&
      point.accuracy <= OTA_POLICY.maxGpsAccuracyMeters &&
      Number.isFinite(distance) &&
      point.speedKmh !== null &&
      Number.isFinite(point.speedKmh) &&
      point.speedKmh >= 0;

    if (!valid) {
      reset();
      return latest;
    }

    if (lastTimestamp !== null && point.timestamp <= lastTimestamp) {
      reset();
      return latest;
    }

    if (lastTimestamp !== null && point.timestamp - lastTimestamp > OTA_POLICY.maxLocationAgeMs) {
      idleSince = null;
    }

    lastTimestamp = point.timestamp;

    const speed = point.speedKmh ?? Infinity;

    const stationary =
      distance + point.accuracy <= OTA_POLICY.storeRadiusMeters &&
      speed <= OTA_POLICY.maxIdleSpeedKmh;

    if (!stationary) {
      idleSince = null;
    } else if (idleSince === null) {
      idleSince = point.timestamp;
    }

    latest = {
      locationKnown: true,
      locationAgeMs: age,
      distanceFromStoreMeters: distance,
      gpsAccuracyMeters: point.accuracy,
      speedKmh: speed,
      idleSeconds: idleSince === null ? 0 : Math.floor((point.timestamp - idleSince) / 1000),
    };

    return latest;
  }

  function current(now = Date.now()): IdleWindow {
    if (
      lastTimestamp === null ||
      now < lastTimestamp ||
      now - lastTimestamp > OTA_POLICY.maxLocationAgeMs
    ) {
      reset();
      return latest;
    }

    return {
      ...latest,
      locationAgeMs: now - lastTimestamp,
    };
  }

  return { observe, current, reset };
}
