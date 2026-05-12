import { NextResponse } from 'next/server';
import { fetchTab } from '@/lib/sheets/client';
import { TABS, type TabName } from '@/lib/sheets/tabs';

export const revalidate = 3600;
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { tab: string } }) {
  const tab = params.tab;
  if (!(TABS as readonly string[]).includes(tab)) {
    return NextResponse.json({ error: `Unknown tab: ${tab}` }, { status: 400 });
  }
  try {
    const rows = await fetchTab(tab as TabName);
    return NextResponse.json({
      tab,
      rows,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
