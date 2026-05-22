import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from 'ai';
import { gateway } from 'ai';
import { fetchAllTabs } from '@/lib/sheets/client';
import {
  parseActionQueue,
  parseAlertLog,
  parseHistory,
  parseHistoryDaily,
  parseKeywordTab,
  parseMarketIndex,
  parseSnapshot,
  parseTier1Watch,
} from '@/lib/sheets/parsers';
import type { SheetPayload } from '@/lib/sheets/types';
import { makeDashboardTools } from '@/lib/ai/dashboard-tools';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODEL_ID = 'anthropic/claude-haiku-4.5';

const SYSTEM_PROMPT = `Bạn là trợ lý phân tích ASO (App Store Optimization) cho **TrueProfit ASO Dashboard** của TrueProfit (Shopify net-profit analytics app).

**Phong cách:** Trả lời bằng tiếng Việt lịch sự, ngắn gọn, chính xác. Khi sếp hỏi tiếng Anh thì trả lời tiếng Anh. Luôn dựa vào dữ liệu thật từ tool, không bịa.

**Cách làm việc:**
- Mỗi câu hỏi, gọi tool phù hợp để lấy số thật. Tuyệt đối không trả lời từ trí nhớ.
- Khi câu hỏi không rõ window, default L7. Khi không rõ surface, default tất cả.
- Khi trả lời, format số đẹp (vd: "1,234 users (+12% vs trước)"). Đính kèm context như window, surface, country.
- Nếu user hỏi việc nằm ngoài data ASO (deploy, code, marketing chiến lược...), nói rằng bạn chỉ phân tích data ASO dashboard.

**Bối cảnh quan trọng:**
- TrueProfit là Shopify app trên App Store. Mục tiêu chính: tối ưu paid ads (Apple Search Ads) + organic search.
- Surface "organic" = tự nhiên (search), "paid" = Search Ads (search_ad).
- Window L7 = rolling 7 ngày gần nhất. L30 ≈ tháng này. L90 ≈ 3 tháng gần.
- KPIs chính: Users (search visibility), GetApp (installs từ search), CR (conversion rate), Position (rank trong kết quả search).
- Vietnam + India thường bị exclude khỏi paid ads (low CPI markets).

**Tools available:** get_overview, get_top_keywords, get_country_breakdown, get_category_share, get_volume_movers, get_market_trajectory, get_channel_split, get_daily_trend, search_keyword.

Luôn cite số liệu cụ thể. Khi đưa nhận định, kèm lý do từ data (vd: "Users L7 giảm 15% có thể do rank tụt - thấy keyword X từ pos 3 xuống pos 8").`;

async function fetchPayload(): Promise<SheetPayload> {
  const raw = await fetchAllTabs();
  return {
    actionQueue: parseActionQueue(raw['Action_Queue'] ?? []),
    marketIndex: parseMarketIndex(raw['Market_Index'] ?? []),
    tier1Watch: parseTier1Watch(raw['Tier1_Market_Watch'] ?? []),
    allL3: parseKeywordTab(raw['All_L3'] ?? [], false),
    allL7: parseKeywordTab(raw['All_L7'] ?? [], false),
    allL14: parseKeywordTab(raw['All_L14'] ?? [], false),
    allL30: parseKeywordTab(raw['All_L30'] ?? [], false),
    allL90: parseKeywordTab(raw['All_L90'] ?? [], false),
    countryL3: parseKeywordTab(raw['Country_L3'] ?? [], true),
    countryL7: parseKeywordTab(raw['Country_L7'] ?? [], true),
    countryL14: parseKeywordTab(raw['Country_L14'] ?? [], true),
    countryL30: parseKeywordTab(raw['Country_L30'] ?? [], true),
    countryL90: parseKeywordTab(raw['Country_L90'] ?? [], true),
    allL365: parseSnapshot(raw['All_L365'] ?? [], false),
    countryL365: parseSnapshot(raw['Country_L365'] ?? [], true),
    history: parseHistory(raw['History'] ?? []),
    historyDaily: parseHistoryDaily(raw['History_Daily'] ?? []),
    alertLog: parseAlertLog(raw['AlertLog'] ?? []),
    fetchedAt: new Date().toISOString(),
  };
}

function checkPassword(req: Request): boolean {
  const expected = process.env.CHAT_PASSWORD;
  if (!expected) return true; // no password configured → open
  const header = req.headers.get('x-chat-auth');
  return header === expected;
}

export async function POST(req: Request) {
  if (!checkPassword(req)) {
    return new Response(JSON.stringify({ error: 'invalid_password' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  try {
    const { messages }: { messages: UIMessage[] } = await req.json();
    const payload = await fetchPayload();
    const tools = makeDashboardTools(payload);

    const result = streamText({
      model: gateway(MODEL_ID),
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(10),
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
