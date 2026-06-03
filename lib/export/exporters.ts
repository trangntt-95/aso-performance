'use client';

export type Cell = string | number;
export interface ExportSheet {
  name: string; // becomes the Excel tab name (truncated to 31 chars)
  rows: Cell[][]; // first row = header
}

export const pct = (v: number | null | undefined): string =>
  v === null || v === undefined || Number.isNaN(v) ? '' : `${(v * 100).toFixed(1)}%`;

export function sanitizeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'export';
}

function triggerDownload(content: BlobPart, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Multi-sheet Excel (.xlsx). Empty sheets (header-only) are skipped. */
export async function downloadExcel(sheets: ExportSheet[], baseName: string): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  let added = 0;
  for (const s of sheets) {
    if (s.rows.length <= 1) continue;
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name.slice(0, 31));
    added++;
  }
  if (added === 0 && sheets[0]) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets[0].rows), sheets[0].name.slice(0, 31));
  }
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  triggerDownload(
    out,
    `${sanitizeFilename(baseName)}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
}

/** Single CSV with sections stacked (BOM for Excel UTF-8). */
export async function downloadCsv(sheets: ExportSheet[], baseName: string): Promise<void> {
  const XLSX = await import('xlsx');
  const combined: Cell[][] = [];
  sheets.forEach((s, i) => {
    if (i > 0) combined.push([]);
    combined.push([`== ${s.name} ==`]);
    for (const r of s.rows) combined.push(r);
  });
  const csv = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(combined));
  triggerDownload('﻿' + csv, `${sanitizeFilename(baseName)}.csv`, 'text/csv;charset=utf-8;');
}
