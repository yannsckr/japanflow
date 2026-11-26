import {
  dateLabel,
  dateTimeLabel,
  kmLabel,
  timeLabel,
  type MonthlySection,
  type DayReport,
} from './monthlyReportModel';

type Cell = string | number | null;
type Sheet = {
  name: string;
  headers: string[];
  widths: number[];
  rows: Cell[][];
  kmColumns: number[];
  total: boolean;
};
export const journeyStatus = (day: DayReport) =>
  day.km !== null
    ? 'Encerrada'
    : !day.journeyRecorded
      ? 'Sem jornada'
      : day.endedAt
        ? 'Odômetro incompleto'
        : 'Em aberto';
const total = (sections: MonthlySection[]) => ({
  days: sections.reduce((sum, s) => sum + s.journeyDays, 0),
  assigned: sections.reduce((sum, s) => sum + s.totalAssigned, 0),
  completed: sections.reduce((sum, s) => sum + s.totalCompleted, 0),
  km: Math.round(sections.reduce((sum, s) => sum + s.totalKm, 0) * 10) / 10,
  missing: sections.reduce((sum, s) => sum + s.incompleteKmDays, 0),
});
export function reportSheets(sections: MonthlySection[]): Sheet[] {
  const t = total(sections);
  return [
    {
      name: 'Resumo mensal',
      headers: [
        'Motoboy',
        'Dias com jornada',
        'Designações registradas',
        'Corridas concluídas',
        'Km registrados',
        'Dias sem km válido',
      ],
      widths: [32, 20, 26, 23, 20, 23],
      kmColumns: [4],
      total: true,
      rows: [
        ...sections.map((s) => [
          s.person.name,
          s.journeyDays,
          s.totalAssigned,
          s.totalCompleted,
          s.totalKm,
          s.incompleteKmDays,
        ]),
        ['TOTAL DO MÊS', t.days, t.assigned, t.completed, t.km, t.missing],
      ],
    },
    {
      name: 'Jornadas',
      headers: [
        'Motoboy',
        'Data',
        'Início da jornada',
        'Fim da jornada',
        'Km inicial',
        'Km final',
        'Km dia',
        'Designações',
        'Concluídas',
        'Situação',
      ],
      widths: [28, 15, 22, 22, 16, 16, 16, 17, 17, 27],
      kmColumns: [4, 5, 6],
      total: true,
      rows: [
        ...sections.flatMap((s) =>
          s.days.map((d) => [
            s.person.name,
            dateLabel(d.date),
            timeLabel(d.startedAt),
            timeLabel(d.endedAt),
            d.startKm,
            d.endKm,
            d.km,
            d.assigned,
            d.completed,
            journeyStatus(d),
          ])
        ),
        [
          'TOTAL DO MÊS',
          null,
          null,
          null,
          null,
          null,
          t.km,
          t.assigned,
          t.completed,
          `${t.missing} dia(s) sem km válido`,
        ],
      ],
    },
    {
      name: 'Corridas',
      headers: [
        'Motoboy',
        'Data de referência',
        'Registro',
        'Designação (data/hora)',
        'Conclusão (data/hora)',
        'Cliente',
        'Endereço',
        'Referência (ID)',
        'Situação',
      ],
      widths: [28, 20, 20, 27, 27, 30, 65, 32, 26],
      kmColumns: [],
      total: false,
      rows: sections.flatMap((s) =>
        s.days.flatMap((d) =>
          d.details.map((r) => [
            s.person.name,
            dateLabel(d.date),
            r.kind === 'completion' ? 'Conclusão' : 'Designação',
            dateTimeLabel(r.assignedAt),
            dateTimeLabel(r.completedAt),
            r.client,
            r.address,
            r.reference,
            r.status,
          ])
        )
      ),
    },
  ];
}
const xml = (v: string) =>
  v
    .split('')
    .filter((char) => {
      const code = char.charCodeAt(0);
      return (
        (code >= 32 || code === 9 || code === 10 || code === 13) &&
        code !== 0xfffe &&
        code !== 0xffff
      );
    })
    .join('')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
const col = (index: number) => {
  let value = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    value = String.fromCharCode(65 + ((n - 1) % 26)) + value;
  return value;
};
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const pkg = 'http://schemas.openxmlformats.org/package/2006/relationships';
const cell = (value: Cell, row: number, column: number, style: number) => {
  const ref = `${col(column)}${row}`;
  if (value === null) return `<c r="${ref}" s="${style}"/>`;
  if (typeof value === 'number' && Number.isFinite(value))
    return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  // Inline strings are literal, including client names beginning with =, +, - or @.
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(String(value).slice(0, 32767))}</t></is></c>`;
};
const styles = `${declaration}<styleSheet xmlns="${ns}"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.0"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FF222222"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF252525"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3E3E2"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="2" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
function sheetXml(sheet: Sheet) {
  const all = [sheet.headers, ...sheet.rows];
  const rows = all
    .map((row, i) => {
      const isTotal = i > 0 && sheet.total && i === all.length - 1;
      const height =
        i === 0
          ? 32
          : Math.min(
              409,
              Math.max(
                19,
                5 +
                  15 *
                    Math.max(
                      ...row.map((v, j) =>
                        Math.ceil(String(v ?? '').length / Math.max(1, sheet.widths[j] - 2))
                      )
                    )
              )
            );
      return `<row r="${i + 1}" ht="${height}" customHeight="1">${row.map((v, j) => cell(v, i + 1, j, i === 0 ? 1 : isTotal ? (sheet.kmColumns.includes(j) ? 4 : 3) : sheet.kmColumns.includes(j) ? 2 : 0)).join('')}</row>`;
    })
    .join('');
  const last = col(sheet.headers.length - 1);
  return `${declaration}<worksheet xmlns="${ns}"><dimension ref="A1:${last}${all.length}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="19"/><cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${rows}</sheetData>${sheet.rows.length ? `<autoFilter ref="A1:${last}${Math.max(1, all.length - (sheet.total ? 1 : 0))}"/>` : ''}</worksheet>`;
}
export async function buildMonthlyXlsx(sections: MonthlySection[], month: string) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const sheets = reportSheets(sections);
  const nsTypes = 'http://schemas.openxmlformats.org/package/2006/content-types';
  zip.file(
    '[Content_Types].xml',
    `${declaration}<Types xmlns="${nsTypes}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`
  );
  zip.file(
    '_rels/.rels',
    `${declaration}<Relationships xmlns="${pkg}"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="${pkg}/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`
  );
  zip.file(
    'docProps/core.xml',
    `${declaration}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>JapanFlow - Acompanhamento Mensal ${xml(month)}</dc:title><dc:description>Km por odômetro; corridas por data de conclusão; datas de referência de registros legados não comprovam designação.</dc:description></cp:coreProperties>`
  );
  zip.file(
    'xl/workbook.xml',
    `${declaration}<workbook xmlns="${ns}" xmlns:r="${rel}"><bookViews><workbookView/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `${declaration}<Relationships xmlns="${pkg}">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${rel}/styles" Target="styles.xml"/></Relationships>`
  );
  zip.file('xl/styles.xml', styles);
  sheets.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)));
  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// Local, landscape PDF: actual file download (not the browser print dialog).
// PDF text streams use ASCII escapes with WinAnsiEncoding; offsets are byte-safe.
const ansi = (s: string) =>
  [...s.replace(/[\r\n\t]/g, ' ')]
    .map((c) => {
      const n = c.codePointAt(0)!;
      if (c === '(' || c === ')' || c === '\\') return '\\' + c;
      if (n >= 32 && n <= 126) return c;
      if (n >= 160 && n <= 255) return '\\' + n.toString(8).padStart(3, '0');
      if (c === '—' || c === '–') return '-';
      return c
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\x20-\x7e]/g, '?')
        .replace(/[\\()]/g, '\\$&');
    })
    .join('');
function wrap(value: Cell, width: number) {
  const max = Math.max(1, Math.floor((width - 10) / 4.8));
  const lines: string[] = [];
  let current = '';
  for (const word of String(value ?? '—')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')) {
    if (current && current.length + word.length + 1 > max) {
      lines.push(current);
      current = '';
    }
    if (word.length > max) {
      for (let i = 0; i < word.length; i += max) {
        const part = word.slice(i, i + max);
        if (part.length === max) lines.push(part);
        else current = part;
      }
    } else current += (current ? ' ' : '') + word;
  }
  if (current || !lines.length) lines.push(current);
  return lines;
}
export function buildMonthlyPdf(sections: MonthlySection[], month: string) {
  const pages: string[] = [];
  let ops: string[] = [];
  let y = 0;
  const line = (
    value: string,
    x: number,
    top: number,
    font = 'F1',
    size = 9,
    color = '0.12 0.12 0.12'
  ) =>
    ops.push(
      `${color} rg BT /${font} ${size} Tf ${x.toFixed(2)} ${top.toFixed(2)} Td (${ansi(value)}) Tj ET`
    );
  const rect = (x: number, top: number, w: number, h: number, color: string) =>
    ops.push(`${color} rg ${x} ${top - h} ${w} ${h} re f`);
  const start = () => {
    if (ops.length) pages.push(ops.join('\n'));
    ops = [];
    rect(0, 595, 842, 5, '0.76 0.08 0.07');
    line('JapanFlow | Acompanhamento Mensal', 28, 563, 'F2', 17);
    line(`Competência: ${month}  |  Horário: America/Sao_Paulo`, 28, 546, 'F1', 9);
    line(
      'Km: odômetros de jornadas encerradas. Concluídas: data da conclusão. Legados: horário não registrado.',
      28,
      532,
      'F1',
      8
    );
    line(`Página ${pages.length + 1}`, 750, 19, 'F1', 8);
    y = 512;
  };
  start();
  const heading = (title: string) => {
    line(title, 28, y - 13, 'F2', 10);
    y -= 23;
  };
  const drawRow = (
    cells: string[][],
    widths: number[],
    count: number,
    offset: number,
    header: boolean,
    shaded: boolean
  ) => {
    const height = count * 11 + 8;
    let x = 28;
    if (header || shaded)
      rect(
        x,
        y,
        widths.reduce((a, b) => a + b, 0),
        height,
        header ? '0.15 0.15 0.15' : '0.96 0.93 0.93'
      );
    for (let j = 0; j < widths.length; j++) {
      for (let i = 0; i < count; i++)
        if (cells[j]?.[offset + i] !== undefined)
          line(
            cells[j][offset + i],
            x + 5,
            y - 12 - i * 11,
            'F3',
            8,
            header ? '1 1 1' : '0.12 0.12 0.12'
          );
      x += widths[j];
    }
    ops.push(`0.82 G 0.4 w 28 ${y - height} m ${x} ${y - height} l S`);
    y -= height;
  };
  const table = (
    title: string,
    headers: string[],
    widths: number[],
    rows: Cell[][],
    lastTotal = false
  ) => {
    const hc = headers.map((v, i) => wrap(v, widths[i]));
    const hn = Math.max(...hc.map((a) => a.length));
    const header = () => {
      heading(title);
      drawRow(hc, widths, hn, 0, true, false);
    };
    if (y < 100 + hn * 11) start();
    header();
    rows.forEach((row, index) => {
      const cells = row.map((v, i) => wrap(v, widths[i]));
      const n = Math.max(...cells.map((c) => c.length));
      let offset = 0;
      while (offset < n) {
        let available = Math.floor((y - 35 - 8) / 11);
        if (available < 1) {
          start();
          header();
          available = Math.floor((y - 35 - 8) / 11);
        }
        const count = Math.min(n - offset, available);
        drawRow(cells, widths, count, offset, false, lastTotal && index === rows.length - 1);
        offset += count;
        if (offset < n) {
          start();
          header();
        }
      }
    });
    y -= 14;
  };
  const t = total(sections);
  table(
    'Resumo mensal',
    ['Motoboy', 'Dias jornada', 'Designações', 'Concluídas', 'Km registrados', 'Dias sem km'],
    [236, 105, 110, 105, 115, 115],
    [
      ...sections.map((s) => [
        s.person.name,
        s.journeyDays,
        s.totalAssigned,
        s.totalCompleted,
        kmLabel(s.totalKm),
        s.incompleteKmDays,
      ]),
      ['TOTAL DO MÊS', t.days, t.assigned, t.completed, kmLabel(t.km), t.missing],
    ],
    true
  );
  for (const s of sections) {
    const person = s.person.name.replace(/\s+/g, ' ').slice(0, 95);
    table(
      `${person} | Jornadas`,
      [
        'Data',
        'Início',
        'Fim',
        'Km inicial',
        'Km final',
        'Km dia',
        'Designadas',
        'Concluídas',
        'Situação',
      ],
      [78, 72, 72, 94, 94, 82, 80, 80, 134],
      [
        ...s.days.map((d) => [
          dateLabel(d.date),
          timeLabel(d.startedAt),
          timeLabel(d.endedAt),
          kmLabel(d.startKm),
          kmLabel(d.endKm),
          kmLabel(d.km),
          d.assigned,
          d.completed,
          journeyStatus(d),
        ]),
        [
          'TOTAL',
          '—',
          '—',
          '—',
          '—',
          kmLabel(s.totalKm),
          s.totalAssigned,
          s.totalCompleted,
          `${s.incompleteKmDays} sem km`,
        ],
      ],
      true
    );
    const details = s.days.flatMap((d) =>
      d.details.map((r) => [
        dateLabel(d.date),
        r.kind === 'completion' ? 'Conclusão' : 'Designação',
        dateTimeLabel(r.assignedAt),
        dateTimeLabel(r.completedAt),
        r.client,
        r.address,
        r.reference,
        r.status,
      ])
    );
    if (details.length)
      table(
        `${person} | Corridas`,
        [
          'Data ref.',
          'Registro',
          'Designação',
          'Conclusão',
          'Cliente',
          'Endereço',
          'Referência (ID)',
          'Situação',
        ],
        [63, 61, 92, 92, 116, 166, 105, 91],
        details
      );
  }
  if (ops.length) pages.push(ops.join('\n'));
  const objects = [
    '',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>',
  ];
  const ids: number[] = [];
  for (const page of pages) {
    const content = objects.push(`<< /Length ${page.length} >>\nstream\n${page}\nendstream`);
    ids.push(
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${content} 0 R >>`
      )
    );
  }
  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[1] = `<< /Type /Pages /Count ${ids.length} /Kids [${ids.map((id) => `${id} 0 R`).join(' ')}] >>`;
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => String(n).padStart(10, '0') + ' 00000 n \n')
    .join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}
export function downloadReport(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
