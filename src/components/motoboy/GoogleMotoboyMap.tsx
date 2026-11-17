import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { MapPin, RefreshCcw, Maximize2, Minimize2, Route } from 'lucide-react';
import { MotoboyRouteMap } from '@/components/MotoboyRouteMap';

type Rider = { id: string; name: string };
type Session = { userId: string; lat: number; lng: number; updatedAt: number };
type RoutePoint = { lat: number; lng: number; accuracy: number; at: number };

/**
 * Mapa operacional com fallback para Google Maps e exibição do traçado GPS em tempo real.
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
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [routeError, setRouteError] = useState('');

  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      collection(db, 'motoboy_live_sessions'),
      (snapshot) => {
        setError('');
        setSessions(
          snapshot.docs.flatMap((row) => {
            const v = row.data();
            const lat = Number(v.lat);
            const lng = Number(v.lng);
            if (
              typeof v.lat !== 'number' ||
              typeof v.lng !== 'number' ||
              !Number.isFinite(lat) ||
              !Number.isFinite(lng) ||
              Math.abs(lat) > 90 ||
              Math.abs(lng) > 180
            ) {
              return [];
            }
            return [
              {
                userId: String(v.user_id || row.id),
                lat,
                lng,
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
  const fresh = !!session?.updatedAt && Date.now() - session.updatedAt < 120000;
  const url = session
    ? `https://maps.google.com/maps?q=${encodeURIComponent(`${session.lat},${session.lng}`)}&z=15&output=embed`
    : '';

  useEffect(() => {
    if (!enabled || !focus) {
      setRoutePoints([]);
      setRouteError('');
      return;
    }

    return onSnapshot(
      query(collection(db, 'motoboy_journey_telemetry'), where('user_id', '==', focus)),
      (snapshot) => {
        const today = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Sao_Paulo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date());
        const points = snapshot.docs
          .map((doc) => doc.data())
          .filter((p) => p.day === today)
          .map((p) => ({
            lat: Number(p.lat),
            lng: Number(p.lng),
            accuracy: Number(p.accuracy ?? 0),
            at: Number(p.client_at ?? p.timestamp ?? 0),
          }))
          .filter(
            (p) =>
              Number.isFinite(p.lat) &&
              Number.isFinite(p.lng) &&
              Number.isFinite(p.at) &&
              Math.abs(p.lat) <= 90 &&
              Math.abs(p.lng) <= 180
          )
          .sort((a, b) => a.at - b.at)
          .slice(-250);
        setRouteError('');
        setRoutePoints(points);
      },
      () => {
        setRouteError('Não foi possível carregar o traçado GPS deste motoboy.');
        setRoutePoints([]);
      }
    );
  }, [enabled, focus]);

  if (!enabled) {
    return (
      <div className="flex h-full min-h-[420px] items-center justify-center p-4 text-center text-xs text-muted-foreground">
        Mapa restrito à gestão autorizada.
      </div>
    );
  }

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
          Duplo clique para ampliar a visualização
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => setFullscreen((v) => !v)}
        >
          {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}{' '}
          {fullscreen ? 'Fechar tela cheia' : 'Tela cheia'}
        </Button>
      </div>

      {selectedId === 'all' && available.length > 1 && (
        <div className="flex flex-wrap gap-1.5 border-b border-border p-2">
          {available.map((s) => (
            <Button
              type="button"
              size="sm"
              key={s.userId}
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
      {routeError && (
        <p role="alert" className="px-3 pt-3 text-xs text-muted-foreground">
          {routeError}
        </p>
      )}

      <div
        className={fullscreen ? 'min-h-0 flex-1 overflow-hidden' : 'min-h-0 flex-1 overflow-hidden'}
      >
        {routePoints.length > 1 ? (
          <div className="h-full min-h-[420px] overflow-hidden p-3">
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Route className="h-3.5 w-3.5 text-primary" /> Traçado em tempo real de {name}
            </div>
            <div className="h-[calc(100%-24px)] min-h-[380px] overflow-hidden rounded-xl">
              <MotoboyRouteMap points={routePoints} />
            </div>
          </div>
        ) : session ? (
          <div
            className={
              fullscreen ? 'relative h-full min-h-0 flex-1' : 'relative h-full min-h-[420px]'
            }
          >
            <iframe
              key={`${session.userId}-${session.lat}-${session.lng}`}
              title={`Google Maps - ${name}`}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="h-full min-h-[420px] w-full border-0"
              src={url}
            />
            {!fullscreen && (
              <div
                role="button"
                tabIndex={0}
                aria-label="Ampliar mapa com duplo clique"
                title="Duplo clique para ampliar; clique no botão Tela cheia para interagir"
                className="absolute inset-0 cursor-zoom-in"
                onDoubleClick={() => setFullscreen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setFullscreen(true);
                }}
              />
            )}
          </div>
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
          ? `${name} · ${fresh ? 'leitura recente' : 'última leitura (pode estar desatualizada)'} · ${session.updatedAt ? new Date(session.updatedAt).toLocaleString('pt-BR') : 'horário não registrado'}`
          : 'Aguardando GPS'}
        {' · mapa operacional'}
      </p>
    </div>
  );
}
