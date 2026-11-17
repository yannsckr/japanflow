import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where, type Timestamp } from 'firebase/firestore';
import { Download, FileText, Gauge, CalendarDays } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { MotoboyAssignment } from '@/hooks/useDepartmental';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Journey {
  user_id: string;
  day: string;
  started_at?: Timestamp;
  ended_at?: Timestamp;
  lunch_started_at?: Timestamp;
  lunch_ended_at?: Timestamp;
  start_odometer?: number;
  end_odometer?: number | null;
  odometer_km?: number;
  start_ai_verified?: boolean;
  end_ai_verified?: boolean;
}
type Person = { id: string; name: string };
type ReportRow = {
  date: string;
  lunch: string;
  opening: string;
  closing: string;
  odometer: string;
  predicted: string;
  confirmed: boolean;
};
const time = (value?: Timestamp) =>
  value?.toDate?.().toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  }) || '—';
const km = (n?: number | null) =>
  n == null
    ? '—'
    : n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const spDay = (d: string | null | undefined) => {
  if (!d) return '';
  const date = new Date(d);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date)
    : '';
};

// Gerador PDF local (sem servidor externo e sem dependência adicional).
// Acentos são transliterados para os 14 tipos básicos de fonte do PDF.
function savePdf(filename: string, lines: string[]) {
  const clean = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7e]/g, '?')
      .replace(/([\\()])/g, '\\$1');
  const pages: string[] = [];
  for (let i = 0; i < lines.length; i += 48) {
    const content = lines
      .slice(i, i + 48)
      .map(
        (line, idx) => `BT /F1 9 Tf 40 ${795 - idx * 16} Td (${clean(line).slice(0, 125)}) Tj ET`
      )
      .join('\n');
    pages.push(content);
  }
  if (!pages.length) pages.push('');
  const objects: string[] = [];
  const put = (x: string) => {
    objects.push(x);
    return objects.length;
  };
  const catalog = put('');
  const pagesObj = put('');
  const font = put('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
  const pageIds: number[] = [];
  for (const page of pages) {
    const stream = put(`<< /Length ${page.length} >>\nstream\n${page}\nendstream`);
    pageIds.push(
      put(
        `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${stream} 0 R >>`
      )
    );
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [i, obj] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  }
  const xrefAt = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  const objectUrl = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
}

export default function MotoboyMonthlyReports({
  motoboys,
  assignments,
}: {
  motoboys: Person[];
  assignments: MotoboyAssignment[];
}) {
  const [month, setMonth] = useState(() =>
    new Date()
      .toLocaleDateString('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
      })
      .slice(0, 7)
  );
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError('');
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    return onSnapshot(
      query(
        collection(db, 'motoboy_journeys'),
        where('day', '>=', `${month}-01`),
        where('day', '<=', `${month}-31`)
      ),
      (snapshot) => {
        setJourneys(snapshot.docs.map((d) => d.data() as Journey));
        setLoading(false);
      },
      () => {
        setError('Sem permissão para consultar jornadas ou falha de conexão.');
        setJourneys([]);
        setLoading(false);
      }
    );
  }, [month]);

  const sections = useMemo(
    () =>
      motoboys.map((m) => {
        const days = journeys
          .filter((item) => item.user_id === m.id)
          .sort((a, b) => a.day.localeCompare(b.day));
        const reportRows: ReportRow[] = days.map((j) => {
          // Rota agrupada: soma perna(s) e o retorno à loja somente uma vez.
          const expected = assignments
            .filter(
              (ride) =>
                ride.assignedTo === m.id &&
                spDay(ride.completedAt || ride.scheduledFor || ride.createdAt) === j.day
            )
            .reduce(
              (total, ride) =>
                total +
                (ride.expectedLegMeters ?? ride.expectedDistanceMeters ?? 0) +
                (ride.expectedReturnMeters ?? 0),
              0
            );
          return {
            date: j.day.split('-').reverse().join('/'),
            lunch: j.lunch_started_at
              ? `${time(j.lunch_started_at)} às ${time(j.lunch_ended_at)}`
              : '—',
            opening: km(j.start_odometer),
            closing: km(j.end_odometer),
            odometer: km(j.odometer_km),
            predicted: expected ? km(expected / 1000) : '—',
            confirmed: !!(j.start_ai_verified && j.end_ai_verified),
          };
        });
        return {
          name: m.name,
          userId: m.id,
          rows: reportRows,
          totalActual: days.reduce((sum, j) => sum + (j.odometer_km || 0), 0),
          totalPredicted: reportRows.reduce(
            (sum, row) =>
              sum +
              (row.predicted === '—'
                ? 0
                : Number(row.predicted.replace(/\./g, '').replace(',', '.'))),
            0
          ),
        };
      }),
    [assignments, journeys, motoboys]
  );

  const exportPdf = () => {
    const lines = [
      'JAPANFLOW - RELATORIO MENSAL DE JORNADA',
      `Referencia: ${month}  |  Gerado: ${new Date().toLocaleString('pt-BR')}`,
      'KM previstos: somatorio de distancias viarias disponiveis.',
      'KM realizados: diferenca entre odometros validados.',
      '',
    ];
    for (const section of sections) {
      lines.push(`MOTOBOY: ${section.name}`);
      lines.push('Data       Almoco             KM inicial KM final  KM dia  KM previsto');
      for (const row of section.rows) {
        lines.push(
          `${row.date.padEnd(11)}${row.lunch.padEnd(19)}${row.opening.padEnd(11)}${row.closing.padEnd(10)}${row.odometer.padEnd(8)}${row.predicted}`
        );
      }
      if (!section.rows.length) lines.push('Nenhuma jornada registrada neste mes.');
      lines.push(
        `TOTAL KM ODOMETRO: ${km(section.totalActual)} | TOTAL PREVISTO: ${km(section.totalPredicted)}`,
        '',
        ''
      );
    }
    lines.push('Informacoes para controle interno; GPS e odometro sao medicoes independentes.');
    savePdf(`JapanFlow-Jornada-${month}.pdf`, lines);
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <CalendarDays className="h-4 w-4 text-primary" /> Relatório mensal de jornadas
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Por motoboy · odômetro, almoço e estimativa de rota
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="month"
            aria-label="Mês do relatório"
            className="h-9 w-[160px] text-xs"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 gap-1.5"
            disabled={loading || !!error}
            onClick={exportPdf}
          >
            <Download className="h-4 w-4" /> Baixar PDF
          </Button>
        </div>
      </div>
      {loading && <p className="text-xs text-muted-foreground">Carregando jornadas…</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!error && !loading && (
        <div className="grid min-w-0 gap-3 xl:grid-cols-2">
          {sections.map((section) => (
            <article
              key={section.userId}
              className="min-w-0 overflow-hidden rounded-xl border border-border"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  <FileText className="h-4 w-4 text-primary" /> {section.name}
                </h4>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Gauge className="h-3.5 w-3.5" /> {km(section.totalActual)} km no mês
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-[11px]">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="p-2">Data</th>
                      <th className="p-2">Almoço</th>
                      <th className="p-2">Inicial</th>
                      <th className="p-2">Final</th>
                      <th className="p-2">Km dia</th>
                      <th className="p-2">Km previsto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map((row) => (
                      <tr key={row.date} className="border-t border-border">
                        <td className="p-2">{row.date}</td>
                        <td className="p-2 whitespace-nowrap">{row.lunch}</td>
                        <td className="p-2 tabular-nums">{row.opening}</td>
                        <td className="p-2 tabular-nums">{row.closing}</td>
                        <td className="p-2 tabular-nums font-medium">{row.odometer}</td>
                        <td className="p-2 tabular-nums">{row.predicted}</td>
                      </tr>
                    ))}
                    {!section.rows.length && (
                      <tr>
                        <td className="p-4 text-muted-foreground" colSpan={6}>
                          Sem jornadas registradas neste mês.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
                Previstos registrados: {km(section.totalPredicted)} km. Valores ausentes não são
                estimados.
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
