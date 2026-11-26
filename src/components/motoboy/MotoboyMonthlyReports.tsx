import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type Query,
} from 'firebase/firestore';
import { DateTime } from 'luxon';
import { CalendarDays, FileSpreadsheet, FileText, Gauge, PackageCheck, Clock3 } from 'lucide-react';
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
  const exportData = async (format: 'pdf' | 'xlsx') => {
    if (!ready || exporting || !filtered.length) return;
    setExporting(format);
    try {
      const blob =
        format === 'pdf'
          ? new Blob([buildMonthlyPdf(filtered, month)], { type: 'application/pdf' })
          : await buildMonthlyXlsx(filtered, month);
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
  return (
    <section className="min-w-0 space-y-4" aria-label="Acompanhamento mensal dos motoboys">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div>
          <p className="text-xs text-muted-foreground">Departamental / Motoboys</p>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold tracking-tight">
            <CalendarDays className="h-5 w-5 text-primary" /> Acompanhamento Mensal
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Jornadas, designações e quilometragem por competência.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="month"
            aria-label="Mês e ano do acompanhamento"
            value={month}
            onChange={(e) => validMonth(e.target.value) && setMonth(e.target.value)}
            className="h-9 w-[165px] text-xs"
          />
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="h-9 w-[210px] text-xs" aria-label="Filtrar motoboy">
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
        </div>
      </div>
      {!ready && !errors.length && (
        <p role="status" className="rounded-lg border p-4 text-sm text-muted-foreground">
          Aguardando confirmação dos dados pelo servidor. A exportação ficará bloqueada até
          sincronizar.
        </p>
      )}
      {errors.map((error) => (
        <p
          key={error}
          role="alert"
          className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      ))}
      {ready && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'Corridas concluídas', value: String(totals.completed), Icon: PackageCheck },
              { label: 'Km registrados', value: `${kmLabel(totals.km)} km`, Icon: Gauge },
              { label: 'Dias com jornada', value: String(totals.days), Icon: CalendarDays },
              { label: 'Designações registradas', value: String(totals.assigned), Icon: Clock3 },
            ].map(({ label, value, Icon }) => (
              <article key={label} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  {label}
                  <Icon className="h-4 w-4 shrink-0 text-primary" />
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
              </article>
            ))}
          </div>
          <p className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
            Corridas concluídas são somadas na data da conclusão; designações, na data da
            atribuição. Registros antigos sem horário efetivo aparecem pela data de referência, sem
            inventar horários. O histórico de exclusões e redesignações começa com a implantação
            deste hotfix e pode levar alguns instantes para ser registrado.{' '}
            {totals.missing > 0 &&
              `${totals.missing} dia(s) sem odômetro final válido: o total de km é parcial.`}
          </p>
          {!filtered.length && (
            <p className="rounded-lg border p-4 text-sm text-muted-foreground">
              Nenhum motoboy encontrado para o filtro selecionado.
            </p>
          )}
          {filtered.map((section) => (
            <article
              key={section.person.id}
              className="overflow-hidden rounded-xl border border-border bg-card"
            >
              <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-4 py-3">
                <h3 className="font-semibold">{section.person.name}</h3>
                <span className="text-xs text-muted-foreground">
                  {section.totalCompleted} concluídas · {kmLabel(section.totalKm)} km registrados
                </span>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      {[
                        'Data',
                        'Início',
                        'Fim',
                        'Km inicial',
                        'Km final',
                        'Km dia',
                        'Designadas',
                        'Concluídas',
                        'Situação',
                        'Detalhes',
                      ].map((label) => (
                        <th key={label} className="whitespace-nowrap p-3 font-medium">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.days.map((day) => (
                      <Fragment key={day.date}>
                        <tr className="border-t border-border tabular-nums">
                          <td className="whitespace-nowrap p-3 font-medium">
                            {dateLabel(day.date)}
                          </td>
                          <td className="p-3">{timeLabel(day.startedAt)}</td>
                          <td className="p-3">{timeLabel(day.endedAt)}</td>
                          <td className="p-3">{kmLabel(day.startKm)}</td>
                          <td className="p-3">{kmLabel(day.endKm)}</td>
                          <td className="p-3 font-semibold">{kmLabel(day.km)}</td>
                          <td className="p-3">{day.assigned}</td>
                          <td className="p-3 font-semibold">{day.completed}</td>
                          <td className="whitespace-nowrap p-3">{journeyStatus(day)}</td>
                          <td className="p-3 text-muted-foreground">
                            {day.details.length} registro(s)
                          </td>
                        </tr>
                        {day.details.length > 0 && (
                          <tr className="border-t border-border/50">
                            <td colSpan={10} className="bg-muted/10 p-2">
                              <details className="rounded-lg border bg-card">
                                <summary className="cursor-pointer px-3 py-2 font-medium">
                                  Ver corridas de {dateLabel(day.date)} ({day.details.length})
                                </summary>
                                <div className="overflow-x-auto">
                                  <table className="w-full min-w-[820px] text-left text-xs">
                                    <thead className="bg-muted/30 text-muted-foreground">
                                      <tr>
                                        {[
                                          'Registro',
                                          'Designação',
                                          'Conclusão',
                                          'Cliente',
                                          'Endereço',
                                          'Referência (ID)',
                                          'Situação',
                                        ].map((label) => (
                                          <th key={label} className="p-2 font-medium">
                                            {label}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {day.details.map((ride) => (
                                        <tr key={ride.id} className="border-t border-border/60">
                                          <td className="p-2">
                                            {ride.kind === 'completion'
                                              ? 'Conclusão'
                                              : 'Designação'}
                                          </td>
                                          <td className="whitespace-nowrap p-2">
                                            {dateTimeLabel(ride.assignedAt)}
                                          </td>
                                          <td className="whitespace-nowrap p-2">
                                            {dateTimeLabel(ride.completedAt)}
                                          </td>
                                          <td className="p-2 font-medium">{ride.client}</td>
                                          <td className="min-w-[180px] break-words p-2">
                                            {ride.address}
                                          </td>
                                          <td className="max-w-[170px] break-all p-2 text-muted-foreground">
                                            {ride.reference}
                                          </td>
                                          <td className="whitespace-nowrap p-2">{ride.status}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </details>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                    {!section.days.length && (
                      <tr>
                        <td colSpan={10} className="p-5 text-muted-foreground">
                          Sem jornadas ou corridas registradas no mês.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot className="border-t bg-muted/40 font-semibold">
                    <tr>
                      <td colSpan={5} className="p-3">
                        TOTAL MENSAL
                      </td>
                      <td className="p-3 tabular-nums">{kmLabel(section.totalKm)}</td>
                      <td className="p-3 tabular-nums">{section.totalAssigned}</td>
                      <td className="p-3 tabular-nums">{section.totalCompleted}</td>
                      <td colSpan={2} className="p-3 text-xs text-muted-foreground">
                        {section.incompleteKmDays} dia(s) sem km válido
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </article>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Total do mês — filtro atual
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {totals.completed} corridas concluídas · {kmLabel(totals.km)} km registrados
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={!ready || !!exporting || !filtered.length}
                onClick={() => void exportData('pdf')}
              >
                <FileText className="mr-2 h-4 w-4" />
                {exporting === 'pdf' ? 'Gerando…' : 'Exportar PDF'}
              </Button>
              <Button
                variant="outline"
                disabled={!ready || !!exporting || !filtered.length}
                onClick={() => void exportData('xlsx')}
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                {exporting === 'xlsx' ? 'Gerando…' : 'Exportar XLSX'}
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
