import { useMemo, useState } from 'react';
import {
  Bike,
  CalendarDays,
  ListChecks,
  MapPinned,
  Package,
  Plus,
  Route,
  Search,
  Settings,
  TimerReset,
  UserPlus,
  UserRound,
} from 'lucide-react';
import type { MotoboyAssignment } from '@/hooks/useDepartmental';
import RoutePlanner from '@/components/motoboy/RoutePlanner';
import GoogleMotoboyMap from '@/components/motoboy/GoogleMotoboyMap';
import MotoboyMonthlyReports from '@/components/motoboy/MotoboyMonthlyReports';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import MotoboyRideDetailsDialog from '@/components/motoboy/MotoboyRideDetailsDialog';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import './motoboy-operations.css';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Props {
  assignments: MotoboyAssignment[];
  motoboys: Array<{ id: string; name: string }>;
  currentUserId: string;
  canManage: boolean;
  isMotoboyOnly: boolean;
  onCreateRide: () => void;
  onDesignateRide: (rideId: string, motoboyId: string) => Promise<void>;
  onReassignRide: (rideId: string, motoboyId: string) => Promise<void>;
  onOpenOverview: () => void;
}

const localDay = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

const sameDay = (value: string | null, day: string) => {
  if (!value) return false;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) && localDay(d) === day;
};

const clock = (iso: string | null) =>
  iso && Number.isFinite(Date.parse(iso))
    ? new Date(iso).toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

const statusText = (status: string) =>
  status === 'completed'
    ? 'Concluída'
    : status === 'accepted'
      ? 'Em andamento'
      : status === 'pending_approval'
        ? 'Aguardando aprovação'
        : 'Pendente';

const statusTone = (status: string) =>
  status === 'completed'
    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    : status === 'accepted'
      ? 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300'
      : status === 'pending_approval'
        ? 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300'
        : 'border-border bg-muted/40 text-muted-foreground';

export default function MotoboyOperationsDashboard({
  assignments,
  motoboys,
  currentUserId,
  canManage,
  isMotoboyOnly,
  onCreateRide,
  onDesignateRide,
  onReassignRide,
  onOpenOverview,
}: Props) {
  const [selectedId, setSelectedId] = useState(isMotoboyOnly ? currentUserId : 'all');
  const [day, setDay] = useState(() => localDay(new Date()));
  const [search, setSearch] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [rideDetails, setRideDetails] = useState<MotoboyAssignment | null>(null);
  const [designatingId, setDesignatingId] = useState<string | null>(null);
  const [rideTargets, setRideTargets] = useState<Record<string, string>>({});
  const [reassigningId, setReassigningId] = useState<string | null>(null);
  const selected = isMotoboyOnly ? currentUserId : selectedId;

  const people = useMemo(
    () =>
      (isMotoboyOnly ? motoboys.filter((m) => m.id === currentUserId) : motoboys).filter(
        (m, index, arr) => !!m?.id && !!m?.name && arr.findIndex((x) => x.id === m.id) === index
      ),
    [currentUserId, isMotoboyOnly, motoboys]
  );

  const scoped = useMemo(
    () =>
      assignments.filter((a) => {
        if (a.status === 'pending_approval') return false;
        if (isMotoboyOnly && a.assignedTo !== currentUserId) return false;
        if (selected !== 'all' && a.assignedTo !== selected) return false;
        return (
          sameDay(a.createdAt, day) || sameDay(a.completedAt, day) || sameDay(a.scheduledFor, day)
        );
      }),
    [assignments, currentUserId, day, isMotoboyOnly, selected]
  );

  const queue = useMemo(
    () =>
      canManage
        ? assignments.filter(
            (a) =>
              (a.status === 'pending_approval' || a.status === 'pending') &&
              (a.status === 'pending_approval' || !a.assignedTo) &&
              (sameDay(a.createdAt, day) || sameDay(a.scheduledFor, day)) &&
              `${a.clientName} ${a.location} ${a.description}`
                .toLocaleLowerCase('pt-BR')
                .includes(search.toLocaleLowerCase('pt-BR'))
          )
        : [],
    [assignments, canManage, day, search]
  );

  const ridesByMotoboy = useMemo(() => {
    const map = new Map<string, MotoboyAssignment[]>();
    for (const ride of scoped) {
      if (!ride.assignedTo) continue;
      const list = map.get(ride.assignedTo) || [];
      list.push(ride);
      map.set(ride.assignedTo, list);
    }
    for (const [key, list] of map.entries()) {
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      map.set(key, list);
    }
    return map;
  }, [scoped]);

  const grouped = useMemo(() => {
    const base = people.filter((m) => (selected === 'all' ? true : m.id === selected));
    const onlyWithRides =
      selected === 'all' ? base.filter((m) => (ridesByMotoboy.get(m.id) || []).length > 0) : base;
    return onlyWithRides.sort((a, b) => {
      const countDiff =
        (ridesByMotoboy.get(b.id) || []).length - (ridesByMotoboy.get(a.id) || []).length;
      return countDiff || a.name.localeCompare(b.name, 'pt-BR');
    });
  }, [people, ridesByMotoboy, selected]);

  const designatedRides = scoped.filter((a) => !!a.assignedTo);

  return (
    <section
      className="jf-motoboy-board min-w-0 space-y-4 rounded-2xl p-3 sm:p-5"
      aria-label="Central de motoboys"
    >
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="jf-mb-icon">
            <Bike className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">
              Departamental / Operação
            </p>
            <h2 className="text-xl font-bold tracking-tight text-foreground">Motoboys</h2>
            <p className="text-xs text-muted-foreground">
              Planejamento, designação e acompanhamento de corridas.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="jf-mb-control">
            <CalendarDays className="h-4 w-4 text-primary" />
            <label className="sr-only" htmlFor="jf-operations-day">
              Data das corridas
            </label>
            <Input
              id="jf-operations-day"
              type="date"
              className="h-9 w-[150px] border-0 bg-transparent p-0 text-xs text-foreground"
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 gap-1.5 px-3 text-xs"
            onClick={onOpenOverview}
          >
            <ListChecks className="h-4 w-4" /> Visão geral
          </Button>
          <div className="jf-mb-control">
            <UserRound className="h-4 w-4 shrink-0 text-primary" />
            <Select value={selected} onValueChange={setSelectedId} disabled={isMotoboyOnly}>
              <SelectTrigger
                aria-label="Selecionar motoboy"
                className="h-9 w-[190px] border-0 bg-transparent px-0 text-xs text-foreground"
              >
                <SelectValue placeholder="Motoboy" />
              </SelectTrigger>
              <SelectContent>
                {!isMotoboyOnly && <SelectItem value="all">Todos os motoboys</SelectItem>}
                {people.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-9 w-9 shrink-0"
            aria-label="Configurações dos motoboys"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {canManage && (
        <div className="jf-mb-card min-w-0 space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Package className="h-4 w-4 text-primary" /> Corridas pendentes
              </h3>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                {queue.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1 px-2 text-xs"
                onClick={() => setPlannerOpen(true)}
              >
                <Route className="h-3.5 w-3.5" /> Planejar rota
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label="Buscar corridas pendentes"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente ou local"
              className="jf-mb-search h-10 pl-9 text-xs"
            />
          </div>
          <div className="grid min-w-0 gap-3 xl:grid-cols-3">
            {queue.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground xl:col-span-3">
                Nenhuma corrida pendente encontrada.
              </p>
            ) : (
              queue.map((a) => (
                <div key={a.id} className="jf-mb-ride space-y-3 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-foreground">
                        {a.clientName || a.description}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                        {a.location || 'Sem endereço'}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      #{a.id.slice(0, 6)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={rideTargets[a.id] || ''}
                      onValueChange={(value) => setRideTargets((p) => ({ ...p, [a.id]: value }))}
                    >
                      <SelectTrigger
                        aria-label={`Motoboy para ${a.clientName || a.id}`}
                        className="h-9 min-w-0 flex-1 text-xs"
                      >
                        <SelectValue placeholder="Escolher motoboy" />
                      </SelectTrigger>
                      <SelectContent>
                        {people.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="sm"
                      className="h-9 px-3 text-xs"
                      disabled={!rideTargets[a.id] || designatingId === a.id}
                      onClick={async () => {
                        setDesignatingId(a.id);
                        try {
                          await onDesignateRide(a.id, rideTargets[a.id]);
                          toast.success('Corrida designada.');
                        } catch (error) {
                          console.error('[motoboy] designacao', error);
                          toast.error('Falha ao designar. Confira status e permissões.');
                        } finally {
                          setDesignatingId(null);
                        }
                      }}
                    >
                      <UserPlus className="mr-1 h-3.5 w-3.5" /> Designar
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={onCreateRide} className="gap-1.5 text-xs">
              <Plus className="h-4 w-4" /> Nova corrida
            </Button>
          </div>
        </div>
      )}

      <div className="jf-mb-card min-w-0 overflow-hidden p-2 sm:p-3">
        <div className="grid min-w-0 items-stretch gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="min-w-0">
            {canManage ? (
              <div className="jf-mb-panel flex min-h-[920px] min-w-0 flex-col p-3">
                <div className="mb-3 flex items-center gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Bike className="h-4 w-4 text-primary" /> Corridas designadas
                  </h3>
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                  {designatedRides.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                      Sem corridas designadas nesta data.
                    </p>
                  ) : (
                    designatedRides.map((a) => {
                      const rider = people.find((m) => m.id === a.assignedTo);
                      return (
                        <div key={a.id} className="jf-mb-ride space-y-2 rounded-xl p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium text-foreground">
                                {a.clientName || a.description}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {rider?.name || 'Motoboy removido/inativo'} · {statusText(a.status)}
                              </p>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => setRideDetails(a)}
                            >
                              Detalhes
                            </Button>
                          </div>
                          {a.status === 'pending' && (
                            <div className="flex items-center gap-1.5">
                              <Select
                                value={rideTargets[a.id] || (rider ? a.assignedTo || '' : '')}
                                onValueChange={(value) =>
                                  setRideTargets((p) => ({ ...p, [a.id]: value }))
                                }
                              >
                                <SelectTrigger
                                  className="h-8 min-w-0 flex-1 text-xs"
                                  aria-label={`Redesignar ${a.clientName || a.id}`}
                                >
                                  <SelectValue placeholder="Novo motoboy" />
                                </SelectTrigger>
                                <SelectContent>
                                  {people.map((m) => (
                                    <SelectItem key={m.id} value={m.id}>
                                      {m.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 shrink-0 px-2 text-xs"
                                disabled={
                                  reassigningId === a.id ||
                                  !rideTargets[a.id] ||
                                  rideTargets[a.id] === a.assignedTo
                                }
                                onClick={async () => {
                                  if (
                                    !window.confirm(
                                      `Transferir a corrida de ${a.clientName || a.id} para outro motoboy?`
                                    )
                                  )
                                    return;
                                  setReassigningId(a.id);
                                  try {
                                    await onReassignRide(a.id, rideTargets[a.id]);
                                    toast.success(
                                      'Corrida redesignada e tarefa vinculada atualizada.'
                                    );
                                  } catch (error) {
                                    console.error('[motoboy] redesignacao', error);
                                    toast.error(
                                      'Não foi possível redesignar. Confira as permissões.'
                                    );
                                  } finally {
                                    setReassigningId(null);
                                  }
                                }}
                              >
                                Redesignar
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <div className="jf-mb-panel min-h-[920px] p-4 text-xs text-muted-foreground">
                Visualização das corridas atribuídas ao seu usuário.
              </div>
            )}
          </aside>

          <div className="min-w-0 space-y-3">
            <div className="jf-mb-panel flex min-h-[520px] min-w-0 flex-col overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <MapPinned className="h-4 w-4 text-primary" /> Mapa operacional
                </h3>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden bg-muted/10">
                <GoogleMotoboyMap selectedId={selected} motoboys={motoboys} enabled={canManage} />
              </div>
              <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
                Acompanhe em tempo real a última posição e o traçado GPS das corridas do motoboy
                selecionado.
              </p>
            </div>

            <div className="jf-mb-panel min-w-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <CalendarDays className="h-4 w-4 text-primary" /> Visão geral das corridas do dia
                </h3>
                <span className="text-[11px] text-muted-foreground">
                  {selected === 'all'
                    ? 'Somente motoboys com corridas na data'
                    : people.find((m) => m.id === selected)?.name}
                </span>
              </div>
              <div className="grid min-w-0 grid-cols-1 items-start gap-4 p-4 xl:grid-cols-2">
                {grouped.map((m) => {
                  const rides = ridesByMotoboy.get(m.id) || [];
                  const done = rides.filter((a) => a.status === 'completed').length;
                  const inProgress = rides.filter((a) => a.status === 'accepted').length;
                  const wait = rides.filter((a) => a.status === 'pending').length;
                  return (
                    <article
                      key={m.id}
                      className="overflow-hidden rounded-xl border border-border/70 bg-muted/10"
                    >
                      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <Bike className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <h4 className="truncate text-sm font-semibold text-foreground">
                              {m.name}
                            </h4>
                            <p className="text-[11px] text-muted-foreground">
                              {rides.length} corrida(s) no dia
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-emerald-700 dark:text-emerald-300">
                            {done} concluída(s)
                          </span>
                          <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-blue-700 dark:text-blue-300">
                            {inProgress} em andamento
                          </span>
                          <span className="rounded-full border border-border bg-muted/40 px-2 py-1 text-muted-foreground">
                            {wait} pendente(s)
                          </span>
                        </div>
                      </header>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-[11px]">
                          <thead className="bg-muted/30 text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2 font-medium">Cliente</th>
                              <th className="px-2 py-2 font-medium">Início</th>
                              <th className="px-2 py-2 font-medium">Km da loja</th>
                              <th className="px-2 py-2 font-medium">Status</th>
                              <th className="px-3 py-2 font-medium">Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rides.map((a) => (
                              <tr
                                key={a.id}
                                className="border-t border-border text-foreground transition-colors hover:bg-muted/20"
                              >
                                <td className="px-3 py-2.5">
                                  <div className="max-w-[220px]">
                                    <p
                                      className="truncate font-medium"
                                      title={a.clientName || a.description}
                                    >
                                      {a.clientName || a.description}
                                    </p>
                                    <p
                                      className="truncate text-[11px] text-muted-foreground"
                                      title={a.location}
                                    >
                                      {a.location || 'Endereço não informado'}
                                    </p>
                                  </div>
                                </td>
                                <td className="px-2 py-2.5 tabular-nums">
                                  {clock(a.acceptedAt || a.createdAt)}
                                </td>
                                <td
                                  className="px-2 py-2.5 tabular-nums text-muted-foreground"
                                  title="Quilometragem prevista por vias"
                                >
                                  {a.expectedLegMeters != null || a.expectedDistanceMeters != null
                                    ? `${((a.expectedLegMeters ?? a.expectedDistanceMeters ?? 0) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} km`
                                    : '—'}
                                </td>
                                <td className="px-2 py-2.5">
                                  <span
                                    className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-medium ${statusTone(a.status)}`}
                                  >
                                    {statusText(a.status)}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5">
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                                    onClick={() => setRideDetails(a)}
                                  >
                                    <TimerReset className="h-3.5 w-3.5" /> Detalhes
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {!rides.length && (
                              <tr>
                                <td className="px-3 py-5 text-muted-foreground" colSpan={5}>
                                  Sem corridas nesta data.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </article>
                  );
                })}
                {!grouped.length && (
                  <p className="text-xs text-muted-foreground">
                    Nenhum motoboy com corridas nesta data.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <MotoboyRideDetailsDialog ride={rideDetails} onClose={() => setRideDetails(null)} />

      <Dialog open={plannerOpen} onOpenChange={setPlannerOpen}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Route className="h-4 w-4 text-primary" /> Planejamento de rota
            </DialogTitle>
          </DialogHeader>
          <RoutePlanner assignments={assignments} motoboys={motoboys} />
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configurações de Motoboys</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>Os controles operacionais desta aba usam o tema global do JapanFlow.</p>
            <p>
              Selecione um motoboy ou “Todos” no cabeçalho para alternar jornadas e posições GPS.
            </p>
            <p>O planejamento usa o mecanismo de rotas existente e não altera permissões.</p>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
