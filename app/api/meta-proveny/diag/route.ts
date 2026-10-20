import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Chẩn đoán token Meta: hỏi Graph API token này là ai, được cấp permission gì,
// thấy ad account nào, và account Proveny trả lời gì. Không trả token ra ngoài.
async function g(path: string, token: string): Promise<unknown> {
  const url = new URL(`https://graph.facebook.com/v21.0/${path}`);
  url.searchParams.set('access_token', token);
  const res = await fetch(url.toString(), { cache: 'no-store' });
  return res.json().catch(() => ({ error: `HTTP ${res.status}` }));
}

export async function GET() {
  const token = process.env.META_ACCESS_TOKEN;
  const account = (process.env.META_AD_ACCOUNT_ID ?? '').replace(/^act_/, '');
  if (!token) return NextResponse.json({ error: 'META_ACCESS_TOKEN chưa set' });
  const [me, perms, accounts, act, insights] = await Promise.all([
    g('me?fields=id,name', token),
    g('me/permissions', token),
    g('me/adaccounts?fields=id,name,account_status&limit=50', token),
    g(`act_${account}?fields=id,name,account_status,business`, token),
    g(`act_${account}/insights?date_preset=last_7d&fields=spend`, token),
  ]);
  return NextResponse.json({ tokenLength: token.length, tokenPrefix: token.slice(0, 4), accountId: account, me, perms, accounts, act, insights });
}
