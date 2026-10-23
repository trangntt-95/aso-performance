// HTML email báo cáo vị trí và gửi qua Resend (REST, không cần SDK).
//
// Trang 23/10/2026: email CHỈ chứa keyword có biến động vị trí, tách hai
// phần: PAID (để action, kèm camp + gợi ý bid) và ORGANIC (để xem xu hướng).
// Không có users, không có bảng đầy đủ; bảng đầy đủ (vị trí + users) nằm ở
// tab Vị trí keyword trên dashboard.

import type { ActionItem, DigestRow, PositionDigest } from './positions';
import { WINDOWS } from './positions';

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

/** Gợi ý ngắn cho ô cuối bảng (câu dài nằm ở tooltip title). */
function shortAdvice(a: ActionItem): string {
  const camp = a.camps.length ? a.camps[0] : null;
  switch (a.kind) {
    case 'paid_drop':
      return camp ? `Kiểm tra bid/budget · ${camp}` : 'Kiểm tra bid · chưa thấy camp active';
    case 'organic_drop':
      return a.camps.length ? 'Xem đối thủ/metadata · giữ bid paid' : 'Xem đối thủ/metadata · cân nhắc bật paid';
    case 'brand_not_top':
      return camp ? `Bật/kiểm tra camp brand · ${camp}` : 'Bật camp brand';
    case 'win':
      return a.row.surface === 'paid' ? 'Giữ bid' : a.camps.length ? 'Có thể hạ bid thử' : 'Theo dõi';
  }
}

const TD = 'padding:5px 6px;vertical-align:top;border-top:1px solid #e2e8f0';
const TH = 'padding:5px 6px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;background:#f8fafc';

function actionRow(a: ActionItem, threshold: number): string {
  const r = a.row;
  const isWin = a.kind === 'win';
  const high = a.severity === 'high';
  const rowBg = isWin ? '#f0fdf4' : high ? '#fff1f2' : '#fffbeb';
  const tag = isWin ? '#047857' : high ? '#b91c1c' : '#b45309';
  const label = isWin ? '▲ LÊN' : a.kind === 'brand_not_top' ? '⚑ BRAND' : high ? '▼ TỤT !' : '▼ TỤT';
  const trend = a.trend3 === 'worse' ? '<span style="color:#b91c1c">↘ còn tụt</span>' : a.trend3 === 'recovering' ? '<span style="color:#047857">↗ đã hồi</span>' : '<span style="color:#94a3b8">→ ngang</span>';
  // Mỗi cửa sổ: VỊ TRÍ tuyệt đối hiện tại, tô đỏ nếu tụt so với kỳ trước, xanh nếu
  // lên, xám nếu đứng; ô của cửa sổ biến động mạnh nhất viền đậm. Trước→nay và Δ
  // nằm trong tooltip (Trang 23/10/2026: "nhìn bảng là biết cửa sổ nào tăng giảm").
  const posCells = WINDOWS.map((n) => {
    const s = r.w[n];
    const d = s.delta;
    const color = d === null ? '#64748b' : d >= threshold ? '#dc2626' : d <= -threshold ? '#059669' : '#64748b';
    const arrow = d === null ? '' : d >= threshold ? '▼' : d <= -threshold ? '▲' : '';
    const main = n === a.win;
    const tip = s.pos === null ? 'chưa có vị trí' : `L${n}: ${fmtPos(s.posPrev)} → ${fmtPos(s.pos)} (${fmtDelta(d)}) · ${s.users} users (trước ${s.usersPrev})`;
    return `<td style="${TD};text-align:right;white-space:nowrap;color:${color};font-weight:${main || (d !== null && Math.abs(d) >= threshold) ? 700 : 400};${main ? 'outline:2px solid ' + color + ';outline-offset:-2px;' : ''}" title="${tip}">${arrow}${fmtPos(s.pos)}</td>`;
  }).join('');
  const uw = r.w[a.win];
  return `<tr style="background:${rowBg}" title="${a.advice.replace(/"/g, '&quot;')}">
    <td style="${TD};white-space:nowrap;font-size:10px;font-weight:700;color:${tag}">${label}</td>
    <td style="${TD}"><b>${r.keyword}</b>${r.isBrand ? ' <span style="font-size:9px;color:#4f46e5">BRAND</span>' : ''}</td>
    <td style="${TD};color:#334155;white-space:nowrap">${where(r)}</td>
    ${posCells}
    <td style="${TD};text-align:right;white-space:nowrap" title="Users trong cửa sổ biến động mạnh nhất (L${a.win}) và kỳ liền trước">${uw.users} <span style="font-size:10px;color:#94a3b8">/ ${uw.usersPrev}</span></td>
    <td style="${TD};font-size:11px;white-space:nowrap">${trend}</td>
    <td style="${TD};font-size:11px;color:#334155">${shortAdvice(a)}${a.camps.length > 1 ? ` <span style="color:#94a3b8">+${a.camps.length - 1}</span>` : ''}</td>
  </tr>`;
}

function actionTable(items: ActionItem[], threshold: number): string {
  return `<table style="width:100%;border-collapse:collapse;font-size:12px">
    <tr>
      <th style="${TH}"></th>
      <th style="${TH}">Keyword</th>
      <th style="${TH}">Nước</th>
      ${WINDOWS.map((n) => `<th style="${TH};text-align:right" title="Vị trí trung bình ${n} ngày gần nhất; đỏ = tụt so với ${n} ngày trước, xanh = lên">Vị trí L${n}</th>`).join('')}
      <th style="${TH};text-align:right" title="Users trong cửa sổ biến động mạnh nhất / kỳ liền trước">Users nay / trước</th>
      <th style="${TH}">3 ngày</th>
      <th style="${TH}">Gợi ý · camp</th>
    </tr>
    ${items.map((a) => actionRow(a, threshold)).join('')}
  </table>
  <div style="font-size:10px;color:#94a3b8;margin-top:4px">Ô viền đậm = cửa sổ biến động mạnh nhất. <span style="color:#dc2626">Đỏ</span> = tụt về vị trí đó so với kỳ liền trước, <span style="color:#059669">xanh</span> = lên. Rê chuột để xem trước → nay.</div>`;
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
      ? `<span style="color:#047857"><b>Không có keyword chính nào đổi vị trí quá ${t} bậc trong 3/7/14/30 ngày.</b></span> Brand vẫn top 1.`
      : `<b>Paid:</b> ${paidDrops} tụt, ${paid.length - paidDrops} lên. <b>Organic:</b> ${orgDrops} tụt, ${organic.length - orgDrops} lên. ${highCount > 0 ? `<span style="color:#b91c1c"><b>${highCount} ưu tiên</b> (brand, tụt ≥2 bậc hoặc nhiều users).</span>` : ''}`;

  const section = (title: string, sub: string, items: ActionItem[], empty: string) => `
    <div style="padding:12px 16px 2px">
      <div style="font-size:13px;font-weight:700;color:#0f172a">${title} <span style="font-weight:400;font-size:11px;color:#64748b">${sub}</span></div>
    </div>
    <div style="padding:6px 16px 6px">${items.length ? actionTable(items, t) : `<div style="font-size:12px;color:#64748b;padding:2px 0">${empty}</div>`}</div>`;

  // ---- Xu hướng: tổng users tracked và bảng gọn top keyword theo users ----
  const pctTxt = (cur: number, prev: number) => {
    if (prev <= 0) return '<span style="color:#94a3b8">—</span>';
    const p = (cur - prev) / prev;
    const color = p >= 0.1 ? '#059669' : p <= -0.1 ? '#dc2626' : '#64748b';
    return `<span style="color:${color};font-weight:600">${p > 0 ? '+' : ''}${Math.round(p * 100)}%</span>`;
  };
  const tot = (surface: 'organic' | 'paid' | null, n: 7 | 14) => {
    let cur = 0;
    let prev = 0;
    for (const g of d.groups) {
      if (surface && g.surface !== surface) continue;
      cur += g.all.w[n].users;
      prev += g.all.w[n].usersPrev;
    }
    return { cur, prev };
  };
  const o7 = tot('organic', 7);
  const p7 = tot('paid', 7);
  const o14 = tot('organic', 14);
  const p14 = tot('paid', 14);
  const trendLine = `Users keyword chính 7 ngày: organic <b>${o7.cur}</b> (${pctTxt(o7.cur, o7.prev)} so với 7 ngày trước), paid <b>${p7.cur}</b> (${pctTxt(p7.cur, p7.prev)}). 14 ngày: organic ${pctTxt(o14.cur, o14.prev)}, paid ${pctTxt(p14.cur, p14.prev)}.`;

  const posCell = (r: DigestRow, n: 7 | 14 | 30) =>
    `<td style="padding:3px 6px;text-align:right;white-space:nowrap"><b>${fmtPos(r.w[n].pos)}</b> <span style="font-size:11px">${deltaChip(r.w[n].delta, t)}</span></td>`;
  const usersCellTxt = (r: DigestRow, n: 7 | 14 | 30) =>
    `<td style="padding:3px 6px;text-align:right;white-space:nowrap">${r.w[n].users} <span style="font-size:11px">${pctTxt(r.w[n].users, r.w[n].usersPrev)}</span></td>`;
  const trendRows = (surface: 'organic' | 'paid') =>
    d.groups
      .filter((g) => g.surface === surface)
      .sort((a, b) => b.all.w[7].users - a.all.w[7].users)
      .slice(0, 12)
      .map(
        (g) => `<tr style="border-top:1px solid #f1f5f9">
          <td style="padding:3px 6px"><b>${g.keyword}</b>${g.isBrand ? ' <span style="font-size:10px;color:#4f46e5">BRAND</span>' : ''}${g.countries[0] ? ` <span style="font-size:10px;color:#94a3b8">${g.countries.slice(0, 2).map((c) => `${c.country} #${fmtPos(c.w[7].pos)}`).join(' · ')}</span>` : ''}</td>
          ${posCell(g.all, 7)}${posCell(g.all, 14)}${posCell(g.all, 30)}${usersCellTxt(g.all, 7)}${usersCellTxt(g.all, 30)}
        </tr>`,
      )
      .join('');
  const trendTable = (surface: 'organic' | 'paid', label: string) => `
    <div style="font-size:11px;font-weight:700;color:${surface === 'paid' ? '#b45309' : '#0f766e'};margin:8px 0 2px">${label}</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <tr style="color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.04em">
        <th style="padding:3px 6px;text-align:left">Keyword · nước lớn nhất</th>
        <th style="padding:3px 6px;text-align:right">Vị trí L7 · Δ7</th>
        <th style="padding:3px 6px;text-align:right">Vị trí L14 · Δ14</th>
        <th style="padding:3px 6px;text-align:right">Vị trí L30 · Δ30</th>
        <th style="padding:3px 6px;text-align:right">Users L7 · Δ</th>
        <th style="padding:3px 6px;text-align:right">Users L30 · Δ</th>
      </tr>
      ${trendRows(surface) || '<tr><td colspan="6" style="padding:4px 6px;color:#94a3b8">—</td></tr>'}
    </table>`;

  const html = `<!doctype html><html><body style="margin:0;padding:16px;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <div style="max-width:860px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
    <div style="padding:14px 16px;border-bottom:1px solid #e2e8f0">
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.06em">TrueProfit ASO · vị trí keyword chính</div>
      <div style="font-size:16px;font-weight:700;margin-top:2px">${dmy(d.dataDate)}</div>
      <p style="margin:8px 0 0;font-size:13px;line-height:1.5">${headline}${d.daysAvailable < 28 ? ` <span style="color:#b45309">Mới có ${d.daysAvailable} ngày data nên Δ14 chưa so được.</span>` : ''}</p>
      <p style="margin:6px 0 0;font-size:12px;line-height:1.5;color:#334155">${trendLine}</p>
    </div>
    ${section('1 · PAID · cần action', 'keyword paid đổi vị trí từ ' + t + ' bậc ở bất kỳ cửa sổ 3/7/14/30 ngày · tụt trước, lên sau · kèm camp đang chạy và gợi ý bid', paid, 'Không có keyword paid nào đổi vị trí quá ngưỡng.')}
    ${section('2 · ORGANIC · biến động', 'keyword organic đổi vị trí từ ' + t + ' bậc ở bất kỳ cửa sổ 3/7/14/30 ngày · không action bid, chỉ theo dõi', organic, 'Không có keyword organic nào đổi vị trí quá ngưỡng.')}
    <div style="padding:12px 16px 2px;border-top:1px solid #e2e8f0">
      <div style="font-size:13px;font-weight:700;color:#0f172a">3 · Xu hướng 30 ngày <span style="font-weight:400;font-size:11px;color:#64748b">top keyword theo users, mọi nước gộp · vị trí và users, Δ so với kỳ liền trước · tụt/lên dưới ngưỡng vẫn hiện để thấy chiều đi</span></div>
    </div>
    <div style="padding:0 16px 10px">
      ${trendTable('organic', 'ORGANIC')}
      ${trendTable('paid', 'PAID')}
    </div>
    <div style="padding:12px 16px;border-top:1px solid #e2e8f0;font-size:12px">
      <a href="${dashboardUrl}/positions" style="color:#4f46e5">Bảng đầy đủ vị trí + users theo nước</a> · <a href="${dashboardUrl}/bid-cap" style="color:#4f46e5">Bid Recommendations</a>
      <div style="margin-top:6px;font-size:10px;color:#94a3b8">Vị trí = trung bình App Store Search theo ngày, trọng số theo users; Δ so với cửa sổ cùng độ dài liền trước, dương là tụt. Chỉ báo keyword đổi vị trí từ ${t} bậc ở bất kỳ cửa sổ 3/7/14/30 ngày hoặc brand rời top 1. Keyword chính = mọi keyword Brand + top 30 theo users L30; bỏ ${d.summary.excludedCountries.join(', ')}. Camp lấy từ Master KW Lookup, bỏ camp pause. Gửi tự động 09:00 mỗi ngày.</div>
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
