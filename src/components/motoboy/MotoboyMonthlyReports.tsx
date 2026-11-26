import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type Query,
} from 'firebase/firestore';
import { DateTime } from 'luxon';
import {
  CalendarDays,
  FileSpreadsheet,
  FileText,
  Gauge,
  PackageCheck,
  Clock3,
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
  Download,
  Info,
  ChartNoAxesColumn,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  buildMonthlyReport,
  dateLabel,
  dateTimeLabel,
  kmLabel,
  timeLabel,
  spDay,
  type Person,
  type RideRecord,
} from './monthlyReportModel';
import {
  buildMonthlyPdf,
  buildMonthlyXlsx,
  downloadReport,
  journeyStatus,
  defaultReportExportOptions,
  exportDetails,
  type ReportExportOptions,
} from './monthlyReportExport';

const ZONE = 'America/Sao_Paulo';
type Dataset = 'journeys' | 'rides' | 'history';
type Source = { records: RideRecord[]; ready: boolean; error: string };
const emptySource = (): Source => ({ records: [], ready: false, error: '' });
const emptyState = (month: string) => ({
  month,
  journeys: emptySource(),
  rides: emptySource(),
  history: emptySource(),
});
const validMonth = (month: string) =>
  /^\d{4}-\d{2}$/.test(month) && DateTime.fromISO(`${month}-01`, { zone: ZONE }).isValid;

export default function MotoboyMonthlyReports({
  motoboys,
  initialMotoboy = 'all',
  initialMonth,
}: {
  motoboys: Person[];
  initialMotoboy?: string;
  initialMonth?: string;
}) {
  const [month, setMonth] = useState(() =>
    initialMonth && validMonth(initialMonth)
      ? initialMonth
      : spDay(new Date().toISOString()).slice(0, 7)
  );
  const [selected, setSelected] = useState(initialMotoboy);
  const [sources, setSources] = useState(() => emptyState(month));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [exportOptions, setExportOptions] = useState<ReportExportOptions>(
    defaultReportExportOptions
  );
  const [exporting, setExporting] = useState<'pdf' | 'xlsx' | null>(null);

  useEffect(() => {
    if (!validMonth(month)) return;
    let mounted = true;
    setSources(emptyState(month));
    const start = DateTime.fromISO(`${month}-01`, { zone: ZONE }).startOf('day');
    const end = start.plus({ months: 1 });
    const update = (name: Dataset, value: Source) => {
      if (!mounted) return;
      setSources((previous) =>
        previous.month === month ? { ...previous, [name]: value } : previous
      );
    };
    const listen = (name: Dataset, ref: Query<DocumentData>) =>
      onSnapshot(
        ref,
        { includeMetadataChanges: true },
        (snapshot) => {
          update(name, {
            records: snapshot.docs.map((d) => ({ id: d.id, data: d.data() })),
            ready: !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites,
            error: '',
          });
        },
        (error) => {
          console.error(`[motoboy monthly] ${name}`, error.code);
          update(name, {
            records: [],
            ready: false,
            error: `Não foi possível consultar ${name === 'journeys' ? 'jornadas' : name === 'rides' ? 'corridas' : 'o histórico de designações'}. Verifique a conexão e as permissões.`,
          });
        }
      );
    const unsubscribers = [
      listen(
        'journeys',
        query(
          collection(db, 'motoboy_journeys'),
          where('day', '>=', start.toISODate()),
          where('day', '<', end.toISODate())
        )
      ),
      // Do not inherit the operational board's 500-ride limit; legacy records have mixed date formats.
      listen('rides', collection(db, 'motoboy_assignments')),
      // Later events are needed to reconcile a ride reassigned or deleted after the selected month.
      listen(
        'history',
        query(
          collection(db, 'motoboy_ride_report_events'),
          where('event_at', '>=', start.toJSDate())
        )
      ),
    ];
    return () => {
      mounted = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [month]);

  const errors =
    sources.month === month
      ? [sources.journeys.error, sources.rides.error, sources.history.error].filter(Boolean)
      : [];
  const ready =
    sources.month === month &&
    sources.journeys.ready &&
    sources.rides.ready &&
    sources.history.ready &&
    !errors.length;
  const sections = useMemo(
    () =>
      sources.month === month
        ? buildMonthlyReport(
            month,
            motoboys,
            sources.journeys.records.map((r) => r.data),
            sources.rides.records,
            sources.history.records
          )
        : [],
    [month, motoboys, sources]
  );
  const filtered = sections.filter((s) => selected === 'all' || s.person.id === selected);
  const totals = {
    completed: filtered.reduce((sum, s) => sum + s.totalCompleted, 0),
    assigned: filtered.reduce((sum, s) => sum + s.totalAssigned, 0),
    km: Math.round(filtered.reduce((sum, s) => sum + s.totalKm, 0) * 10) / 10,
    days: filtered.reduce((sum, s) => sum + s.journeyDays, 0),
    missing: filtered.reduce((sum, s) => sum + s.incompleteKmDays, 0),
  };
  const hasExport = exportOptions.summary || exportOptions.journeys || exportOptions.rides;
  const detailCount = filtered.reduce(
    (sum, section) =>
      sum +
      section.days.reduce((n, day) => n + exportDetails(day, exportOptions.rideFilter).length, 0),
    0
  );
  const exportData = async (format: 'pdf' | 'xlsx') => {
    if (!ready || exporting || !filtered.length || !hasExport) return;
    setExporting(format);
    try {
      const blob =
        format === 'pdf'
          ? new Blob([buildMonthlyPdf(filtered, month, exportOptions)], { type: 'application/pdf' })
          : await buildMonthlyXlsx(filtered, month, exportOptions);
      downloadReport(
        blob,
        `JapanFlow-Acompanhamento-${month}-${selected === 'all' ? 'Todos' : selected.replace(/[^a-zA-Z0-9_-]/g, '_')}.${format}`
      );
      toast.success('Relatório exportado.');
    } catch (error) {
      console.error('[motoboy monthly] export', error);
      toast.error('Não foi possível exportar o relatório.');
    } finally {
      setExporting(null);
    }
  };
  const [view, setView] = useState<'daily' | 'trend'>('daily');
  const [metric, setMetric] = useState<'rides' | 'km'>('rides');
  const [statusFilter, setStatusFilter] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const visible = filtered.map((section) => ({
    ...section,
    days: section.days.filter(
      (day) => statusFilter === 'all' || journeyStatus(day) === statusFilter
    ),
  }));
  const active = visible
    .flatMap((section) => section.days.map((day) => ({ section, day })))
    .find(({ section, day }) => expanded === `${month}:${section.person.id}:${day.date}`);
  const trend = Array.from(
    new Set(visible.flatMap((section) => section.days.map((day) => day.date)))
  )
    .sort()
    .map((date) => {
      const days = visible.flatMap((section) => section.days.filter((day) => day.date === date));
      const known = days.filter((day) => day.km !== null);
      return {
        date: dateLabel(date).slice(0, 5),
        rides: days.reduce((sum, day) => sum + day.completed, 0),
        km: known.length
          ? Math.round(known.reduce((sum, day) => sum + (day.km ?? 0), 0) * 10) / 10
          : null,
      };
    });
  const selectDay = (key: string) => setExpanded((previous) => (previous === key ? null : key));
  return (
    <section className="min-w-0 space-y-5" aria-label="Acompanhamento mensal dos motoboys">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="text-xs text-muted-foreground">Departamental / Motoboys</p>
          <h2 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <CalendarDays className="h-6 w-6 text-primary" /> Acompanhamento Mensal
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Jornadas, designações e quilometragem por competência.
          </p>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          disabled={!ready || !filtered.length}
          onClick={() => setExportOpen(true)}
        >
          <Download className="h-4 w-4" /> Exportar <ChevronDown className="h-4 w-4" />
        </Button>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="month"
          aria-label="Mês e ano do acompanhamento"
          value={month}
          onChange={(e) => {
            if (validMonth(e.target.value)) {
              setMonth(e.target.value);
              setExpanded(null);
            }
          }}
          className="h-10 min-w-[160px] flex-1 rounded-xl"
        />
        <Select
          value={selected}
          onValueChange={(value) => {
            setSelected(value);
            setExpanded(null);
          }}
        >
          <SelectTrigger
            className="h-10 min-w-[180px] flex-1 rounded-xl"
            aria-label="Filtrar motoboy"
          >
            <SelectValue placeholder="Todos os motoboys" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os motoboys</SelectItem>
            {sections.map((s) => (
              <SelectItem key={s.person.id} value={s.person.id}>
                {s.person.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          className="h-10 gap-2 rounded-xl"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <SlidersHorizontal className="h-4 w-4" /> Filtros{statusFilter !== 'all' && ' · 1'}
        </Button>
      </div>
      {filtersOpen && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
          <span className="text-sm font-medium">Situação da jornada</span>
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value);
              setExpanded(null);
            }}
          >
            <SelectTrigger className="w-[220px]" aria-label="Situação da jornada">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['all', 'Encerrada', 'Sem jornada', 'Em aberto', 'Odômetro incompleto'].map((s) => (
                <SelectItem key={s} value={s}>
                  {s === 'all' ? 'Todas as situações' : s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => setStatusFilter('all')}>
            Limpar
          </Button>
          <p className="text-xs text-muted-foreground">
            Filtro apenas da visualização diária e evolução; totais e exportação mantêm a
            competência completa.
          </p>
        </div>
      )}
      {!ready && !errors.length && (
        <p role="status" className="rounded-xl border p-4 text-sm text-muted-foreground">
          Sincronizando dados com o servidor…
        </p>
      )}
      {errors.map((error) => (
        <p
          key={error}
          role="alert"
          className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      ))}
      {ready && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              {
                label: 'Concluídas',
                value: String(totals.completed),
                Icon: PackageCheck,
                tone: 'bg-red-500/[0.05] text-red-700 dark:text-red-300 border-red-500/10',
              },
              {
                label: 'Km registrados',
                value: `${kmLabel(totals.km)} km`,
                Icon: Gauge,
                tone: 'bg-muted/40 text-foreground border-border',
              },
              {
                label: 'Dias com jornada',
                value: String(totals.days),
                Icon: CalendarDays,
                tone: 'bg-emerald-500/[0.05] text-emerald-700 dark:text-emerald-300 border-emerald-500/10',
              },
              {
                label: 'Designações',
                value: String(totals.assigned),
                Icon: Clock3,
                tone: 'bg-violet-500/[0.05] text-violet-700 dark:text-violet-300 border-violet-500/10',
              },
            ].map(({ label, value, Icon, tone }) => (
              <article
                key={label}
                className={`flex min-w-0 items-center gap-3 rounded-2xl border p-4 sm:p-5 ${tone}`}
              >
                <Icon className="h-6 w-6 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xl font-semibold tabular-nums text-foreground sm:text-2xl">
                    {value}
                  </p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </article>
            ))}
          </div>
          {totals.missing > 0 && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Info className="h-4 w-4 shrink-0" /> {totals.missing} dia(s) sem km válido. Total de
              quilometragem parcial.
            </p>
          )}
          <div className="min-w-0 rounded-2xl border border-border bg-card p-3 sm:p-5">
            <div
              className="mb-4 flex items-center gap-4 border-b border-border"
              role="group"
              aria-label="Modo de visualização"
            >
              <button
                type="button"
                aria-pressed={view === 'daily'}
                onClick={() => setView('daily')}
                className={`flex items-center gap-2 border-b-2 px-3 pb-3 text-sm font-medium transition-colors ${view === 'daily' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                <CalendarDays className="h-4 w-4" /> Diário
              </button>
              <button
                type="button"
                aria-pressed={view === 'trend'}
                onClick={() => setView('trend')}
                className={`flex items-center gap-2 border-b-2 px-3 pb-3 text-sm font-medium transition-colors ${view === 'trend' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                <ChartNoAxesColumn className="h-4 w-4" /> Evolução
              </button>
            </div>
            {view === 'trend' ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Evolução diária</h3>
                  <div className="flex gap-1 rounded-lg bg-muted p-1">
                    <Button
                      size="sm"
                      variant={metric === 'rides' ? 'default' : 'ghost'}
                      onClick={() => setMetric('rides')}
                    >
                      Corridas
                    </Button>
                    <Button
                      size="sm"
                      variant={metric === 'km' ? 'default' : 'ghost'}
                      onClick={() => setMetric('km')}
                    >
                      Km
                    </Button>
                  </div>
                </div>
                {trend.length && trend.some((point) => point[metric] !== null) ? (
                  <div
                    className="h-[280px] min-w-0"
                    role="img"
                    aria-label={
                      metric === 'rides'
                        ? 'Gráfico de corridas concluídas por dia'
                        : 'Gráfico de quilometragem registrada por dia'
                    }
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trend} margin={{ top: 12, right: 12, bottom: 8, left: 0 }}>
                        <CartesianGrid
                          strokeDasharray="3 5"
                          stroke="hsl(var(--border))"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          width={44}
                          allowDecimals={metric === 'km'}
                          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            background: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: 12,
                            color: 'hsl(var(--foreground))',
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey={metric}
                          name={metric === 'rides' ? 'Concluídas' : 'Km registrados'}
                          stroke="#D61B16"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                          connectNulls={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="p-8 text-center text-sm text-muted-foreground">
                    Sem dados válidos para este gráfico.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {metric === 'km'
                    ? 'Dias sem odômetro válido não são estimados.'
                    : 'Corridas contabilizadas pela data de conclusão.'}
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {visible.map((section) => (
                  <div key={section.person.id}>
                    {selected === 'all' && (
                      <h3 className="mb-2 text-sm font-semibold">{section.person.name}</h3>
                    )}
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[570px] text-left text-sm">
                        <thead className="bg-muted/60 text-muted-foreground">
                          <tr>
                            {['Data', 'Jornada', 'Km dia', 'Concluídas', 'Designadas', ''].map(
                              (label, i) => (
                                <th
                                  key={i}
                                  className="px-3 py-2 text-xs font-medium first:rounded-l-lg last:rounded-r-lg"
                                >
                                  {label}
                                </th>
                              )
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {section.days.map((day) => {
                            const key = `${month}:${section.person.id}:${day.date}`;
                            const open = expanded === key;
                            return (
                              <tr
                                key={key}
                                className={`border-b border-border/60 tabular-nums transition-colors ${open ? 'bg-red-500/10' : 'hover:bg-muted/30'}`}
                              >
                                <td className="px-3 py-3">
                                  <div className={`font-semibold ${open ? 'text-primary' : ''}`}>
                                    {dateLabel(day.date).slice(0, 5)}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {DateTime.fromISO(day.date, { zone: ZONE })
                                      .setLocale('pt-BR')
                                      .toFormat('ccc')}
                                  </div>
                                </td>
                                <td className="px-3 py-3">
                                  <span className="rounded-full bg-muted px-2 py-1 text-xs whitespace-nowrap">
                                    {journeyStatus(day)}
                                  </span>
                                </td>
                                <td className="px-3 py-3">{kmLabel(day.km)}</td>
                                <td className="px-3 py-3 font-semibold">{day.completed}</td>
                                <td className="px-3 py-3">{day.assigned}</td>
                                <td className="px-3 py-3 text-right">
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8 rounded-full"
                                    aria-expanded={open}
                                    aria-label={`Detalhes de ${dateLabel(day.date)} — ${section.person.name}`}
                                    onClick={() => selectDay(key)}
                                  >
                                    {open ? (
                                      <ChevronDown className="h-4 w-4" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4" />
                                    )}
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                          {!section.days.length && (
                            <tr>
                              <td colSpan={6} className="p-5 text-center text-muted-foreground">
                                Nenhum registro para este filtro.
                              </td>
                            </tr>
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="font-semibold">
                            <td colSpan={2} className="px-3 py-3 text-xs">
                              TOTAL MENSAL
                            </td>
                            <td className="px-3 py-3">{kmLabel(section.totalKm)}</td>
                            <td className="px-3 py-3">{section.totalCompleted}</td>
                            <td className="px-3 py-3">{section.totalAssigned}</td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                ))}
                {!visible.length && (
                  <p className="p-5 text-sm text-muted-foreground">Nenhum motoboy encontrado.</p>
                )}
                {active && (
                  <article className="overflow-hidden rounded-xl border border-l-[3px] border-l-primary bg-card p-4">
                    <header className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="flex items-center gap-2 font-semibold">
                        <CalendarDays className="h-5 w-5 text-primary" />{' '}
                        {dateLabel(active.day.date)} · {active.section.person.name}
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {active.day.details.length} registros
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Fechar detalhes"
                          onClick={() => setExpanded(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </header>
                    <div className="my-3 grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-4">
                      {[
                        { label: 'Início', value: timeLabel(active.day.startedAt) },
                        { label: 'Fim', value: timeLabel(active.day.endedAt) },
                        { label: 'Km inicial', value: kmLabel(active.day.startKm) },
                        { label: 'Km final', value: kmLabel(active.day.endKm) },
                      ].map((item) => (
                        <div key={item.label}>
                          <p className="text-xs text-muted-foreground">{item.label}</p>
                          <p className="font-medium tabular-nums">{item.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[650px] text-left text-xs">
                        <thead className="bg-muted/60">
                          <tr>
                            {['Designação', 'Conclusão', 'Cliente', 'Endereço', 'Situação'].map(
                              (label) => (
                                <th key={label} className="p-2 font-medium">
                                  {label}
                                </th>
                              )
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {active.day.details.map((ride) => (
                            <tr key={ride.id} className="border-b border-border/60">
                              <td className="whitespace-nowrap p-2">
                                {dateTimeLabel(ride.assignedAt)}
                              </td>
                              <td className="whitespace-nowrap p-2">
                                {dateTimeLabel(ride.completedAt)}
                              </td>
                              <td className="p-2 font-medium" title={ride.reference}>
                                {ride.client}
                                <span className="block text-[10px] text-muted-foreground">
                                  {ride.kind === 'completion' ? 'Conclusão' : 'Designação'}
                                </span>
                              </td>
                              <td className="p-2 break-words">{ride.address}</td>
                              <td className="p-2">
                                <span
                                  className={`rounded-full px-2 py-1 text-xs ${ride.status === 'Concluída' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}
                                >
                                  {ride.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {!active.day.details.length && (
                            <tr>
                              <td colSpan={5} className="p-3 text-muted-foreground">
                                Nenhuma corrida registrada neste dia.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </article>
                )}
              </div>
            )}
          </div>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Sobre os dados do relatório</summary>
            <p className="mt-2">
              Corridas concluídas são somadas na data da conclusão; designações, na data da
              atribuição. Registros antigos sem horário efetivo aparecem pela data de referência. O
              histórico de exclusões e redesignações começa com a implantação do hotfix e pode levar
              instantes para ser registrado.
            </p>
          </details>
        </>
      )}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Exportar relatório</DialogTitle>
            <DialogDescription>
              Competência e motoboys selecionados. Os totais permanecem integrais.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {(
              [
                { key: 'summary', label: 'Resumo mensal' },
                { key: 'journeys', label: 'Jornadas e odômetros' },
                { key: 'rides', label: 'Detalhes das corridas' },
              ] as const
            ).map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={exportOptions[key]}
                  onChange={(event) =>
                    setExportOptions((previous) => ({ ...previous, [key]: event.target.checked }))
                  }
                />
                {label}
              </label>
            ))}
            {exportOptions.rides && (
              <div className="space-y-2">
                <Select
                  value={exportOptions.rideFilter}
                  onValueChange={(value) =>
                    setExportOptions((previous) => ({
                      ...previous,
                      rideFilter: value as ReportExportOptions['rideFilter'],
                    }))
                  }
                >
                  <SelectTrigger aria-label="Corridas a exportar">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os registros</SelectItem>
                    <SelectItem value="completed">Somente concluídas no dia</SelectItem>
                    <SelectItem value="assigned">Somente designações registradas</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {detailCount} registros no detalhamento
                </p>
              </div>
            )}
            {!hasExport && (
              <p className="text-xs text-destructive">Selecione pelo menos uma seção.</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button
                disabled={!ready || !!exporting || !filtered.length || !hasExport}
                onClick={() => void exportData('pdf')}
              >
                <FileText className="mr-2 h-4 w-4" />
                {exporting === 'pdf' ? 'Gerando…' : 'PDF'}
              </Button>
              <Button
                variant="outline"
                disabled={!ready || !!exporting || !filtered.length || !hasExport}
                onClick={() => void exportData('xlsx')}
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                {exporting === 'xlsx' ? 'Gerando…' : 'XLSX'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
