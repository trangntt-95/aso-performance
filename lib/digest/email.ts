// Dựng HTML email cho báo cáo vị trí và gửi qua Resend (REST, không cần SDK).

import type { DigestRow, PositionDigest, Win } from './positions';

const fmtPos = (p: number | null) => (p === null ? '—' : p.toFixed(1));
const fmtDelta = (d: number | null) => (d === null ? '' : `${d > 0 ? '+' : ''}${d.toFixed(1)}`);
const dmy = (isoDate: string) => isoDate.split('-').reverse().join('/');

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

export function renderPositionDigestHtml(d: PositionDigest, dashboardUrl: string): { subject: string; html: string } {
  const { summary } = d;
  const subject = `ASO vị trí keyword ${dmy(d.dataDate)}: ${summary.worsened7} tụt · ${summary.improved7} lên (L7)`;

  const lead = [
    `<b>${summary.tracked}</b> dòng keyword×kênh theo dõi, data tới <b>${dmy(d.dataDate)}</b>.`,
    `Trong 7 ngày: <span style="color:#dc2626"><b>${summary.worsened7}</b> tụt</span> từ ${summary.threshold} bậc, <span style="color:#059669"><b>${summary.improved7}</b> lên</span> từ ${summary.threshold} bậc.`,
    summary.worst
      ? `Tụt mạnh nhất: <b>${summary.worst.keyword}</b> (${summary.worst.surface}) ${fmtPos(summary.worst.w[7].posPrev)} → ${fmtPos(summary.worst.w[7].pos)}.`
      : 'Không có keyword nào tụt quá ngưỡng.',
    summary.best ? `Lên mạnh nhất: <b>${summary.best.keyword}</b> (${summary.best.surface}) ${fmtPos(summary.best.w[7].posPrev)} → ${fmtPos(summary.best.w[7].pos)}.` : '',
    d.daysAvailable < 28 ? `<span style="color:#b45309">Mới có ${d.daysAvailable} ngày data nên cột L14 so với kỳ trước chưa đủ.</span>` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const head = `
    <tr style="background:#f8fafc;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:.04em">
      <th style="padding:6px;text-align:left">Keyword</th>
      <th style="padding:6px;text-align:left">Kênh</th>
      <th style="padding:6px;text-align:right">L3</th><th style="padding:6px;text-align:right">Δ3</th>
      <th style="padding:6px;text-align:right">L7</th><th style="padding:6px;text-align:right">Δ7</th>
      <th style="padding:6px;text-align:right">L14</th><th style="padding:6px;text-align:right">Δ14</th>
      <th style="padding:6px;text-align:right">Users L7</th>
    </tr>`;

  const body = d.rows
    .map((r, i) => {
      const u = r.w[7];
      const uDelta = u.usersPrev > 0 ? (u.users - u.usersPrev) / u.usersPrev : null;
      const uColor = uDelta === null ? '#94a3b8' : uDelta >= 0.1 ? '#059669' : uDelta <= -0.1 ? '#dc2626' : '#64748b';
      return `<tr style="border-top:1px solid #e2e8f0;background:${i % 2 ? '#fcfcfd' : '#fff'}">
        <td style="padding:4px 6px"><b>${r.keyword}</b>${r.isBrand ? ' <span style="font-size:10px;color:#4f46e5">BRAND</span>' : ''}<div style="font-size:10px;color:#94a3b8">${r.category}</div></td>
        <td style="padding:4px 6px;color:${r.surface === 'paid' ? '#b45309' : '#0f766e'}">${r.surface}</td>
        ${winCells(r, 3, summary.threshold)}${winCells(r, 7, summary.threshold)}${winCells(r, 14, summary.threshold)}
        <td style="padding:4px 6px;text-align:right">${u.users}<span style="font-size:10px;color:${uColor}"> ${uDelta === null ? '' : `${uDelta > 0 ? '+' : ''}${Math.round(uDelta * 100)}%`}</span></td>
      </tr>`;
    })
    .join('');

  const html = `<!doctype html><html><body style="margin:0;padding:16px;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <div style="max-width:860px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
    <div style="padding:14px 16px;border-bottom:1px solid #e2e8f0">
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.06em">TrueProfit ASO · báo cáo vị trí keyword</div>
      <div style="font-size:16px;font-weight:700;margin-top:2px">${dmy(d.dataDate)}</div>
      <p style="margin:8px 0 0;font-size:13px;line-height:1.5">${lead}</p>
    </div>
    <div style="padding:8px 16px 4px;font-size:11px;color:#64748b">
      Vị trí = trung bình App Store Search theo ngày, trọng số theo users. Δ = so với cửa sổ cùng độ dài liền trước; <span style="color:#dc2626">▼ dương</span> là tụt, <span style="color:#059669">▲ âm</span> là lên. Sắp theo tụt L7 mạnh nhất trước.
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>${head}</thead>
      <tbody>${body || '<tr><td colspan="9" style="padding:12px;color:#94a3b8">Không có dòng nào.</td></tr>'}</tbody>
    </table>
    <div style="padding:12px 16px;border-top:1px solid #e2e8f0;font-size:12px">
      <a href="${dashboardUrl}/positions" style="color:#4f46e5">Mở tab Vị trí keyword</a> · <a href="${dashboardUrl}" style="color:#4f46e5">Dashboard</a>
      <div style="margin-top:6px;font-size:10px;color:#94a3b8">Keyword chính = mọi keyword Brand + top 30 theo users L30 (bỏ Noise/Test). Gửi tự động 09:00 mỗi ngày sau khi pipeline chạy xong.</div>
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
