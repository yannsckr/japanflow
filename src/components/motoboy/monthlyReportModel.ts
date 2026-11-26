// One model drives the screen, PDF and XLSX. No GPS estimate is used as odometer data.
export type Person = { id: string; name: string };
export type Raw = Record<string, unknown>;
export type RideRecord = { id: string; data: Raw };
export type HistoryRecord = { id: string; data: Raw };
export type RideDetail = {
  id: string;
  client: string;
  address: string;
  reference: string;
  assignedAt: string | null;
  completedAt: string | null;
  kind: 'assignment' | 'completion';
  status: string;
};
export type DayReport = {
  date: string;
  startedAt: string | null;
  endedAt: string | null;
  startKm: number | null;
  endKm: number | null;
  km: number | null;
  assigned: number;
  completed: number;
  journeyRecorded: boolean;
  details: RideDetail[];
};
export type MonthlySection = {
  person: Person;
  days: DayReport[];
  totalKm: number;
  totalCompleted: number;
  totalAssigned: number;
  journeyDays: number;
  incompleteKmDays: number;
};
const TZ = 'America/Sao_Paulo';
const text = (value: unknown) => (typeof value === 'string' ? value : '');
const raw = (value: unknown): Raw | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : null;
export function iso(value: unknown): string | null {
  try {
    const t = value as { toDate?: () => Date } | null;
    const d =
      typeof t?.toDate === 'function'
        ? t.toDate()
        : typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(value)
          ? new Date(value)
          : null;
    return d && Number.isFinite(d.getTime()) ? d.toISOString() : null;
  } catch {
    return null;
  }
}
export function spDay(value: unknown): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = iso(value);
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(date));
  const part = (key: string) => parts.find((p) => p.type === key)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export const dateLabel = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : '—';
export const timeLabel = (value: string | null) =>
  value
    ? new Date(value).toLocaleTimeString('pt-BR', {
        timeZone: TZ,
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
export const dateTimeLabel = (value: string | null) =>
  value ? `${dateLabel(spDay(value))} ${timeLabel(value)}` : 'Não registrado';
export const kmLabel = (value: number | null) =>
  value === null
    ? '—'
    : value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const reading = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const statusLabel = (status: string) =>
  ({
    completed: 'Concluída',
    accepted: 'Em andamento',
    pending: 'Pendente',
    pending_approval: 'Aguardando aprovação',
    cancelled: 'Cancelada',
    canceled: 'Cancelada',
  })[status] ||
  status ||
  'Pendente';

type Segment = {
  rideId: string;
  userId: string;
  assignedAt: string | null;
  referenceDay: string;
  completedAt: string | null;
  status: string;
  client: string;
  address: string;
  reference: string;
};
type Event = { id: string; at: string; before: Raw | null; after: Raw | null };
function assignmentSegments(rideId: string, events: Event[], live: Raw | null) {
  const segments: Segment[] = [];
  let active: Segment | null = null;
  const close = (reason: string) => {
    if (!active) return;
    if (active.status === 'Concluída' && reason === 'Excluída')
      active.status = 'Concluída (excluída)';
    else active.status = reason;
    active = null;
  };
  const observe = (state: Raw | null, at: string | null, observed: boolean) => {
    const userId = text(state?.assigned_to);
    if (
      !state ||
      !userId ||
      state.status === 'pending_approval' ||
      state.report_summary_only === true
    ) {
      close(state ? 'Desatribuída' : 'Excluída');
      return;
    }
    if (active && active.userId !== userId) close('Redesignada');
    if (!active) {
      // A real write observed by the history trigger is evidence of designation;
      // a legacy record's creation time is NOT a designation time.
      const assignedAt = iso(state.assigned_at) || (observed ? at : null);
      active = {
        rideId,
        userId,
        assignedAt,
        referenceDay:
          spDay(assignedAt) || spDay(state.created_at) || spDay(state.scheduled_for) || '',
        completedAt: null,
        status: '',
        client: '',
        address: '',
        reference: '',
      };
      segments.push(active);
    } else if (!active.assignedAt && iso(state.assigned_at)) {
      active.assignedAt = iso(state.assigned_at);
      active.referenceDay = spDay(active.assignedAt);
    }
    active.client = text(state.client_name) || text(state.description) || 'Cliente não informado';
    active.address = text(state.location) || 'Sem endereço';
    active.reference = text(state.source_order_task_id) || rideId;
    const previousStatus = active.status;
    active.status = statusLabel(text(state.status));
    if (state.status === 'completed') {
      active.completedAt =
        iso(state.completed_at) ||
        active.completedAt ||
        (observed && previousStatus !== 'Concluída' ? at : null);
    } else active.completedAt = null;
  };
  // Before snapshots recover a historical baseline. Event order is determined by
  // server write time, not by delivery order of the asynchronous Cloud Function.
  for (const event of events.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))) {
    observe(event.before, event.at, false);
    observe(event.after, event.at, true);
  }
  observe(live, null, false);
  // One actual completion per ride id. A deleted completed ride still counts;
  // a currently reopened ride does not count until it is completed again.
  const last = segments[segments.length - 1];
  const completion =
    last &&
    last.completedAt &&
    (last.status === 'Concluída' || last.status === 'Concluída (excluída)')
      ? last
      : null;
  return { segments, completion };
}
function blankDay(date: string): DayReport {
  return {
    date,
    startedAt: null,
    endedAt: null,
    startKm: null,
    endKm: null,
    km: null,
    assigned: 0,
    completed: 0,
    journeyRecorded: false,
    details: [],
  };
}
export function buildMonthlyReport(
  month: string,
  people: Person[],
  journeys: Raw[],
  rides: RideRecord[],
  history: HistoryRecord[]
): MonthlySection[] {
  const byUser = new Map<string, Map<string, DayReport>>();
  const names = new Map(people.map((p) => [p.id, p.name]));
  const getDay = (id: string, day: string) => {
    if (!id || !day.startsWith(`${month}-`) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    if (!byUser.has(id)) byUser.set(id, new Map());
    const rows = byUser.get(id)!;
    if (!rows.has(day)) rows.set(day, blankDay(day));
    return rows.get(day)!;
  };
  for (const journey of journeys) {
    const row = getDay(text(journey.user_id), text(journey.day));
    if (!row) continue;
    row.journeyRecorded = true;
    row.startedAt = iso(journey.started_at);
    row.endedAt = iso(journey.ended_at);
    row.startKm = reading(journey.start_odometer);
    row.endKm = reading(journey.end_odometer);
    row.km =
      row.startedAt &&
      row.endedAt &&
      row.startKm !== null &&
      row.endKm !== null &&
      row.endKm >= row.startKm
        ? Math.round((row.endKm - row.startKm) * 10) / 10
        : null;
  }
  const live = new Map(rides.map((r) => [r.id, r.data]));
  const eventMap = new Map<string, Event[]>();
  const seen = new Set<string>();
  for (const record of history) {
    const id = text(record.data.ride_id);
    const at = iso(record.data.event_at);
    if (!id || !at || seen.has(record.id)) continue;
    seen.add(record.id);
    if (!eventMap.has(id)) eventMap.set(id, []);
    eventMap
      .get(id)!
      .push({ id: record.id, at, before: raw(record.data.before), after: raw(record.data.after) });
  }
  for (const rideId of new Set([...live.keys(), ...eventMap.keys()])) {
    const { segments, completion } = assignmentSegments(
      rideId,
      eventMap.get(rideId) || [],
      live.get(rideId) || null
    );
    segments.forEach((segment, index) => {
      const detail: RideDetail = {
        id: `${rideId}-${index}`,
        client: segment.client,
        address: segment.address,
        reference: segment.reference,
        assignedAt: segment.assignedAt,
        completedAt: segment.completedAt,
        kind: 'assignment',
        status: segment.status,
      };
      const row = getDay(segment.userId, segment.referenceDay);
      if (row) {
        row.assigned++;
        row.details.push(detail);
      }
      if (completion === segment) {
        const finished = getDay(segment.userId, spDay(segment.completedAt));
        if (finished) {
          finished.completed++;
          if (finished !== row)
            finished.details.push({ ...detail, id: `${detail.id}-completion`, kind: 'completion' });
        }
      }
    });
  }
  for (const person of people) if (!byUser.has(person.id)) byUser.set(person.id, new Map());
  return Array.from(byUser, ([id, rows]) => {
    const days = [...rows.values()].sort((a, b) => a.date.localeCompare(b.date));
    for (const row of days)
      row.details.sort(
        (a, b) =>
          (a.assignedAt || '9999').localeCompare(b.assignedAt || '9999') || a.id.localeCompare(b.id)
      );
    return {
      person: { id, name: names.get(id) || `Motoboy (${id})` },
      days,
      totalKm: Math.round(days.reduce((sum, day) => sum + (day.km ?? 0), 0) * 10) / 10,
      totalCompleted: days.reduce((sum, day) => sum + day.completed, 0),
      totalAssigned: days.reduce((sum, day) => sum + day.assigned, 0),
      journeyDays: days.filter((day) => day.journeyRecorded).length,
      incompleteKmDays: days.filter((day) => day.km === null).length,
    };
  }).sort((a, b) => a.person.name.localeCompare(b.person.name, 'pt-BR'));
}
