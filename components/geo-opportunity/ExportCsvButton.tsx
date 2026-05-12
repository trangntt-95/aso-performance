'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toCsv, downloadCsv } from '@/lib/utils/csv';
import type { ActionQueueRow } from '@/lib/sheets/types';

interface Props {
  rows: ActionQueueRow[];
  country?: string;
  filename?: string;
}

export function ExportCsvButton({ rows, country, filename }: Props) {
  const exportRows = rows.map((r) => ({
    keyword: r.keyword,
    match_type: 'EXACT',
    bid_suggest: r.bidSuggest || '',
    country: r.country,
    target_camp: r.targetCamp,
    alert: r.alert,
    category: r.category,
    note: r.note,
  }));

  const handleClick = () => {
    if (exportRows.length === 0) return;
    const csv = toCsv(exportRows, [
      { key: 'keyword', header: 'Keyword' },
      { key: 'match_type', header: 'Match Type' },
      { key: 'bid_suggest', header: 'Bid Suggest' },
      { key: 'country', header: 'Country' },
      { key: 'target_camp', header: 'Target Camp' },
      { key: 'alert', header: 'Alert' },
      { key: 'category', header: 'Category' },
      { key: 'note', header: 'Note' },
    ]);
    const name =
      filename ??
      (country
        ? `geo-opportunity-${country.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`
        : 'geo-opportunity.csv');
    downloadCsv(name, csv);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 gap-1 text-xs"
      onClick={handleClick}
      disabled={exportRows.length === 0}
    >
      <Download className="h-3 w-3" />
      Export CSV ({exportRows.length})
    </Button>
  );
}
