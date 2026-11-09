import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type Ride = {
  id: string;
  assignedTo: string;
  clientName: string;
  location: string;
  description: string;
  status: string;
  createdAt: string;
  acceptedAt: string | null;
  completedAt: string | null;
  scheduledFor: string | null;
  routeId: string | null;
  routeOrder: number | null;
  rideValue: number;
  proofUrl: string | null;
  notes: string | null;
  taskId: string | null;
};
const timeString = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function')
    return value.toDate().toISOString();
  return null;
};
export function useMotoboyRides(userId?: string) {
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!userId) {
      setRides([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    return onSnapshot(
      query(collection(db, 'motoboy_assignments'), where('assigned_to', '==', userId)),
      (snapshot) => {
        setRides(
          snapshot.docs.map((record) => {
            const data = record.data();
            return {
              id: record.id,
              assignedTo: String(data.assigned_to || ''),
              clientName: String(data.client_name || ''),
              location: String(data.location || ''),
              description: String(data.description || ''),
              status: String(data.status || 'pending'),
              createdAt: timeString(data.created_at) || '',
              acceptedAt: timeString(data.accepted_at),
              completedAt: timeString(data.completed_at),
              scheduledFor: timeString(data.scheduled_for),
              routeId: typeof data.route_id === 'string' ? data.route_id : null,
              routeOrder: typeof data.route_order === 'number' ? data.route_order : null,
              rideValue: Number(data.ride_value || 0),
              proofUrl: typeof data.proof_url === 'string' ? data.proof_url : null,
              notes: typeof data.notes === 'string' ? data.notes : null,
              taskId: typeof data.task_id === 'string' ? data.task_id : null,
            };
          })
        );
        setLoading(false);
      },
      (reason) => {
        console.error('Corridas motoboy:', reason);
        setError('Não foi possível sincronizar corridas.');
        setLoading(false);
      }
    );
  }, [userId]);
  const grouped = useMemo(() => {
    const sorted = [...rides].sort(
      (a, b) =>
        (a.routeOrder ?? 9999) - (b.routeOrder ?? 9999) ||
        (a.scheduledFor || a.createdAt).localeCompare(b.scheduledFor || b.createdAt)
    );
    return {
      all: sorted,
      pending: sorted.filter((r) => r.status === 'pending'),
      active: sorted.filter((r) => r.status === 'accepted'),
      scheduled: sorted.filter((r) => r.status === 'pending_approval'),
      completed: sorted.filter((r) => r.status === 'completed'),
      route: sorted.filter((r) => ['pending', 'accepted'].includes(r.status)),
    };
  }, [rides]);
  return { ...grouped, loading, error };
}
