import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, type Timestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ref, uploadBytes } from 'firebase/storage';
import {
  Camera as CameraIcon,
  Check,
  Clock3,
  Coffee,
  Gauge,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import app, { db, storage } from '@/lib/firebase';
import { toast } from 'sonner';

const callJourney = httpsCallable<Record<string, unknown>, { ok?: boolean; odometerKm?: number }>(
  getFunctions(app, 'southamerica-east1'),
  'motoboyJourney'
);
type StoredTime = Timestamp | null;
type Journey = {
  started_at: StoredTime;
  ended_at: StoredTime;
  lunch_started_at: StoredTime;
  lunch_ended_at: StoredTime;
  start_odometer: number;
  end_odometer: number | null;
  odometer_km?: number;
};
const spParts = (date: Date) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, value])
  );
const spDay = (date: Date) => {
  const p = spParts(date);
  return `${p.year}-${p.month}-${p.day}`;
};
const fmtTime = (value?: StoredTime) =>
  value?.toDate?.().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }) || '—';

/** Jornada sincronizada com o servidor; foto e odômetro são obrigatórios. */
export default function MotoboyJourneyManager({
  userId,
  showActions,
  hasOpenRides,
}: {
  userId: string;
  showActions: boolean;
  hasOpenRides: boolean;
}) {
  const [now, setNow] = useState(() => new Date());
  const [journey, setJourney] = useState<Journey | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [readError, setReadError] = useState('');
  const [endOpen, setEndOpen] = useState(false);
  const [reading, setReading] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lunchBusy, setLunchBusy] = useState(false);
  const day = spDay(now);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!userId) {
      setLoaded(false);
      setJourney(null);
      return;
    }
    setLoaded(false);
    setReadError('');
    return onSnapshot(
      doc(db, 'motoboy_journeys', `${userId}_${day}`),
      (snapshot) => {
        setJourney(snapshot.exists() ? (snapshot.data() as Journey) : null);
        setLoaded(true);
        setReadError('');
      },
      () => {
        setLoaded(false);
        setReadError('Não foi possível confirmar a jornada. Verifique a conexão e as permissões.');
      }
    );
  }, [day, userId]);

  const afterSeven = Number(spParts(now).hour) >= 7;
  // Falha fechada: sem confirmação do Firestore, o app permanece bloqueado após 07h.
  const needsStart = afterSeven && !!userId && (!loaded || !journey?.started_at);
  const shouldShowPhoto = needsStart || endOpen;
  const lunchStarted = journey?.lunch_started_at;
  const lunchEnded = journey?.lunch_ended_at;
  const lunchMinutes = lunchStarted
    ? Math.floor((now.getTime() - lunchStarted.toDate().getTime()) / 60000)
    : 0;
  const lunchRemaining = Math.max(0, 60 - lunchMinutes);
  const currentOdometer = useMemo(() => Number(reading.replace(',', '.')), [reading]);

  // Evita a faixa clara causada pela rolagem da pagina atras do modal.
  useEffect(() => {
    if (!shouldShowPhoto) return;
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, [shouldShowPhoto]);

  const takeOdometerPhoto = async () => {
    setCameraBusy(true);
    try {
      const shot = await Camera.getPhoto({
        source: CameraSource.Camera,
        resultType: CameraResultType.Uri,
        quality: 82,
        allowEditing: false,
      });
      if (!shot.webPath) throw new Error('Camera sem imagem capturada');
      const response = await fetch(shot.webPath);
      if (!response.ok) throw new Error('Falha ao ler a foto capturada');
      const blob = await response.blob();
      const mime = blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const file = new File(
        [blob],
        `odometro-${Date.now()}.${mime === 'image/png' ? 'png' : 'jpg'}`,
        { type: mime }
      );
      if (file.size > 8 * 1024 * 1024) {
        toast.error('Foto acima de 8 MB. Tire outra foto.');
        return;
      }
      setPhoto(file);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/cancel|cancelad|user cancelled|user canceled/i.test(message)) {
        console.error('[motoboyJourney] camera', error);
        toast.error('Não foi possível tirar a foto.');
      }
    } finally {
      setCameraBusy(false);
    }
  };

  const submitOdometer = async () => {
    if (!photo || !/^image\/(jpeg|png|webp)$/.test(photo.type) || photo.size > 8 * 1024 * 1024) {
      toast.error('Tire uma foto JPG, PNG ou WebP de até 8 MB.');
      return;
    }
    if (!reading.trim() || !Number.isFinite(currentOdometer) || currentOdometer < 0) {
      toast.error('Informe a quilometragem exibida no painel.');
      return;
    }
    setBusy(true);
    try {
      const ext = photo.type === 'image/png' ? 'png' : photo.type === 'image/webp' ? 'webp' : 'jpg';
      const token = crypto.randomUUID().replace(/-/g, '');
      const photoPath = `odometer-proof/${userId}/${token}.${ext}`;
      await uploadBytes(ref(storage, photoPath), photo, { contentType: photo.type });
      const response = await callJourney({
        action: endOpen ? 'end' : 'start',
        odometer: currentOdometer,
        photoPath,
      });
      setReading('');
      setPhoto(null);
      setEndOpen(false);
      toast.success(
        endOpen
          ? `Jornada encerrada · ${response.data.odometerKm ?? '—'} km no odômetro`
          : 'Jornada iniciada.'
      );
    } catch (error) {
      console.error('[motoboyJourney] registro da jornada', error);
      toast.error('Não foi possível registrar a jornada.');
    } finally {
      setBusy(false);
    }
  };

  const lunch = async (action: 'lunchStart' | 'lunchEnd') => {
    setLunchBusy(true);
    try {
      await callJourney({ action });
      toast.success(action === 'lunchStart' ? 'Almoço iniciado.' : 'Retorno do almoço registrado.');
    } catch (error) {
      console.error('[motoboyJourney] almoço', error);
      toast.error('Não foi possível registrar o almoço. Confira o estado da jornada.');
    } finally {
      setLunchBusy(false);
    }
  };

  return (
    <>
      {showActions && journey?.started_at && !journey.ended_at && (
        <div className="mx-4 my-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 text-xs text-foreground">
          <div className="flex items-center gap-2">
            <Gauge size={16} /> Início: {journey.start_odometer.toLocaleString('pt-BR')} km
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!lunchStarted ? (
              <button
                type="button"
                disabled={lunchBusy}
                className="rounded-lg border px-3 py-2 font-medium"
                onClick={() => lunch('lunchStart')}
              >
                <Coffee size={14} className="mr-1 inline" /> Almoço
              </button>
            ) : !lunchEnded ? (
              <button
                type="button"
                disabled={lunchBusy}
                className="rounded-lg border px-3 py-2 font-medium"
                onClick={() => lunch('lunchEnd')}
              >
                <Clock3 size={14} className="mr-1 inline" /> Retornar do almoço ·{' '}
                {lunchRemaining ? `${lunchRemaining} min restantes` : '1h cumprida'}
              </button>
            ) : (
              <span className="text-muted-foreground">
                Almoço: {fmtTime(lunchStarted)} às {fmtTime(lunchEnded)}
              </span>
            )}
            <button
              type="button"
              disabled={hasOpenRides}
              title={hasOpenRides ? 'Finalize todas as corridas antes de encerrar o dia.' : ''}
              className="rounded-lg border border-primary/30 px-3 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => setEndOpen(true)}
            >
              <LogOut size={14} className="mr-1 inline" /> Encerrar dia
            </button>
          </div>
        </div>
      )}
      {showActions && journey?.ended_at && (
        <p className="mx-4 my-2 rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
          <ShieldCheck size={15} className="mr-1 inline text-primary" /> Jornada encerrada ·{' '}
          {journey.odometer_km?.toLocaleString('pt-BR') ?? '—'} km registrados no odômetro.
        </p>
      )}
      {readError && (
        <p
          role="alert"
          className="m-3 rounded-lg border border-destructive p-3 text-xs text-destructive"
        >
          {readError}
        </p>
      )}
      {shouldShowPhoto && (
        <div
          className="jf-journey-overlay fixed inset-0 z-[300] flex items-center justify-center bg-black/75 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-label={endOpen ? 'Encerramento da jornada' : 'Abertura da jornada'}
        >
          <div className="jf-journey-modal w-full max-w-sm space-y-5 rounded-2xl border border-border bg-background p-5 text-foreground shadow-2xl">
            <h2 className="text-lg font-semibold tracking-tight">
              {endOpen ? 'Encerramento da jornada' : 'Abertura da jornada'}
            </h2>
            {!loaded && !endOpen && (
              <p role="status" className="text-sm text-muted-foreground">
                {readError || 'Carregando…'}
              </p>
            )}
            <div className="space-y-2">
              <span className="block text-sm font-medium">Foto do odômetro *</span>
              <button
                type="button"
                disabled={busy || cameraBusy}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm font-semibold transition-colors hover:bg-muted/70 active:scale-[0.99]"
                onClick={takeOdometerPhoto}
              >
                {photo ? (
                  <Check size={18} className="text-emerald-600" />
                ) : (
                  <CameraIcon size={18} className="text-primary" />
                )}
                {cameraBusy
                  ? 'Abrindo câmera…'
                  : photo
                    ? 'Foto registrada · Tirar outra'
                    : 'Tirar foto'}
              </button>
            </div>
            <label className="block space-y-2 text-sm font-medium">
              <span>Quilometragem *</span>
              <input
                type="text"
                inputMode="decimal"
                value={reading}
                disabled={busy}
                onChange={(event) => setReading(event.target.value)}
                placeholder="0,0 km"
                className="h-12 w-full rounded-xl border border-border bg-background px-4 text-base tabular-nums outline-none focus:border-primary"
              />
            </label>
            <div className="flex gap-2 pt-1">
              {endOpen && (
                <button
                  type="button"
                  className="min-h-12 flex-1 rounded-xl border border-border px-4 text-sm font-medium"
                  disabled={busy}
                  onClick={() => {
                    setEndOpen(false);
                    setReading('');
                    setPhoto(null);
                  }}
                >
                  Cancelar
                </button>
              )}
              <button
                type="button"
                className="min-h-12 flex-1 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
                disabled={
                  busy ||
                  !loaded ||
                  !photo ||
                  !reading.trim() ||
                  !Number.isFinite(currentOdometer) ||
                  currentOdometer < 0
                }
                onClick={submitOdometer}
              >
                {busy ? 'Registrando…' : endOpen ? 'Encerrar jornada' : 'Iniciar jornada'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
