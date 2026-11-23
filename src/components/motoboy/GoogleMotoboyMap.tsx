import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { MapPin, RefreshCcw, Maximize2, Minimize2 } from 'lucide-react';

type Rider = { id: string; name: string };
type Geo = { lat: number; lng: number };
type Session = Geo & { userId: string; updatedAt: number; accuracy: number | null };
type MapInstance = {
  setCenter: (value: Geo) => void;
  panTo: (value: Geo) => void;
  setZoom: (value: number) => void;
};
type MarkerInstance = {
  setPosition: (value: Geo) => void;
  setMap: (value: MapInstance | null) => void;
};
type MapsApi = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => MapInstance;
  Marker: new (options: Record<string, unknown>) => MarkerInstance;
};

const googleApi = () => (window as unknown as { google?: { maps: MapsApi } }).google?.maps;
let mapsLoad: Promise<MapsApi> | null = null;
function loadGoogleMaps(key: string): Promise<MapsApi> {
  if (googleApi()?.Map) return Promise.resolve(googleApi()!);
  if (mapsLoad) return mapsLoad;
  mapsLoad = new Promise<MapsApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly`;
    script.onload = () => {
      if (googleApi()?.Map) resolve(googleApi()!);
      else reject(new Error('Google Maps não inicializou.'));
    };
    script.onerror = () => reject(new Error('Não foi possível carregar a API do Google Maps.'));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    mapsLoad = null;
    throw error;
  });
  return mapsLoad;
}

function LiveMap({ point, label }: { point: Session; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef<Geo>({ lat: point.lat, lng: point.lng });
  latest.current = { lat: point.lat, lng: point.lng };
  const map = useRef<MapInstance | null>(null);
  const marker = useRef<MarkerInstance | null>(null);
  const [error, setError] = useState('');
  const key = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
  useEffect(() => {
    if (!key) {
      setError('Chave VITE_GOOGLE_MAPS_BROWSER_KEY não configurada.');
      return;
    }
    let cancelled = false;
    loadGoogleMaps(key)
      .then((maps) => {
        if (cancelled || !host.current) return;
        const first = latest.current;
        map.current = new maps.Map(host.current, {
          center: first,
          zoom: 16,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        marker.current = new maps.Marker({ map: map.current, position: first, title: label });
        setError('');
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Falha no Google Maps.');
      });
    return () => {
      cancelled = true;
      marker.current?.setMap(null);
      marker.current = null;
      map.current = null;
    };
    // O mapa é criado uma vez; atualizações de posição são tratadas abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    const next = { lat: point.lat, lng: point.lng };
    marker.current?.setPosition(next);
    map.current?.panTo(next);
  }, [point.lat, point.lng]);
  return (
    <div className="relative h-full min-h-[420px] w-full">
      <div
        ref={host}
        className="h-full min-h-[420px] w-full"
        aria-label={`Mapa em tempo real de ${label}`}
      />
      {error && (
        <div
          role="alert"
          className="absolute inset-0 flex items-center justify-center bg-background/95 p-6 text-center text-sm text-destructive"
        >
          {error}
        </div>
      )}
    </div>
  );
}

/**
 * Exibe a última localização autorizada, sem remontar o mapa a cada atualização.
 * Firestore fornece eventos ao vivo; a frequência real depende da coleta do Android.
 */
export default function GoogleMotoboyMap({
  selectedId,
  motoboys,
  enabled,
}: {
  selectedId: string;
  motoboys: Rider[];
  enabled: boolean;
}) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState('');
  const [focusId, setFocusId] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!enabled) {
      setSessions([]);
      return;
    }
    return onSnapshot(
      collection(db, 'motoboy_live_sessions'),
      (snapshot) => {
        setError('');
        setSessions(
          snapshot.docs.flatMap((row) => {
            const v = row.data();
            if (
              typeof v.lat !== 'number' ||
              typeof v.lng !== 'number' ||
              !Number.isFinite(v.lat) ||
              !Number.isFinite(v.lng) ||
              Math.abs(v.lat) > 90 ||
              Math.abs(v.lng) > 180
            )
              return [];
            return [
              {
                userId: String(v.user_id || row.id),
                lat: v.lat,
                lng: v.lng,
                accuracy:
                  typeof v.accuracy === 'number' && Number.isFinite(v.accuracy) ? v.accuracy : null,
                updatedAt: v.updated_at?.toMillis?.() || 0,
              },
            ];
          })
        );
      },
      () => {
        setError('Sem acesso às localizações ou falha de conexão.');
        setSessions([]);
      }
    );
  }, [enabled]);
  const available = useMemo(
    () => sessions.filter((s) => motoboys.some((m) => m.id === s.userId)),
    [sessions, motoboys]
  );
  const focus =
    selectedId !== 'all'
      ? selectedId
      : available.some((s) => s.userId === focusId)
        ? focusId
        : available[0]?.userId;
  const session = available.find((s) => s.userId === focus);
  const name = motoboys.find((m) => m.id === focus)?.name || 'Motoboy';
  const ageMinutes = session?.updatedAt
    ? Math.max(0, Math.floor((clock - session.updatedAt) / 60000))
    : null;
  const fresh =
    !!session?.updatedAt && clock - session.updatedAt >= 0 && clock - session.updatedAt < 120000;
  if (!enabled)
    return (
      <div className="flex h-full min-h-[420px] items-center justify-center p-4 text-center text-xs text-muted-foreground">
        Mapa restrito à gestão autorizada.
      </div>
    );
  return (
    <div
      className={
        fullscreen
          ? 'fixed inset-0 z-[100] flex min-w-0 flex-col bg-background shadow-2xl'
          : 'flex h-full min-w-0 flex-col'
      }
    >
      <div className="flex items-center justify-end gap-2 border-b border-border bg-card p-2">
        <span className="mr-auto text-xs text-muted-foreground">
          Posições recebidas do GPS do motoboy
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => setFullscreen((v) => !v)}
        >
          {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          {fullscreen ? 'Fechar tela cheia' : 'Tela cheia'}
        </Button>
      </div>
      {selectedId === 'all' && available.length > 1 && (
        <div className="flex flex-wrap gap-1.5 border-b border-border p-2">
          {available.map((s) => (
            <Button
              key={s.userId}
              type="button"
              size="sm"
              variant={focus === s.userId ? 'default' : 'outline'}
              onClick={() => setFocusId(s.userId)}
            >
              {motoboys.find((m) => m.id === s.userId)?.name || 'Motoboy'}
            </Button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="p-3 text-xs text-destructive">
          {error}
        </p>
      )}
      {session && !fresh && (
        <p
          role="status"
          className="border-b border-border px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
        >
          GPS sem atualização recente · exibindo última posição conhecida
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        {session ? (
          <LiveMap key={session.userId} point={session} label={name} />
        ) : (
          <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-2 bg-muted/20 p-5 text-center">
            <MapPin className="h-7 w-7 text-primary" />
            <p className="text-sm font-medium">Sem posição GPS disponível</p>
            <p className="text-xs text-muted-foreground">
              Selecione um motoboy com localização registrada.
            </p>
          </div>
        )}
      </div>
      <p className="flex items-center gap-2 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        <RefreshCcw className="h-3 w-3" />
        {session
          ? `${name} · ${fresh ? 'leitura recente' : `posição de há ${ageMinutes ?? '?'} min`} · ${session.accuracy === null ? 'precisão desconhecida' : `precisão ±${Math.round(session.accuracy)} m`} · ${session.updatedAt ? new Date(session.updatedAt).toLocaleString('pt-BR') : 'horário não registrado'}`
          : 'Aguardando GPS'}
      </p>
    </div>
  );
}
