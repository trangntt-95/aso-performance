'use client';

import { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Loader2, ChevronDown } from 'lucide-react';
import { downloadExcel, downloadCsv, type ExportSheet } from '@/lib/export/exporters';
import { cn } from '@/lib/utils';

/**
 * Generic download button. `getSheets` is called lazily on click so big tables
 * aren't built on every render. `filename` is the base name (no extension).
 */
export function DownloadMenu({
  getSheets,
  filename,
  size = 'sm',
}: {
  getSheets: () => ExportSheet[];
  filename: string;
  size?: 'sm' | 'xs';
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (fn: (s: ExportSheet[], name: string) => Promise<void>) => {
    setOpen(false);
    setBusy(true);
    try {
      await fn(getSheets(), filename);
    } catch (e) {
      console.error('Export failed', e);
      alert('Tải file lỗi — xem console.');
    } finally {
      setBusy(false);
    }
  };

  const btn =
    size === 'xs'
      ? 'px-2 py-1 text-[11px]'
      : 'px-2.5 py-1.5 text-xs';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50',
          btn,
        )}
        title="Tải dữ liệu"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        Tải về
        <ChevronDown className={cn('h-3 w-3 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-52 rounded-md border border-slate-200 bg-white shadow-lg py-1 text-xs">
            <button
              type="button"
              onClick={() => run(downloadExcel)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              <span>
                <span className="font-medium text-slate-800">Excel (.xlsx)</span>
                <span className="block text-[10px] text-slate-500">Nhiều sheet</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => run(downloadCsv)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"
            >
              <FileText className="h-4 w-4 text-sky-600" />
              <span>
                <span className="font-medium text-slate-800">CSV (.csv)</span>
                <span className="block text-[10px] text-slate-500">1 file gộp</span>
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
