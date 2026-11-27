import { useEffect, useRef } from 'react';
import { journeyDay, useJourneyDay } from './useJourneyDay';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { cleanJourneyGpsPoint } from '@/lib/motoboyJourneyGps';
import { measureGpsSegment, type GpsSample } from '@/lib/motoboyTelemetry';
import { appendGpsPoint, readGpsQueue, storeGpsQueue } from '@/lib/motoboyGpsQueue';
import { subscribeNativeLocationSample } from './nativeLocation';
import { startNativeGpsTransport, stopNativeGpsTransport } from './nativeGpsTransport';
import type { Ride } from './useMotoboyRides';

/**
 * Grava pontos de uma jornada independente do numero de corridas ativas.
 * Nao inicia GPS por conta propria: respeita o opt-in e o watcher nativo existente.
 * A sessao em memoria e a contagem sao indicativas; regras do Firestore exigem jornada valida.
 */
export function useJourneyGpsRecording(userId: string | undefined, rides: Ride[]) {
  const day = useJourneyDay();
  const activeRides = rides.filter((r) => r.status === 'accepted');
  const rideIds = activeRides.map((r) => r.id);
  const ridesRef = useRef<string[]>(rideIds);
  ridesRef.current = rideIds;
  const enabled = useRef(false);
  const previous = useRef<GpsSample | null>(null);
  const lastAt = useRef(0);
  const flushRef = useRef<() => void>(() => undefined);

  // V46.2: o serviço Android é ativado somente durante jornada + consentimento.
  // Um listener de jornada no SDK nativo continua fiscalizando o estado com WebView suspenso.
  useEffect(() => {
    if (!userId) return;
    let journeyActive = false;
    let disposed = false;
    const reconcile = () => {
      if (disposed) return;
      if (journeyDay() !== day) {
        void stopNativeGpsTransport().catch(() => undefined);
        return;
      }
      const consent = localStorage.getItem(`japanflow:location-opt-in:${userId}`) === 'true';
      if (!journeyActive || !consent) {
        void stopNativeGpsTransport().catch(() => undefined);
        return;
      }
      void startNativeGpsTransport(userId).catch((error) => {
        // O watcher existente continua funcionando mesmo se o plugin native falhar.
        console.warn('[nativeGPS] indisponível, watcher anterior mantido', error);
      });
    };
    const unsubscribe = onSnapshot(
      doc(db, 'motoboy_journeys', `${userId}_${day}`),
      (snapshot) => {
        const d = snapshot.data();
        journeyActive =
          !!d?.started_at && !d?.ended_at && (!d?.lunch_started_at || !!d?.lunch_ended_at);
        reconcile();
      },
      () => {
        journeyActive = false;
        reconcile();
      }
    );
    window.addEventListener('online', reconcile);
    window.addEventListener('japanflow:gps-consent', reconcile);
    return () => {
      disposed = true;
      unsubscribe();
      window.removeEventListener('online', reconcile);
      window.removeEventListener('japanflow:gps-consent', reconcile);
      void stopNativeGpsTransport().catch(() => undefined);
    };
  }, [userId, day]);

  useEffect(() => {
    if (!userId) {
      enabled.current = false;
      return;
    }
    // A chave da jornada e definida pelo servidor na timezone de Sao Paulo.
    const journeyId = `${userId}_${day}`;
    const unsubscribe = onSnapshot(
      doc(db, 'motoboy_journeys', journeyId),
      (snapshot) => {
        const d = snapshot.data();
        enabled.current =
          !!d?.started_at && !d?.ended_at && (!d?.lunch_started_at || !!d?.lunch_ended_at);
        if (!enabled.current) previous.current = null;
        // Encerrou a jornada: nao conservar ultima posicao como se fosse rastreamento ativo.
        if (d?.ended_at) {
          storeGpsQueue(userId, []);
          void deleteDoc(doc(db, 'motoboy_live_sessions', userId)).catch(() => undefined);
        }
        if (enabled.current) flushRef.current();
      },
      () => {
        enabled.current = false;
        previous.current = null;
      }
    );
    return () => {
      enabled.current = false;
      unsubscribe();
    };
  }, [userId, day]);

  useEffect(() => {
    if (!userId) return;
    previous.current = null;
    lastAt.current = 0;
    let cancelled = false;
    let flushing = false;
    const consent = () => localStorage.getItem(`japanflow:location-opt-in:${userId}`) === 'true';
    const flush = async () => {
      if (
        cancelled ||
        journeyDay() !== day ||
        flushing ||
        !enabled.current ||
        !consent() ||
        !navigator.onLine
      )
        return;
      flushing = true;
      try {
        while (
          !cancelled &&
          journeyDay() === day &&
          enabled.current &&
          consent() &&
          navigator.onLine
        ) {
          const point = readGpsQueue(userId)[0];
          if (!point) break;
          // A jornada ativa deve corresponder ao dia da amostra.
          const activeDay = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(new Date());
          if (point.day !== activeDay) {
            storeGpsQueue(userId, readGpsQueue(userId).slice(1));
            continue;
          }
          try {
            await addDoc(collection(db, 'motoboy_journey_telemetry'), {
              user_id: userId,
              day: point.day,
              ride_id: point.rideId,
              lat: point.lat,
              lng: point.lng,
              accuracy: point.accuracy,
              client_at: point.timestamp,
              recorded_at: serverTimestamp(),
            });
            // Retira somente depois que a gravação do histórico foi confirmada.
            // A posição ao vivo é escrita pelo callback GPS, nunca pelo replay.
            storeGpsQueue(userId, readGpsQueue(userId).slice(1));
            if (point.rideId && !cancelled) {
              await addDoc(collection(db, 'motoboy_telemetry'), {
                user_id: userId,
                ride_id: point.rideId,
                day: point.day,
                lat: point.lat,
                lng: point.lng,
                accuracy: point.accuracy,
                client_at: point.timestamp,
                meters: 0,
                recorded_at: serverTimestamp(),
              }).catch((error) => {
                console.warn('[journeyGPS] falha na telemetria da corrida', error);
              });
            }
          } catch (error) {
            if ((error as { code?: string })?.code === 'permission-denied') {
              // Regras do backend rejeitaram esta amostra; não bloquear toda a fila.
              storeGpsQueue(userId, readGpsQueue(userId).slice(1));
              console.warn('[journeyGPS] amostra rejeitada pelo Firestore');
              continue;
            }
            console.warn('[journeyGPS] pendência preservada para reconexão', error);
            break;
          }
        }
      } finally {
        flushing = false;
      }
    };
    flushRef.current = () => {
      void flush();
    };
    const onOnline = () => {
      void flush();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void flush();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void flush();
    }, 30_000);
    const unsubscribe = subscribeNativeLocationSample((position) => {
      if (cancelled || journeyDay() !== day || !enabled.current || !consent()) return;
      const point = cleanJourneyGpsPoint(position);
      if (!point || point.timestamp - lastAt.current < 15000) return;
      const prev = previous.current;
      const segment = prev ? measureGpsSegment(prev, point) : null;
      previous.current = point;
      lastAt.current = point.timestamp;
      const reason = segment && 'reason' in segment ? segment.reason : null;
      // Mantém a regra vigente: ruído ou saltos não entram no percurso.
      if (reason && reason !== 'time' && reason !== 'stationary') return;
      const shouldRecordHistory = reason !== 'stationary';
      const rideId = ridesRef.current.length === 1 ? ridesRef.current[0] : null;
      // O mapa ao vivo não depende da fila de telemetria histórica.
      void setDoc(
        doc(db, 'motoboy_live_sessions', userId),
        {
          user_id: userId,
          phase: rideId ? 'delivering' : 'returning',
          lat: point.lat,
          lng: point.lng,
          accuracy: point.accuracy,
          updated_at: serverTimestamp(),
        },
        { merge: true }
      ).catch((error) => {
        console.error('[journeyGPS] falha na posicao ao vivo', error);
      });
      if (!shouldRecordHistory) return;
      appendGpsPoint(userId, { ...point, rideId });
      void flush();
    });
    void flush();
    return () => {
      cancelled = true;
      flushRef.current = () => undefined;
      unsubscribe();
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(interval);
    };
  }, [userId, day]);
}
