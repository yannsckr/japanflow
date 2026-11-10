import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, limit, type Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useApp } from '@/contexts/AppContext';

type Occurrence = {
  id: string;
  ride_id?: string;
  category?: string;
  message?: string;
  user_id?: string;
  status?: string;
  created_at?: Timestamp;
};
export default function CosmosOccurrencesPage() {
  const { currentUser } = useApp();
  const allowed =
    currentUser?.role === 'admin' ||
    (currentUser?.sectors || []).some((s) => s === 'ti' || s === 'expedicao');
  const [items, setItems] = useState<Occurrence[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!allowed) return;
    return onSnapshot(
      query(collection(db, 'motoboy_occurrences'), orderBy('created_at', 'desc'), limit(100)),
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setError('');
      },
      (err) => setError(`Falha ao carregar ocorrências: ${err.message}`)
    );
  }, [allowed]);
  if (!allowed) return <p className="p-6">Você não tem permissão para consultar ocorrências.</p>;
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-6">
      <h1 className="text-2xl font-semibold">Ocorrências COSMOS</h1>
      <p className="text-sm text-muted-foreground">
        Relatos enviados por motoboys durante entregas.
      </p>
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      {items.length === 0 && <p>Nenhuma ocorrência registrada.</p>}
      {items.map((item) => (
        <article key={item.id} className="rounded-xl border p-4">
          <div className="flex flex-wrap justify-between gap-2">
            <strong>{item.category || 'Ocorrência'}</strong>
            <small>{item.created_at?.toDate?.().toLocaleString('pt-BR') || 'Sem data'}</small>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm">{item.message}</p>
          <p className="mt-3 text-xs text-muted-foreground">
            Corrida: {item.ride_id || '—'} · Enviado por: {item.user_id || '—'}
          </p>
        </article>
      ))}
    </main>
  );
}
