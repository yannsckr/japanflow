import { useEffect, useRef } from 'react';
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
import { subscribeNativeLocationSample } from './nativeLocation';
import type { Ride } from './useMotoboyRides';

/**
 * Grava pontos de uma jornada independente do numero de corridas ativas.
 * Nao inicia GPS por conta propria: respeita o opt-in e o watcher nativo existente.
 * A sessao em memoria e a contagem sao indicativas; regras do Firestore exigem jornada valida.
 */
export function useJourneyGpsRecording(userId: string | undefined, rides: Ride[]) {
  const activeRides = rides.filter((r) => r.status === 'accepted');
  const rideIds = activeRides.map((r) => r.id);
  const ridesRef = useRef<string[]>(rideIds);
  ridesRef.current = rideIds;
  const enabled = useRef(false);
  const previous = useRef<GpsSample | null>(null);
  const lastAt = useRef(0);
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    if (!userId) {
      enabled.current = false;
      return;
    }
    // A chave da jornada e definida pelo servidor na timezone de Sao Paulo.
    const now = new Date();
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    const journeyId = `${userId}_${date}`;
    const unsubscribe = onSnapshot(
      doc(db, 'motoboy_journeys', journeyId),
      (snapshot) => {
        const d = snapshot.data();
        enabled.current =
          !!d?.started_at && !d?.ended_at && (!d?.lunch_started_at || !!d?.lunch_ended_at);
        if (!enabled.current) previous.current = null;
        // Encerrou a jornada: nao conservar ultima posicao como se fosse rastreamento ativo.
        if (d?.ended_at) {
          void deleteDoc(doc(db, 'motoboy_live_sessions', userId)).catch(() => undefined);
        }
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
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    previous.current = null;
    lastAt.current = 0;
    return subscribeNativeLocationSample((position) => {
      if (!enabled.current || !localStorage.getItem(`japanflow:location-opt-in:${userId}`)) return;
      const point = cleanJourneyGpsPoint(position);
      if (!point || point.timestamp - lastAt.current < 15000) return;
      const prev = previous.current;
      const segment = prev ? measureGpsSegment(prev, point) : null;
      previous.current = point;
      lastAt.current = point.timestamp;
      if (segment && !segment.accepted && segment.reason === 'stationary') return;
      if (segment && !segment.accepted && segment.reason !== 'time') return;
      const rideId = ridesRef.current.length === 1 ? ridesRef.current[0] : null;
      queue.current = queue.current
        .catch(() => undefined)
        .then(async () => {
          await addDoc(collection(db, 'motoboy_journey_telemetry'), {
            user_id: userId,
            day: point.day,
            ride_id: rideId,
            lat: point.lat,
            lng: point.lng,
            accuracy: point.accuracy,
            client_at: point.timestamp,
            recorded_at: serverTimestamp(),
          });
          await setDoc(
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
          );
          // Por corrida: somente quando exatamente uma esta em andamento.
          // O percurso completo e armazenado separadamente para nao duplicar kilometros.
          if (rideId) {
            await addDoc(collection(db, 'motoboy_telemetry'), {
              user_id: userId,
              ride_id: rideId,
              day: point.day,
              lat: point.lat,
              lng: point.lng,
              accuracy: point.accuracy,
              client_at: point.timestamp,
              meters: 0,
              recorded_at: serverTimestamp(),
            });
          }
        })
        .catch((error) => {
          console.error('[journeyGPS] falha ao gravar amostra', error);
        });
    });
  }, [userId]);
}
