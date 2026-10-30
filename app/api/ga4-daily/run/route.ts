import { NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchGa4Daily } from '@/lib/ga4/fetchDaily';

// Pipeline GA4 → sheet chạy NGAY TRÊN VERCEL (Vercel Cron), không cần máy Trang,
// không cần Claude/MCP/BigQuery, không cần secret mới: dùng GOOGLE_SERVICE_ACCOUNT_*
// (service account phải có Viewer trên GA4 property) và NET_VALUE_UPLOAD_TOKEN đã có.
//   1. lib/ga4/fetchDaily.ts kéo GA4 (trong tiến trình này, googleapis được Next đóng gói)
//   2. build-ga4-daily.mjs → push-ga4-daily.mjs → build-ga4-windows.mjs → push-ga4-windows.mjs
//      (script node thuần trong scripts/net-value, kèm vào bundle qua outputFileTracingIncludes)
// Gọi: Vercel Cron (Authorization: Bearer CRON_SECRET nếu có), hoặc tay với header
// x-upload-token = NET_VALUE_UPLOAD_TOKEN. ?days=N (mặc định 370), ?dry=1 chỉ kéo GA4.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const run = promisify(execFile);

function authorized(req: Request): boolean {
  const url = new URL(req.url);
  const cron = process.env.CRON_SECRET?.trim();
  const token = process.env.NET_VALUE_UPLOAD_TOKEN?.trim();
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  const hdr = req.headers.get('x-upload-token')?.trim();
  const key = url.searchParams.get('key')?.trim();
  if (cron && (bearer === cron || key === cron)) return true;
  if (token && (hdr === token || key === token)) return true;
  // Vercel Cron không có CRON_SECRET: chấp nhận header riêng của Vercel.
  if (!cron && req.headers.get('x-vercel-cron') === '1') return true;
  return false;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const days = Number(url.searchParams.get('days')) || 370;
  const dry = url.searchParams.get('dry') === '1';
  const origin = process.env.DASHBOARD_URL ?? `${url.protocol}//${url.host}`;

  const scripts = path.join(process.cwd(), 'scripts', 'net-value');
  const work = path.join('/tmp', `ga4-run-${Date.now()}`);
  await mkdir(work, { recursive: true });
  const env = { ...process.env, DASHBOARD_URL: origin };
  const started = Date.now();
  const log: Record<string, unknown> = {};

  const exec = async (name: string, script: string, args: string[]) => {
    const t = Date.now();
    const { stdout, stderr } = await run(process.execPath, [path.join(scripts, script), ...args], { cwd: work, env, maxBuffer: 64 * 1024 * 1024 });
    log[name] = { ms: Date.now() - t, out: stdout.trim().split('\n').slice(-6).map((l) => l.slice(0, 400)), err: stderr.trim().split('\n').slice(-4).filter(Boolean) };
    return stdout;
  };

  try {
    const t0 = Date.now();
    const ga = await fetchGa4Daily({ days });
    const sum = (rows: { users: number; installs: number }[], f: 'users' | 'installs') => rows.reduce((a, r) => a + r[f], 0);
    const summary = { startDate: ga.startDate, endDate: ga.endDate, daily: ga.daily.length, country: ga.country.length, users: sum(ga.daily, 'users'), installs: sum(ga.daily, 'installs'), lastDate: ga.daily.at(-1)?.date, quotaRemaining: ga.quotaRemaining };
    log.fetch = { ms: Date.now() - t0, out: ga.log };
    if (dry) return NextResponse.json({ ok: true, dry: true, summary, log, ms: Date.now() - started });
    if (!(summary.daily >= 1500 && summary.users >= 1000)) {
      return NextResponse.json({ ok: false, error: 'GA4 quá ít dòng/users, không đẩy', summary, log }, { status: 500 });
    }
    await writeFile(path.join(work, 'ga4-daily.json'), JSON.stringify({ rows: ga.daily }));
    await writeFile(path.join(work, 'ga4-daily-country.json'), JSON.stringify({ rows: ga.country }));

    const payload = await fetch(`${origin}/api/sheets`, { cache: 'no-store' });
    if (!payload.ok) throw new Error(`payload ${payload.status}`);
    await writeFile(path.join(work, 'payload.json'), await payload.text());

    await exec('build-daily', 'build-ga4-daily.mjs', [path.join(work, 'ga4-daily.json'), path.join(work, 'ga4-daily-country.json'), work, '200']);
    await exec('push-daily', 'push-ga4-daily.mjs', [path.join(work, 'ga4-daily-body.json'), path.join(work, 'ga4-daily-country-body.json')]);
    await exec('build-windows', 'build-ga4-windows.mjs', [path.join(work, 'ga4-daily.json'), path.join(work, 'ga4-daily-country.json'), path.join(work, 'payload.json'), path.join(work, 'ga4-windows-body.json')]);
    await exec('push-windows', 'push-ga4-windows.mjs', [path.join(work, 'ga4-windows-body.json')]);

    const after = await fetch(`${origin}/api/sheets`, { cache: 'no-store' }).then((r) => r.json());
    const q = after.data ?? after;
    const hist: { snapshotDate: string }[] = q.historyDaily ?? [];
    const lastDate = hist.map((r) => r.snapshotDate).sort().pop();
    const verify = { historyDailySource: q.historyDailySource, rows: hist.length, lastDate, allL30: q.allL30?.length, keywordTabsSource: q.keywordTabsSource };
    const ok = lastDate === summary.endDate;
    return NextResponse.json({ ok, summary, verify, log, ms: Date.now() - started }, { status: ok ? 200 : 500 });
  } catch (err) {
    const e = err as Error & { stdout?: string; stderr?: string };
    return NextResponse.json({ ok: false, error: e.message, stderr: e.stderr?.slice(-2000), stdout: e.stdout?.slice(-1000), log, ms: Date.now() - started }, { status: 500 });
  }
}
