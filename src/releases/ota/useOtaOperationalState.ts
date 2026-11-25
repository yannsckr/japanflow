import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { inspectGpsQueue } from '@/lib/motoboyGpsQueue';
import { getOperationalLockState } from '@/lib/operationalLock';
import { isOtaSupported } from './otaEngine';
import { isIdleAtStore } from './otaPolicy';
import { createIdleDetector, unknownIdleWindow, validCoordinates } from './otaIdleWindow';

interface OperationalInput {
  userId?: string;
  ridesConfirmed: boolean;
  openRides: number;
  interfaceBusy: boolean;
  onHomeScreen: boolean;
}

export type OtaReadiness =
  'unavailable' | 'waiting' | 'observing' | 'idle-at-store' | 'journey-ended';

function getStoreCoordinates() {
  const rawLat = import.meta.env.VITE_GOOGLE_STORE_LAT;
  const rawLng = import.meta.env.VITE_GOOGLE_STORE_LNG;

  if (!rawLat || !rawLng) return null;

  const point = {
    lat: Number(rawLat),
    lng: Number(rawLng),
  };

  if (!validCoordinates(point) || point.lat === 0 || point.lng === 0) return null;

  return point;
}

function getSaoPauloDay() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((part) => part.type === type)?.value;

  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function useOtaOperationalState({
  userId,
  ridesConfirmed,
  openRides,
  interfaceBusy,
  onHomeScreen,
}: OperationalInput) {
  const [readiness, setReadiness] = useState<OtaReadiness>('waiting');

  useEffect(() => {
    if (!isOtaSupported() || !userId) {
      setReadiness('unavailable');
      return;
    }

    if (!ridesConfirmed || openRides !== 0 || interfaceBusy || !onHomeScreen) {
      setReadiness('waiting');
      return;
    }

    const store = getStoreCoordinates();
    const detector = store ? createIdleDetector(store) : null;

    let disposed = false;
    let reading = false;
    let journeyKnown = false;
    let journeyOpen = true;
    let journeyPendingWrites = true;
    let day = getSaoPauloDay();

    const ready = (value: OtaReadiness) => {
      if (!disposed) setReadiness(value);
    };

    let unsubscribe: (() => void) | undefined;

    function subscribeJourney() {
      unsubscribe?.();

      journeyKnown = false;
      journeyPendingWrites = true;
      detector?.reset();

      unsubscribe = onSnapshot(
        doc(db, 'motoboy_journeys', `${userId}_${day}`),
        { includeMetadataChanges: true },
        (snapshot) => {
          if (disposed) return;

          const data = snapshot.data();

          journeyKnown = !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites;

          journeyPendingWrites = snapshot.metadata.hasPendingWrites;

          journeyOpen = !data?.started_at || !data?.ended_at;

          if (!journeyKnown || journeyPendingWrites) {
            detector?.reset();
            ready('waiting');
          }
        },
        () => {
          journeyKnown = false;
          detector?.reset();
          ready('waiting');
        }
      );
    }

    function baseReady() {
      const lock = getOperationalLockState();

      return (
        !disposed &&
        navigator.onLine &&
        document.visibilityState === 'visible' &&
        journeyKnown &&
        !journeyPendingWrites &&
        inspectGpsQueue(userId!) === 0 &&
        lock.activeOperations === 0 &&
        !lock.updateLocked
      );
    }

    function resetObservation() {
      detector?.reset();
      ready('waiting');
    }

    function check() {
      if (disposed) return;

      const today = getSaoPauloDay();

      if (today !== day) {
        day = today;
        subscribeJourney();
        resetObservation();
        return;
      }

      if (!baseReady()) {
        resetObservation();
        return;
      }

      if (!journeyOpen) {
        ready('journey-ended');
        return;
      }

      if (
        !detector ||
        !navigator.geolocation ||
        localStorage.getItem(`japanflow:location-opt-in:${userId}`) !== 'true'
      ) {
        resetObservation();
        return;
      }

      if (reading) return;

      reading = true;

      navigator.geolocation.getCurrentPosition(
        (position) => {
          reading = false;

          if (!baseReady()) {
            resetObservation();
            return;
          }

          const coords = position.coords;

          const state = detector.observe({
            lat: coords.latitude,
            lng: coords.longitude,
            accuracy: coords.accuracy,
            speedKmh: coords.speed === null ? null : coords.speed * 3.6,
            timestamp: position.timestamp,
          });

          const eligible = isIdleAtStore({
            ...state,
            serverConfirmed: ridesConfirmed,
            internetConnected: navigator.onLine,
            journeyKnown,
            journeyOpen,
            openRides,
            pendingWrites: 0,
            pendingGpsRecords: 0,
            operationBusy: false,
            foreground: true,
          });

          ready(eligible ? 'idle-at-store' : 'observing');
        },
        () => {
          reading = false;
          resetObservation();
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 8000,
        }
      );
    }

    subscribeJourney();

    const interval = window.setInterval(check, 10000);

    const visibilityChanged = () => {
      resetObservation();
      if (document.visibilityState === 'visible') check();
    };

    document.addEventListener('visibilitychange', visibilityChanged);

    window.addEventListener('offline', resetObservation);
    window.addEventListener('online', check);

    check();

    return () => {
      disposed = true;
      unsubscribe?.();
      detector?.reset();
      window.clearInterval(interval);

      document.removeEventListener('visibilitychange', visibilityChanged);

      window.removeEventListener('offline', resetObservation);
      window.removeEventListener('online', check);
    };
  }, [userId, ridesConfirmed, openRides, interfaceBusy, onHomeScreen]);

  return {
    readiness,
    // Diagnostic only. Native queues and durable activation
    // protection must be verified before enabling distribution.
    activationAuthorized: false,
    unknownLocation: unknownIdleWindow,
  };
}
