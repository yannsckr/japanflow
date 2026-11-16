import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import {
  Clock3,
  ExternalLink,
  Gauge,
  ImageIcon,
  MapPinned,
  PackageCheck,
  Route,
  ShieldAlert,
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MotoboyRouteMap } from '@/components/MotoboyRouteMap';
import { measureGpsSegment, type GpsSample } from '@/lib/motoboyTelemetry';
import type { MotoboyAssignment } from '@/hooks/useDepartmental';

type Point = { lat: number; lng: number; accuracy: number; at: number };
const dateTime = (value: string | null) =>
  value
    ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : 'Não registrado';

export default function MotoboyRideDetailsDialog({
  ride,
  onClose,
}: {
  ride: MotoboyAssignment | null;
  onClose: () => void;
}) {
  const [points, setPoints] = useState<Point[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [proofPreviewOpen, setProofPreviewOpen] = useState(false);

  useEffect(() => {
    if (!ride) {
      setPoints([]);
      setError('');
      return;
    }
    setPoints([]);
    setError('');
    setLoading(true);
    return onSnapshot(
      query(collection(db, 'motoboy_telemetry'), where('ride_id', '==', ride.id)),
      (snapshot) => {
        const received = snapshot.docs
          .map((d) => d.data())
          .map((p) => ({
            lat: Number(p.lat),
            lng: Number(p.lng),
            accuracy: Number(p.accuracy),
            at: Number(p.client_at),
          }))
          .filter(
            (p) =>
              [p.lat, p.lng, p.accuracy, p.at].every(Number.isFinite) &&
              Math.abs(p.lat) <= 90 &&
              Math.abs(p.lng) <= 180 &&
              p.accuracy >= 0 &&
              p.accuracy <= 50
          )
          .sort((a, b) => a.at - b.at);
        setPoints(received);
        setLoading(false);
      },
      () => {
        setError('Telemetria indisponível ou acesso não autorizado.');
        setLoading(false);
      }
    );
  }, [ride?.id]);

  const stats = useMemo(() => {
    let meters = 0;
    let gaps = 0;
    points.forEach((p, i) => {
      if (!i) return;
      const previous: GpsSample = { ...points[i - 1], timestamp: points[i - 1].at };
      const current: GpsSample = { ...p, timestamp: p.at };
      const segment = measureGpsSegment(previous, current);
      if (segment.accepted) meters += segment.meters;
      else if (segment.reason === 'time') gaps++;
    });
    return { meters, gaps };
  }, [points]);

  return (
    <>
      <Dialog
        open={!!ride}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent className="flex max-h-[92vh] max-w-4xl flex-col overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Route className="h-5 w-5 text-primary" /> Detalhes da corrida
              </DialogTitle>
              {ride?.proofUrl && (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setProofPreviewOpen(true)}
                  >
                    <ImageIcon className="h-4 w-4" /> Visualizar notinha
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    onClick={() =>
                      window.open(ride.proofUrl || '', '_blank', 'noopener,noreferrer')
                    }
                  >
                    <ExternalLink className="h-4 w-4" /> Abrir
                  </Button>
                </div>
              )}
            </div>
          </DialogHeader>
          <div className="min-h-0 space-y-4 overflow-y-auto px-5 pb-5">
            <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
              <p className="text-sm font-semibold text-foreground">
                {ride?.clientName || ride?.description || 'Corrida'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {ride?.location || 'Endereço não registrado'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {[
                { label: 'Início', value: dateTime(ride?.acceptedAt || null), Icon: Clock3 },
                {
                  label: 'Entrega',
                  value: dateTime(ride?.completedAt || null),
                  Icon: PackageCheck,
                },
                {
                  label: 'Km GPS validado',
                  value:
                    points.length > 1 ? `${(stats.meters / 1000).toFixed(2)} km` : 'Indisponível',
                  Icon: Gauge,
                },
                { label: 'Amostras GPS', value: String(points.length), Icon: MapPinned },
              ].map(({ label, value, Icon }) => (
                <div key={label} className="rounded-xl border border-border/70 bg-card p-3">
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Icon className="h-3.5 w-3.5 text-primary" /> {label}
                  </p>
                  <p className="mt-1 break-words text-sm font-semibold">{value}</p>
                </div>
              ))}
            </div>
            {loading && <p className="text-sm text-muted-foreground">Carregando telemetria...</p>}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {!loading && !error && points.length > 0 ? (
              <div className="space-y-2">
                <MotoboyRouteMap points={points} />
                {stats.gaps > 0 && (
                  <p className="flex items-center gap-2 text-xs text-amber-600">
                    <ShieldAlert className="h-4 w-4" /> {stats.gaps} intervalo(s) sem GPS. Distância
                    parcial, não utilizar sozinha no fechamento.
                  </p>
                )}
              </div>
            ) : !loading && !error ? (
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                Sem trilha GPS registrada para esta corrida.
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              O percurso exibido usa amostras GPS reais, não a rota estimada do Google. A distância
              exibida é parcial e não substitui o hodômetro no fechamento.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={proofPreviewOpen} onOpenChange={setProofPreviewOpen}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>Notinha da corrida</DialogTitle>
          </DialogHeader>
          <div className="max-h-[80vh] overflow-auto bg-muted/20 p-4">
            {ride?.proofUrl ? (
              <img
                src={ride.proofUrl}
                alt="Comprovante da corrida"
                className="mx-auto max-h-[72vh] w-auto rounded-lg border bg-background shadow-sm"
              />
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum comprovante disponível.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
