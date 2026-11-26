import { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { DateTime } from 'luxon';
import { toast } from 'sonner';
import app from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import OdometerPhoto from './OdometerPhoto';
import type { Person } from './monthlyReportModel';

type Fields = Record<string, string | number | null>;
type RecordRow = Fields & { revision: string };
type Ride = RecordRow & { id: string };
type Loaded = { admin: boolean; journey: RecordRow; rides: Ride[] };
type Audit = {
  id: string;
  actor: string;
  at: string;
  reason: string;
  before: unknown;
  after: unknown;
};
type Grant = { id: string; name: string; enabled: boolean };
const zone = 'America/Sao_Paulo';
const call = httpsCallable<Record<string, unknown>, unknown>(
  getFunctions(app, 'southamerica-east1'),
  'motoboyAdmin'
);
const local = (v: string | number | null) => {
  if (typeof v !== 'string' || !v.includes('T')) return '';
  const d = DateTime.fromISO(v, { zone });
  return d.isValid ? d.toFormat("yyyy-MM-dd'T'HH:mm:ss") : '';
};
const iso = (v: string, original?: string | number | null) => {
  if (!v) return null;
  const d = DateTime.fromISO(typeof original === 'string' && local(original) === v ? original : v, {
    zone,
  });
  if (!d.isValid) throw new Error('Horário inválido.');
  return d.toUTC().toISO();
};
const text = (v: string | number | null | undefined) => String(v ?? '');
const journeyTimes = [
  ['started_at', 'Entrada'],
  ['ended_at', 'Saída'],
  ['lunch_started_at', 'Início do almoço'],
  ['lunch_ended_at', 'Fim do almoço'],
];
const rideTimes = [
  ['assigned_at', 'Designação'],
  ['accepted_at', 'Aceite'],
  ['completed_at', 'Conclusão'],
];
export default function MotoboyAdminPanel({
  motoboys,
  initialDay,
}: {
  motoboys: Person[];
  initialDay: string;
}) {
  const [userId, setUserId] = useState(motoboys[0]?.id ?? '');
  const [day, setDay] = useState(initialDay);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [rideId, setRideId] = useState('');
  const [rideForm, setRideForm] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const load = async () => {
    setBusy(true);
    setLoaded(null);
    setRideId('');
    setRideForm({});
    setGrants(null);
    setAudit([]);
    try {
      const result = (await call({ action: 'load', userId, day })).data as Loaded;
      setLoaded(result);
      setForm({
        ...Object.fromEntries(journeyTimes.map(([k]) => [k, local(result.journey[k])])),
        start_odometer: text(result.journey.start_odometer),
        end_odometer: text(result.journey.end_odometer),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao consultar.');
    } finally {
      setBusy(false);
    }
  };
  const save = async (action: 'journey' | 'ride') => {
    if (!loaded || reason.trim().length < 5) return;
    setBusy(true);
    try {
      if (action === 'journey') {
        const values = {
          ...Object.fromEntries(
            journeyTimes.map(([k]) => [k, iso(form[k] || '', loaded.journey[k])])
          ),
          start_odometer: form.start_odometer === '' ? null : Number(form.start_odometer),
          end_odometer: form.end_odometer === '' ? null : Number(form.end_odometer),
        };
        await call({ action, userId, day, revision: loaded.journey.revision, values, reason });
      } else {
        const ride = loaded.rides.find((r) => r.id === rideId);
        if (!ride) throw new Error('Selecione uma corrida.');
        const values = {
          ...Object.fromEntries(rideTimes.map(([k]) => [k, iso(rideForm[k] || '', ride[k])])),
          client_name: rideForm.client_name,
          location: rideForm.location,
          assigned_to: rideForm.assigned_to,
          status: rideForm.status,
          notes: rideForm.notes || '',
          ride_value: rideForm.ride_value === '' ? null : Number(rideForm.ride_value),
        };
        await call({ action, userId, day, rideId, revision: ride.revision, values, reason });
      }
      toast.success('Correção registrada com auditoria.');
      setReason('');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao salvar.');
    } finally {
      setBusy(false);
    }
  };
  const loadGrants = async () => {
    setBusy(true);
    try {
      const result = (await call({ action: 'permissions' })).data as { users: Grant[] };
      setGrants(result.users);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Acesso negado.');
    } finally {
      setBusy(false);
    }
  };
  const grant = async (u: Grant) => {
    if (reason.trim().length < 5) return;
    setBusy(true);
    try {
      await call({ action: 'grant', userId: u.id, enabled: !u.enabled, reason });
      toast.success('Permissão atualizada.');
      await loadGrants();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao alterar permissão.');
    } finally {
      setBusy(false);
    }
  };
  const auditLoad = async () => {
    setBusy(true);
    try {
      const result = (await call({ action: 'audit', userId, day, rideId: rideId || undefined }))
        .data as { items: Audit[] };
      setAudit(result.items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao consultar auditoria.');
    } finally {
      setBusy(false);
    }
  };
  const recalculate = async () => {
    setBusy(true);
    try {
      await httpsCallable(
        getFunctions(app, 'southamerica-east1'),
        'googleRoutePlanner'
      )({ action: 'estimateRideAndPersist', rideId });
      toast.success('Distância consultada.');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Distância indisponível.');
    } finally {
      setBusy(false);
    }
  };
  const chooseRide = (id: string) => {
    setRideId(id);
    setAudit([]);
    const r = loaded?.rides.find((x) => x.id === id);
    setRideForm(
      r
        ? {
            ...Object.fromEntries(rideTimes.map(([k]) => [k, local(r[k])])),
            client_name: text(r.client_name),
            location: text(r.location),
            assigned_to: text(r.assigned_to),
            status: text(r.status),
            notes: text(r.notes),
            ride_value: text(r.ride_value),
          }
        : {}
    );
  };
  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted-foreground">
        Correções administrativas exigem justificativa e preservam as evidências originais.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label>Motoboy</Label>
          <select
            className="h-10 w-full rounded-md border bg-background px-2"
            value={userId}
            disabled={busy}
            onChange={(e) => {
              setUserId(e.target.value);
              setLoaded(null);
              setGrants(null);
            }}
          >
            {motoboys.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Data</Label>
          <Input
            type="date"
            value={day}
            disabled={busy}
            onChange={(e) => {
              setDay(e.target.value);
              setLoaded(null);
              setGrants(null);
            }}
          />
        </div>
      </div>
      <Button disabled={busy || !userId || !day} onClick={() => void load()}>
        Consultar registros
      </Button>
      <div>
        <Label>Justificativa (obrigatória para alterações)</Label>
        <Input
          value={reason}
          maxLength={500}
          disabled={busy}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motivo da correção"
        />
      </div>
      {loaded && (
        <>
          <section className="space-y-3 rounded-lg border p-3">
            <h3 className="font-semibold">
              Jornada · {loaded.journey.revision ? 'Registro existente' : 'Nova jornada manual'}
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {journeyTimes.map(([k, l]) => (
                <div key={k}>
                  <Label>{l}</Label>
                  <Input
                    type="datetime-local"
                    step={1}
                    value={form[k] || ''}
                    disabled={busy}
                    onChange={(e) => setForm((old) => ({ ...old, [k]: e.target.value }))}
                  />
                </div>
              ))}
              {[
                ['start_odometer', 'Odômetro inicial'],
                ['end_odometer', 'Odômetro final'],
              ].map(([k, l]) => (
                <div key={k}>
                  <Label>{l}</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.1"
                    value={form[k] || ''}
                    disabled={busy}
                    onChange={(e) => setForm((old) => ({ ...old, [k]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <OdometerPhoto label="Abertura" path={text(loaded.journey.start_photo_path)} />
              <OdometerPhoto label="Fechamento" path={text(loaded.journey.end_photo_path)} />
            </div>
            <Button
              disabled={busy || reason.trim().length < 5}
              onClick={() => void save('journey')}
            >
              Salvar jornada
            </Button>
          </section>
          <section className="space-y-3 rounded-lg border p-3">
            <h3 className="font-semibold">Corridas</h3>
            <select
              aria-label="Corrida"
              className="h-10 w-full rounded-md border bg-background px-2"
              value={rideId}
              disabled={busy}
              onChange={(e) => chooseRide(e.target.value)}
            >
              <option value="">Selecione a corrida</option>
              {loaded.rides.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.client_name || r.id} · {r.status}
                </option>
              ))}
            </select>
            {rideId && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Motoboy responsável (corrida individual pendente)</Label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-2"
                      value={rideForm.assigned_to}
                      disabled={
                        busy ||
                        loaded.rides.find((r) => r.id === rideId)?.status !== 'pending' ||
                        !!loaded.rides.find((r) => r.id === rideId)?.route_id
                      }
                      onChange={(e) =>
                        setRideForm((old) => ({ ...old, assigned_to: e.target.value }))
                      }
                    >
                      {motoboys.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {[
                    ['client_name', 'Cliente'],
                    ['location', 'Endereço'],
                    ['notes', 'Observações'],
                    ['ride_value', 'Valor da corrida (R$)'],
                  ].map(([k, l]) => (
                    <div key={k}>
                      <Label>{l}</Label>
                      <Input
                        type={k === 'ride_value' ? 'number' : 'text'}
                        step={k === 'ride_value' ? '0.01' : undefined}
                        value={rideForm[k] || ''}
                        disabled={busy}
                        onChange={(e) => setRideForm((old) => ({ ...old, [k]: e.target.value }))}
                      />
                    </div>
                  ))}
                  {rideTimes.map(([k, l]) => (
                    <div key={k}>
                      <Label>{l}</Label>
                      <Input
                        type="datetime-local"
                        step={1}
                        value={rideForm[k] || ''}
                        disabled={busy}
                        onChange={(e) => setRideForm((old) => ({ ...old, [k]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <div>
                    <Label>Situação</Label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-2"
                      value={rideForm.status}
                      disabled={busy}
                      onChange={(e) => setRideForm((old) => ({ ...old, status: e.target.value }))}
                    >
                      <option value="pending">Pendente</option>
                      <option value="accepted">Em andamento</option>
                      <option value="completed">Concluída</option>
                      <option value="cancelled">Cancelada</option>
                    </select>
                  </div>
                </div>
                <Button
                  disabled={busy || reason.trim().length < 5}
                  onClick={() => void save('ride')}
                >
                  Salvar corrida
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => void recalculate()}>
                  Calcular ida e retorno
                </Button>
              </>
            )}
          </section>
          <section className="space-y-2 rounded-lg border p-3">
            <h3 className="font-semibold">Histórico de correções</h3>
            <Button variant="outline" disabled={busy} onClick={() => void auditLoad()}>
              Consultar {rideId ? 'corrida' : 'jornada'}
            </Button>
            {audit.map((a) => (
              <details key={a.id} className="rounded-md border p-2">
                <summary>
                  {a.reason} · {a.actor} · {local(a.at)}
                </summary>
                <pre className="whitespace-pre-wrap break-all text-xs">
                  {JSON.stringify({ antes: a.before, depois: a.after }, null, 2)}
                </pre>
              </details>
            ))}
          </section>
          {loaded.admin && (
            <section className="space-y-2 rounded-lg border p-3">
              <h3 className="font-semibold">Permissões de gestão</h3>
              <Button variant="outline" disabled={busy} onClick={() => void loadGrants()}>
                Consultar usuários
              </Button>
              {grants?.map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-2 border-t py-2">
                  <span>{u.name}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || reason.trim().length < 5}
                    onClick={() => void grant(u)}
                  >
                    {u.enabled ? 'Revogar' : 'Conceder'}
                  </Button>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
