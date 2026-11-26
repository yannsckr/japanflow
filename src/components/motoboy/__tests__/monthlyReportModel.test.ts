import { describe, expect, it } from 'vitest';
import { buildMonthlyReport, spDay, type Raw } from '../monthlyReportModel';
import { buildMonthlyPdf, reportSheets } from '../monthlyReportExport';
const people = [
  { id: 'luciano', name: 'Luciano' },
  { id: 'other', name: 'Outro' },
];
const legacy = {
  assigned_to: 'luciano',
  status: 'pending',
  created_at: '2026-11-26T11:00:00Z',
  client_name: 'Virage',
  location: 'Aquarius',
};
const assigned = { ...legacy, assigned_at: '2026-11-26T11:10:00Z' };
const complete = { ...assigned, status: 'completed', completed_at: '2026-11-26T13:00:00Z' };
const journey = {
  user_id: 'luciano',
  day: '2026-11-26',
  started_at: '2026-11-26T11:00:00Z',
  ended_at: '2026-11-26T21:00:00Z',
  start_odometer: 186463,
  end_odometer: 186771,
};
const event = (id: string, time: string, before: Raw | null, after: Raw | null) => ({
  id,
  data: { ride_id: 'ride', event_at: time, before, after },
});
const report = (
  r: Raw | null,
  history: ReturnType<typeof event>[] = [],
  journeys: Raw[] = [journey]
) => buildMonthlyReport('2026-11', people, journeys, r ? [{ id: 'ride', data: r }] : [], history);
const rider = (sections: ReturnType<typeof report>, id = 'luciano') =>
  sections.find((s) => s.person.id === id)!;
describe('monthly motoboy telemetry', () => {
  it('uses Sao Paulo day and actual odometer readings, not GPS estimates', () => {
    expect(spDay('2026-12-01T01:30:00Z')).toBe('2026-11-30');
    const section = rider(report(complete));
    expect(section.totalKm).toBe(308);
    expect(section.totalCompleted).toBe(1);
    expect(section.totalAssigned).toBe(1);
    expect(section.days[0].details[0].assignedAt).toBe('2026-11-26T11:10:00.000Z');
  });
  it('keeps open journeys and invalid readings unknown instead of zero', () => {
    const section = rider(
      report(assigned, [], [{ ...journey, ended_at: null, end_odometer: null }])
    );
    expect(section.days[0].km).toBeNull();
    expect(section.totalKm).toBe(0);
    expect(section.incompleteKmDays).toBe(1);
    expect(section.totalCompleted).toBe(0);
    const invalid = rider(report(null, [], [{ ...journey, end_odometer: 180000 }]));
    expect(invalid.days[0].km).toBeNull();
  });
  it('does not misrepresent creation as designation for legacy rides', () => {
    const section = rider(report(legacy));
    expect(section.totalAssigned).toBe(1);
    expect(section.days[0].details[0].assignedAt).toBeNull();
    expect(section.days[0].date).toBe('2026-11-26');
  });
  it('reconciles out-of-order duplicate events, reassignment and deleted completion', () => {
    const other = { ...assigned, assigned_to: 'other', assigned_at: '2026-11-26T12:10:00Z' };
    const done = { ...other, status: 'completed', completed_at: '2026-11-26T13:00:00Z' };
    const assign = event('1', '2026-11-26T11:10:00Z', null, assigned);
    const reassign = event('2', '2026-11-26T12:10:00Z', assigned, other);
    const finish = event('3', '2026-11-26T13:00:00Z', other, done);
    const remove = event('4', '2026-11-26T14:00:00Z', done, null);
    const sections = report(null, [remove, finish, reassign, assign, assign]);
    expect(rider(sections).days[0].details[0].status).toBe('Redesignada');
    expect(rider(sections).totalCompleted).toBe(0);
    expect(rider(sections, 'other').totalCompleted).toBe(1);
    expect(rider(sections, 'other').days[0].details[0].status).toBe('Concluída (excluída)');
  });
  it('counts completion on the correct month, not the assignment month', () => {
    const later = { ...complete, completed_at: '2026-12-01T13:00:00Z' };
    expect(rider(report(later)).totalCompleted).toBe(0);
    const dec = rider(buildMonthlyReport('2026-12', people, [], [{ id: 'ride', data: later }], []));
    expect(dec.totalCompleted).toBe(1);
    expect(dec.totalAssigned).toBe(0);
    expect(dec.days[0].details[0].kind).toBe('completion');
  });
  it('uses the event time only when an actual designation was observed', () => {
    const change = event('1', '2026-11-26T11:10:00Z', { ...legacy, assigned_to: null }, legacy);
    const section = rider(report(legacy, [change]));
    expect(section.totalAssigned).toBe(1);
    expect(section.days[0].details[0].assignedAt).toBe('2026-11-26T11:10:00.000Z');
  });
  it('does not count a synthetic summary of previously completed rides as a new delivery', () => {
    const section = rider(report({ ...complete, report_summary_only: true }));
    expect(section.totalCompleted).toBe(0);
    expect(section.totalAssigned).toBe(0);
  });
  it('does not duplicate counts when the completion also exists in history and live', () => {
    const section = rider(
      report(complete, [
        event('1', '2026-11-26T11:10:00Z', null, assigned),
        event('2', '2026-11-26T13:00:00Z', assigned, complete),
      ])
    );
    expect(section.totalAssigned).toBe(1);
    expect(section.totalCompleted).toBe(1);
  });
  it('shares numeric monthly totals across screen and both exports', () => {
    const sections = report(complete);
    const sheets = reportSheets(sections);
    expect(sheets.map((s) => s.name)).toEqual(['Resumo mensal', 'Jornadas', 'Corridas']);
    expect(sheets[0].rows[sheets[0].rows.length - 1]).toEqual(['TOTAL DO MÊS', 1, 1, 1, 308, 0]);
    expect(sheets[1].rows[0][4]).toBe(186463);
    const pdf = buildMonthlyPdf(sections, '2026-11');
    expect(pdf).toContain('%PDF-1.4');
    expect(pdf).toContain('/MediaBox [0 0 842 595]');
    expect(pdf).toContain('308,0');
  });
});
