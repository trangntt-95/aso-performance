// Dựng HTML email cho báo cáo vị trí và gửi qua Resend (REST, không cần SDK).

import type { DigestRow, PositionDigest, Win } from './positions';

const fmtPos = (p: number | null) => (p === null ? '—' : p.toFixed(1));
const fmtDelta = (d: number | null) => (d === null ? '' : `${d > 0 ? '+' : ''}${d.toFixed(1)}`);
const dmy = (isoDate: string) => isoDate.split('-').reverse().join('/');
const where = (r: DigestRow) => (r.country ? r.country : 'mọi nước');

function deltaCell(d: number | null, threshold: number): string {
  if (d === null) return '<td style="padding:4px 6px;text-align:right;color:#94a3b8">—</td>';
  const color = d >= threshold ? '#dc2626' : d <= -threshold ? '#059669' : '#64748b';
  const bg = d >= threshold ? '#fef2f2' : d <= -threshold ? '#ecfdf5' : 'transparent';
  const arrow = d >= threshold ? '▼' : d <= -threshold ? '▲' : '';
  return `<td style="padding:4px 6px;text-align:right;color:${color};background:${bg};font-weight:${Math.abs(d) >= threshold ? 600 : 400}">${arrow}${fmtDelta(d)}</td>`;
}

function winCells(r: DigestRow, n: Win, threshold: number): string {
  const s = r.w[n];
  return `<td style="padding:4px 6px;text-align:right;font-variant-numeric:tabular-nums">${fmtPos(s.pos)}</td>${deltaCell(s.delta, threshold)}`;
}

function usersCell(r: DigestRow): string {
  const u = r.w[7];
  const d = u.usersPrev > 0 ? (u.users - u.usersPrev) / u.usersPrev : null;
  const color = d === null ? '#94a3b8' : d >= 0.1 ? '#059669' : d <= -0.1 ? '#dc2626' : '#64748b';
  return `<td style="padding:4px 6px;text-align:right">${u.users}<span style="font-size:10px;color:${color}"> ${d === null ? '' : `${d > 0 ? '+' : ''}${Math.round(d * 100)}%`}</span></td>`;
}

export function renderPositionDigestHtml(d: PositionDigest, dashboardUrl: string): { subject: string; html: string } {
  const { summary } = d;
  const subject = `ASO vị trí keyword ${dmy(d.dataDate)}: ${summary.worsened7} tụt · ${summary.improved7} lên (L7, theo nước)`;

  const lead = [
    `<b>${summary.keywords}</b> keyword×kênh, <b>${summary.countryRows}</b> dòng nước, data tới <b>${dmy(d.dataDate)}</b>.`,
    `Trong 7 ngày: <span style="color:#dc2626"><b>${summary.worsened7}</b> dòng nước tụt</span> từ ${summary.threshold} bậc, <span style="color:#059669"><b>${summary.improved7}</b> lên</span> từ ${summary.threshold} bậc.`,
    summary.worst
      ? `Tụt mạnh nhất: <b>${summary.worst.keyword}</b> (${summary.worst.surface}, ${where(summary.worst)}) ${fmtPos(summary.worst.w[7].posPrev)} → ${fmtPos(summary.worst.w[7].pos)}.`
      : 'Không có dòng nào tụt quá ngưỡng.',
    summary.best ? `Lên mạnh nhất: <b>${summary.best.keyword}</b> (${summary.best.surface}, ${where(summary.best)}) ${fmtPos(summary.best.w[7].posPrev)} → ${fmtPos(summary.best.w[7].pos)}.` : '',
    d.daysAvailable < 28 ? `<span style="color:#b45309">Mới có ${d.daysAvailable} ngày data nên cột L14 so với kỳ trước chưa đủ.</span>` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const head = `
    <tr style="background:#f8fafc;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:.04em">
      <th style="padding:6px;text-align:left">Keyword · nước</th>
      <th style="padding:6px;text-align:left">Kênh</th>
      <th style="padding:6px;text-align:right">L3</th><th style="padding:6px;text-align:right">Δ3</th>
      <th style="padding:6px;text-align:right">L7</th><th style="padding:6px;text-align:right">Δ7</th>
      <th style="padding:6px;text-align:right">L14</th><th style="padding:6px;text-align:right">Δ14</th>
      <th style="padding:6px;text-align:right">Users L7</th>
    </tr>`;

  const body = d.groups
    .map((g) => {
      const headRow = `<tr style="border-top:2px solid #e2e8f0;background:#fff">
        <td style="padding:6px 6px 4px"><b>${g.keyword}</b>${g.isBrand ? ' <span style="font-size:10px;color:#4f46e5">BRAND</span>' : ''} <span style="font-size:10px;color:#94a3b8">${g.category}</span><div style="font-size:10px;color:#64748b">mọi nước</div></td>
        <td style="padding:6px 6px 4px;color:${g.surface === 'paid' ? '#b45309' : '#0f766e'}">${g.surface}</td>
        ${winCells(g.all, 3, summary.threshold)}${winCells(g.all, 7, summary.threshold)}${winCells(g.all, 14, summary.threshold)}
        ${usersCell(g.all)}
      </tr>`;
      const countryRows = g.countries
        .map(
          (r) => `<tr style="background:#fcfcfd">
        <td style="padding:3px 6px 3px 18px;color:#334155">↳ ${r.country}</td>
        <td style="padding:3px 6px;color:#94a3b8;font-size:11px">${r.surface}</td>
        ${winCells(r, 3, summary.threshold)}${winCells(r, 7, summary.threshold)}${winCells(r, 14, summary.threshold)}
        ${usersCell(r)}
      </tr>`,
        )
        .join('');
      const more =
        g.moreCountries > 0
          ? `<tr style="background:#fcfcfd"><td colspan="9" style="padding:2px 6px 6px 18px;font-size:10px;color:#94a3b8">+${g.moreCountries} nước khác quá ít users để tính</td></tr>`
          : '';
      return headRow + countryRows + more;
    })
    .join('');

  const html = `<!doctype html><html><body style="margin:0;padding:16px;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <div style="max-width:900px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
    <div style="padding:14px 16px;border-bottom:1px solid #e2e8f0">
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.06em">TrueProfit ASO · báo cáo vị trí keyword theo nước</div>
      <div style="font-size:16px;font-weight:700;margin-top:2px">${dmy(d.dataDate)}</div>
      <p style="margin:8px 0 0;font-size:13px;line-height:1.5">${lead}</p>
    </div>
    <div style="padding:8px 16px 4px;font-size:11px;color:#64748b">
      Vị trí = trung bình App Store Search theo ngày, trọng số theo users. Δ = so với cửa sổ cùng độ dài liền trước; <span style="color:#dc2626">▼ dương</span> là tụt, <span style="color:#059669">▲ âm</span> là lên. Mỗi keyword: dòng đậm là mọi nước gộp, các dòng ↳ là từng nước (nhiều users trước). Nhóm tụt mạnh nhất lên đầu. Bỏ ${summary.excludedCountries.join(', ')}.
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>${head}</thead>
      <tbody>${body || '<tr><td colspan="9" style="padding:12px;color:#94a3b8">Không có dòng nào.</td></tr>'}</tbody>
    </table>
    <div style="padding:12px 16px;border-top:1px solid #e2e8f0;font-size:12px">
      <a href="${dashboardUrl}/positions" style="color:#4f46e5">Mở tab Vị trí keyword</a> · <a href="${dashboardUrl}" style="color:#4f46e5">Dashboard</a>
      <div style="margin-top:6px;font-size:10px;color:#94a3b8">Keyword chính = mọi keyword Brand + top 30 theo users L30 (bỏ Noise/Test); dòng nước cần từ 5 users trong 2 tuần (Brand: 3). Gửi tự động 09:00 mỗi ngày sau khi pipeline chạy xong.</div>
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
