import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, type Timestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ref, uploadBytes } from 'firebase/storage';
import { Camera, Clock3, Coffee, Gauge, LogOut, ShieldCheck } from 'lucide-react';
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

/** Jornada sincronizada com o servidor. O bloqueio visual depende de aprovação do OCR no backend. */
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
          : 'Odômetro validado! Jornada iniciada.'
      );
    } catch (error) {
      console.error('[motoboyJourney] confirmação da foto', error);
      toast.error(
        'Não foi possível confirmar a foto e o odômetro. Confira a leitura ou tire outra foto.'
      );
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
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Validação obrigatória do odômetro"
        >
          <div className="w-full max-w-md space-y-4 rounded-2xl bg-background p-5 text-foreground shadow-2xl">
            <div>
              <h2 className="text-lg font-semibold">
                {endOpen ? 'Encerramento da jornada' : 'Abertura obrigatória da jornada'}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {endOpen
                  ? 'Fotografe o painel com a quilometragem final.'
                  : 'A partir das 07h, confirme o odômetro antes de utilizar o aplicativo.'}
              </p>
            </div>
            {!loaded && !endOpen && (
              <p role="status" className="rounded-lg border p-3 text-xs text-muted-foreground">
                {readError || 'Confirmando a jornada no servidor…'}
              </p>
            )}
            <label className="block space-y-2 text-sm font-medium">
              <span>
                <Camera size={16} className="mr-1 inline" /> Foto legível do odômetro *
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                disabled={busy}
                className="block w-full rounded-lg border border-border p-3 text-sm"
                onChange={(event) => setPhoto(event.currentTarget.files?.[0] || null)}
              />
            </label>
            {photo && (
              <p className="text-xs text-muted-foreground">Foto selecionada: {photo.name}</p>
            )}
            <label className="block space-y-2 text-sm font-medium">
              <span>Quilometragem indicada no painel *</span>
              <input
                type="text"
                inputMode="decimal"
                value={reading}
                disabled={busy}
                onChange={(event) => setReading(event.target.value)}
                placeholder="Ex.: 12345,6"
                className="w-full rounded-lg border border-border bg-background p-3"
              />
            </label>
            <p className="text-xs text-muted-foreground">
              A fotografia será verificada pelo serviço de visão computacional do Google. Uma
              leitura ilegível ou divergente não será aprovada.
            </p>
            <div className="flex gap-2">
              {endOpen && (
                <button
                  type="button"
                  className="flex-1 rounded-lg border p-3 text-sm"
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
                className="flex-1 rounded-lg bg-primary p-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                disabled={busy || !loaded || !photo || !reading.trim()}
                onClick={submitOdometer}
              >
                {busy
                  ? 'Validando foto…'
                  : endOpen
                    ? 'Validar e encerrar'
                    : 'Validar e iniciar jornada'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
