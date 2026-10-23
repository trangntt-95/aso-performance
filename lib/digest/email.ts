// HTML email báo cáo vị trí và gửi qua Resend (REST, không cần SDK).
//
// Trang 23/10/2026: email CHỈ chứa keyword có biến động vị trí, tách hai
// phần: PAID (để action, kèm camp + gợi ý bid) và ORGANIC (để xem xu hướng).
// Không có users, không có bảng đầy đủ; bảng đầy đủ (vị trí + users) nằm ở
// tab Vị trí keyword trên dashboard.

import type { ActionItem, DigestRow, PositionDigest } from './positions';

const fmtPos = (p: number | null) => (p === null ? '—' : p.toFixed(1));
const fmtDelta = (d: number | null) => (d === null ? '—' : `${d > 0 ? '+' : ''}${d.toFixed(1)}`);
const dmy = (isoDate: string) => isoDate.split('-').reverse().join('/');
const where = (r: DigestRow) => (r.country ? r.country : 'mọi nước');

function deltaChip(d: number | null, threshold: number): string {
  if (d === null) return '<span style="color:#94a3b8">—</span>';
  const color = d >= threshold ? '#dc2626' : d <= -threshold ? '#059669' : '#64748b';
  const arrow = d >= threshold ? '▼' : d <= -threshold ? '▲' : '';
  return `<span style="color:${color};font-weight:${Math.abs(d) >= threshold ? 700 : 400}">${arrow}${fmtDelta(d)}</span>`;
}

function card(a: ActionItem, threshold: number): string {
  const r = a.row;
  const isWin = a.kind === 'win';
  const high = a.severity === 'high';
  const border = isWin ? '#a7f3d0' : high ? '#fecaca' : '#fde68a';
  const bg = isWin ? '#f0fdf4' : high ? '#fff1f2' : '#fffbeb';
  const tag = isWin ? '#047857' : high ? '#b91c1c' : '#b45309';
  const label = isWin ? 'LÊN' : a.kind === 'brand_not_top' ? 'BRAND MẤT TOP 1' : high ? 'TỤT · ƯU TIÊN' : 'TỤT';
  const trend =
    a.trend3 === 'worse'
      ? '<span style="color:#b91c1c">↘ 3 ngày gần nhất còn tụt</span>'
      : a.trend3 === 'recovering'
        ? '<span style="color:#047857">↗ 3 ngày gần nhất đã hồi</span>'
        : '<span style="color:#64748b">→ 3 ngày gần nhất đi ngang</span>';
  return `<div style="border:1px solid ${border};background:${bg};border-radius:8px;padding:9px 12px;margin:0 0 6px">
    <div style="font-size:13px;line-height:1.5">
      <span style="font-size:10px;font-weight:700;letter-spacing:.05em;color:${tag}">${label}</span>
      &nbsp;<b>${r.keyword}</b>${r.isBrand ? ' <span style="font-size:10px;color:#4f46e5">BRAND</span>' : ''}
      <span style="color:#334155">· ${where(r)}</span>
      <span style="color:#334155">· vị trí <b>${fmtPos(r.w[7].posPrev)} → ${fmtPos(r.w[7].pos)}</b></span>
      <span style="color:#64748b;font-size:11px">· Δ3 ${deltaChip(r.w[3].delta, threshold)} · Δ7 ${deltaChip(r.w[7].delta, threshold)} · Δ14 ${deltaChip(r.w[14].delta, threshold)}</span>
    </div>
    <div style="margin-top:3px;font-size:12px;color:#0f172a;line-height:1.45">${a.advice}</div>
    <div style="margin-top:2px;font-size:11px">${trend}${a.camps.length ? ` · camp: <span style="color:#334155">${a.camps.join(' | ')}</span>` : ''}</div>
  </div>`;
}

export function renderPositionDigestHtml(d: PositionDigest, dashboardUrl: string): { subject: string; html: string } {
  const t = d.summary.threshold;
  const all = d.actions.concat(d.wins);
  const paid = all.filter((a) => a.row.surface === 'paid');
  const organic = all.filter((a) => a.row.surface === 'organic');
  const paidDrops = paid.filter((a) => a.kind !== 'win').length;
  const orgDrops = organic.filter((a) => a.kind !== 'win').length;
  const highCount = d.actions.filter((a) => a.severity === 'high').length;

  const subject =
    all.length === 0
      ? `✅ ASO vị trí ${dmy(d.dataDate)}: không có keyword nào biến động`
      : `${highCount > 0 ? '🚨' : '⚠️'} ASO vị trí ${dmy(d.dataDate)}: paid ${paidDrops} tụt · organic ${orgDrops} tụt · ${d.wins.length} lên`;

  const headline =
    all.length === 0
      ? `<span style="color:#047857"><b>Không có keyword chính nào đổi vị trí quá ${t} bậc trong 7 ngày.</b></span> Brand vẫn top 1.`
      : `<b>Paid:</b> ${paidDrops} tụt, ${paid.length - paidDrops} lên. <b>Organic:</b> ${orgDrops} tụt, ${organic.length - orgDrops} lên. ${highCount > 0 ? `<span style="color:#b91c1c"><b>${highCount} ưu tiên</b> (brand, tụt ≥2 bậc hoặc nhiều users).</span>` : ''}`;

  const section = (title: string, sub: string, items: ActionItem[], empty: string) => `
    <div style="padding:12px 16px 2px">
      <div style="font-size:13px;font-weight:700;color:#0f172a">${title} <span style="font-weight:400;font-size:11px;color:#64748b">${sub}</span></div>
    </div>
    <div style="padding:6px 16px 6px">${items.length ? items.map((a) => card(a, t)).join('') : `<div style="font-size:12px;color:#64748b;padding:2px 0">${empty}</div>`}</div>`;

  const html = `<!doctype html><html><body style="margin:0;padding:16px;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <div style="max-width:820px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
    <div style="padding:14px 16px;border-bottom:1px solid #e2e8f0">
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.06em">TrueProfit ASO · biến động vị trí keyword chính</div>
      <div style="font-size:16px;font-weight:700;margin-top:2px">${dmy(d.dataDate)}</div>
      <p style="margin:8px 0 0;font-size:13px;line-height:1.5">${headline}${d.daysAvailable < 28 ? ` <span style="color:#b45309">Mới có ${d.daysAvailable} ngày data nên Δ14 chưa so được.</span>` : ''}</p>
    </div>
    ${section('PAID · cần action', 'tụt trước, lên sau · kèm camp đang chạy và gợi ý bid', paid, 'Không có keyword paid nào đổi vị trí quá ngưỡng.')}
    ${section('ORGANIC · xu hướng', 'tụt trước, lên sau · không action bid, chỉ theo dõi', organic, 'Không có keyword organic nào đổi vị trí quá ngưỡng.')}
    <div style="padding:12px 16px;border-top:1px solid #e2e8f0;font-size:12px">
      <a href="${dashboardUrl}/positions" style="color:#4f46e5">Bảng đầy đủ vị trí + users theo nước</a> · <a href="${dashboardUrl}/bid-cap" style="color:#4f46e5">Bid Recommendations</a>
      <div style="margin-top:6px;font-size:10px;color:#94a3b8">Vị trí = trung bình App Store Search theo ngày, trọng số theo users; Δ so với cửa sổ cùng độ dài liền trước, dương là tụt. Chỉ báo keyword đổi vị trí từ ${t} bậc trong 7 ngày hoặc brand rời top 1. Keyword chính = mọi keyword Brand + top 30 theo users L30; bỏ ${d.summary.excludedCountries.join(', ')}. Camp lấy từ Master KW Lookup, bỏ camp pause. Gửi tự động 09:00 mỗi ngày.</div>
    </div>
  </div></body></html>`;
  return { subject, html };
}

export async function sendViaResend(opts: { to: string[]; subject: string; html: string; from?: string }): Promise<{ id?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY chưa set');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: opts.from ?? process.env.DIGEST_FROM ?? 'ASO Dashboard <onboarding@resend.dev>',
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
  if (!res.ok) throw new Error(`Resend ${res.status}: ${body.message ?? body.name ?? 'lỗi không rõ'}`);
  return { id: body.id };
}
