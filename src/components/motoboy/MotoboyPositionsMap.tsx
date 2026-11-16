import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { db } from '@/lib/firebase';
import 'leaflet/dist/leaflet.css';

type Session = {
  id: string;
  userId: string;
  lat: number;
  lng: number;
  updatedAt: number;
  phase: string;
};
type Rider = { id: string; name: string };

function FitMarkers({ positions }: { positions: Session[] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length === 1) map.setView([positions[0].lat, positions[0].lng], 15);
    else if (positions.length > 1)
      map.fitBounds(
        positions.map((s) => [s.lat, s.lng] as [number, number]),
        { padding: [30, 30], maxZoom: 16 }
      );
    const id = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(id);
  }, [map, positions]);
  return null;
}

export default function MotoboyPositionsMap({
  selectedId,
  motoboys,
  enabled,
}: {
  selectedId: string;
  motoboys: Rider[];
  enabled: boolean;
}) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [style, setStyle] = useState<'map' | 'satellite'>('map');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      collection(db, 'motoboy_live_sessions'),
      (snap) => {
        setSessions(
          snap.docs
            .map((row) => {
              const r = row.data();
              return {
                id: row.id,
                userId: String(r.user_id || row.id),
                lat: Number(r.lat),
                lng: Number(r.lng),
                updatedAt: r.updated_at?.toMillis?.() || 0,
                phase: String(r.phase || ''),
              };
            })
            .filter(
              (s) =>
                Number.isFinite(s.lat) &&
                Number.isFinite(s.lng) &&
                Math.abs(s.lat) <= 90 &&
                Math.abs(s.lng) <= 180 &&
                s.updatedAt > 0
            )
        );
        setError(null);
      },
      () => {
        setSessions([]);
        setError('Sem permissão para visualizar o GPS ou falha de conexão.');
      }
    );
  }, [enabled]);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, []);
  const positions = useMemo(
    () => sessions.filter((s) => selectedId === 'all' || s.userId === selectedId),
    [sessions, selectedId]
  );
  const selectedName = (id: string) => motoboys.find((m) => m.id === id)?.name || 'Motoboy';

  if (!enabled)
    return (
      <div className="flex h-[360px] items-center justify-center p-5 text-center text-sm text-muted-foreground">
        Mapa disponível apenas para gestão autorizada.
      </div>
    );
  if (error)
    return (
      <div
        role="alert"
        className="flex h-[360px] items-center justify-center p-5 text-center text-sm text-destructive"
      >
        {error}
      </div>
    );
  if (!positions.length)
    return (
      <div className="flex h-[360px] items-center justify-center p-5 text-center text-sm text-muted-foreground">
        Nenhuma posição GPS registrada para a seleção atual.
      </div>
    );

  return (
    <div className="relative h-[360px] w-full sm:h-[430px]">
      <div className="absolute right-3 top-3 z-[401] flex gap-1 rounded-lg border bg-background/95 p-1 shadow-sm">
        <button
          className={`rounded px-2 py-1 text-xs ${style === 'map' ? 'bg-primary text-primary-foreground' : 'text-foreground'}`}
          onClick={() => setStyle('map')}
        >
          Mapa
        </button>
        <button
          className={`rounded px-2 py-1 text-xs ${style === 'satellite' ? 'bg-primary text-primary-foreground' : 'text-foreground'}`}
          onClick={() => setStyle('satellite')}
        >
          Satélite
        </button>
      </div>
      <MapContainer
        center={[positions[0].lat, positions[0].lng]}
        zoom={14}
        scrollWheelZoom={false}
        className="h-full w-full"
        aria-label="Mapa operacional dos motoboys"
      >
        {style === 'map' ? (
          <TileLayer
            key="map"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />
        ) : (
          <TileLayer
            key="satellite"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles &copy; Esri and its data providers"
          />
        )}
        <FitMarkers positions={positions} />
        {positions.map((s) => {
          const fresh = now >= s.updatedAt && now - s.updatedAt <= 120000;
          return (
            <CircleMarker
              key={s.id}
              center={[s.lat, s.lng]}
              radius={9}
              pathOptions={{
                color: fresh ? '#16a34a' : '#d99a19',
                fillColor: fresh ? '#22a06b' : '#d99a19',
                fillOpacity: 0.9,
                weight: 2,
              }}
            >
              <Tooltip direction="top" permanent={positions.length <= 2} offset={[0, -9]}>
                {selectedName(s.userId)} · {fresh ? 'Posição recente' : 'Última posição'} ·{' '}
                {s.phase === 'returning' ? 'Retornando' : 'Em entregas'}
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
      <span className="absolute bottom-2 left-2 z-[401] rounded bg-background/90 px-2 py-1 text-[11px] text-foreground shadow-sm">
        Verde: recente · Amarelo: desatualizado · Sem rota simulada
      </span>
    </div>
  );
}
