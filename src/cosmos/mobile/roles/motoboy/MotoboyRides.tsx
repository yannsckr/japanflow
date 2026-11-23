import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock3, CheckCircle2, MapPin } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { useMotoboyRides } from './useMotoboyRides';
import './motoboy.css';

export default function MotoboyRides() {
  const navigate = useNavigate();
  const { currentUser } = useApp();
  const { route, completed, error, loading } = useMotoboyRides(currentUser?.id);
  const today = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };
  const [selectedDay, setSelectedDay] = useState(today);
  const onDay = (ride: { scheduledFor: string | null; createdAt: string }) => {
    const raw = ride.scheduledFor || ride.createdAt;
    if (!raw) return false;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw === selectedDay;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw.slice(0, 10) === selectedDay;
    return (
      `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}` ===
      selectedDay
    );
  };
  const newestFirst = (
    a: { createdAt: string; id: string },
    b: { createdAt: string; id: string }
  ) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
  const dayRoute = route.filter(onDay).sort(newestFirst);
  const dayCompleted = completed.filter(onDay).sort(newestFirst);
  return (
    <main className="jf-moto-list">
      <button className="jf-moto-back" onClick={() => navigate('/motoboy')}>
        <ArrowLeft size={18} /> Início
      </button>
      <h1>Minhas corridas</h1>
      <div className="flex items-center flex-wrap gap-2 mb-4">
        <label className="sr-only" htmlFor="moto-ride-day">
          Dia das corridas
        </label>
        <input
          id="moto-ride-day"
          type="date"
          value={selectedDay}
          onChange={(event) => setSelectedDay(event.target.value || today())}
          className="rounded-xl border p-2 bg-transparent"
        />
        <button
          type="button"
          onClick={() => setSelectedDay(today())}
          className="rounded-xl border px-3 py-2"
        >
          Hoje
        </button>
      </div>
      {loading && <p>Sincronizando…</p>}
      {error && <p role="alert">{error}</p>}
      <section>
        <h2>
          <Clock3 size={17} className="inline mr-2" />
          Abertas ({dayRoute.length})
        </h2>
        {dayRoute.length === 0 && <p className="jf-moto-empty">Nenhuma corrida em aberto.</p>}
        {dayRoute.map((ride) => (
          <div key={ride.id} className="border rounded-xl p-4 mb-3">
            <strong>{ride.clientName || ride.description}</strong>
            <p className="text-sm text-gray-600 mt-2">
              <MapPin size={14} className="inline mr-1" />
              {ride.location || 'Sem endereço'}
            </p>
            <small className="text-red-600 font-semibold">
              {ride.status === 'accepted' ? 'Em andamento' : 'Aguardando início'}
            </small>
          </div>
        ))}
      </section>
      <section>
        <h2>
          <CheckCircle2 size={17} className="inline mr-2" />
          Concluídas ({dayCompleted.length})
        </h2>
        {dayCompleted.length === 0 && <p className="jf-moto-empty">Nenhuma corrida concluída.</p>}
        {dayCompleted.map((ride) => (
          <div key={ride.id} className="border rounded-xl p-4 mb-3">
            <strong>{ride.clientName || ride.description}</strong>
            <p className="text-sm text-gray-600">{ride.location || 'Sem endereço'}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
