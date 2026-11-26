import { describe, expect, it } from 'vitest';
import {
  buildMonthlyPdf,
  reportSheets,
  defaultReportExportOptions,
  exportDetails,
} from '../monthlyReportExport';
import type { MonthlySection } from '../monthlyReportModel';
const sections: MonthlySection[] = [
  {
    person: { id: 'm', name: 'Teste' },
    totalKm: 20,
    totalCompleted: 1,
    totalAssigned: 2,
    journeyDays: 1,
    incompleteKmDays: 0,
    days: [
      {
        date: '2026-11-26',
        startedAt: null,
        endedAt: null,
        startKm: 100,
        endKm: 120,
        km: 20,
        assigned: 2,
        completed: 1,
        journeyRecorded: true,
        details: [
          {
            id: 'a',
            client: 'Cliente A',
            address: 'Rua A',
            reference: 'a',
            assignedAt: '2026-11-26T12:00:00Z',
            completedAt: '2026-11-26T13:00:00Z',
            kind: 'assignment',
            status: 'Concluída',
          },
          {
            id: 'b',
            client: 'Cliente B',
            address: 'Rua B',
            reference: 'b',
            assignedAt: '2026-11-26T12:00:00Z',
            completedAt: null,
            kind: 'assignment',
            status: 'Pendente',
          },
        ],
      },
    ],
  },
];
describe('monthly report export options', () => {
  it('exports only selected sections', () => {
    const options = { ...defaultReportExportOptions, journeys: false, rides: false };
    expect(reportSheets(sections, options).map((s) => s.name)).toEqual(['Resumo mensal']);
    const pdf = buildMonthlyPdf(sections, '2026-11', options);
    expect(pdf).toContain('Resumo mensal');
    expect(pdf).not.toContain('Cliente A');
    expect(pdf).not.toContain('Teste | Jornadas');
  });
  it('filters detail records without changing summary totals', () => {
    const options = { ...defaultReportExportOptions, rideFilter: 'completed' as const };
    const sheets = reportSheets(sections, options);
    expect(sheets[2].rows).toHaveLength(1);
    expect(sheets[0].rows[0][3]).toBe(1);
    expect(exportDetails(sections[0].days[0], 'assigned')).toHaveLength(2);
    expect(buildMonthlyPdf(sections, '2026-11', options)).not.toContain('Cliente B');
  });
});
