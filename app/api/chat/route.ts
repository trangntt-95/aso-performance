import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from 'ai';
import { google } from '@ai-sdk/google';
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

const MODEL_ID = 'gemini-2.5-flash-lite';

const SYSTEM_PROMPT = `Bạn là trợ lý phân tích ASO cho **TrueProfit ASO Dashboard** (TrueProfit là Shopify net-profit analytics app trên App Store).

**Phong cách trả lời:**
- **Ngắn gọn nhưng đủ ý.** Câu trả lời lý tưởng 2-5 câu hoặc 3-7 bullet points. KHÔNG dàn trải, không lặp ý.
- Tiếng Việt lịch sự (xưng "Bạn / Anh / Chị"). User hỏi English → trả lời English.
- Luôn cite số từ tool, không bịa.
- **Khi compare nhiều keyword / country / window → DÙNG MARKDOWN TABLE** (GitHub-flavored). Vd:
  | Keyword | Users | Installs | CR | Pos |
  |---|---:|---:|---:|---:|
  | brand_x | 1,234 | 245 | 19.9% | 3 |
  Cột số dùng align phải (\`---:\`). Giúp đọc nhanh, không phải dò text.

**Cách làm việc:**
- Gọi tool phù hợp lấy data thật trước khi trả lời.
- Default window = L7 nếu user không nói. Default surface = tất cả.
- Format số đẹp: "1,234 users (+12%)". Kèm window/surface/country khi có.
- Khi đưa nhận định, ngắn 1 câu giải thích lý do từ data (vd: "Users L7 giảm 15% do rank kw X tụt từ 3 → 8").
- Hỏi ngoài scope ASO → từ chối ngắn.

**Glossary:**
- organic = search tự nhiên · paid = Apple Search Ads (search_ad)
- Window: L3=3d · L7=7d · L14=14d · L30 ≈ tháng này · L90 ≈ 3 tháng
- KPIs: Users (demand), GetApp (installs), CR (conversion), Position (rank, lower better)
- VN + IN luôn exclude khỏi paid ads

**Tools:** get_overview · get_top_keywords · get_country_breakdown · get_category_share · get_volume_movers · get_market_trajectory · get_channel_split · get_daily_trend · search_keyword.`;

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

export async function POST(req: Request) {
  try {
    const { messages }: { messages: UIMessage[] } = await req.json();
    const payload = await fetchPayload();
    const tools = makeDashboardTools(payload);

    const result = streamText({
      model: google(MODEL_ID),
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
