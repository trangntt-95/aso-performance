import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from 'ai';
import { google } from '@ai-sdk/google';
import { fetchAllTabs } from '@/lib/sheets/client';
import {
  parseActionQueue,
  parseAlertLog,
  parseBidCap,
  parseCampLinks,
  parseHistory,
  parseHistoryDaily,
  parseKeywordTab,
  parseKwAddedManual,
  parseMarketIndex,
  parseMasterKw,
  parseNegativeKw,
  parsePausedCamp,
  parseShopifyCamps,
  parseShopifyDateRange,
  parseSnapshot,
  parseWindowDateRange,
  parseTier1Watch,
} from '@/lib/sheets/parsers';
import { languageOnlyKeywords, overrideToLanguage } from '@/lib/sheets/languageOverride';
import { overrideCategoryExact } from '@/lib/sheets/categoryOverride';
import type { SheetPayload } from '@/lib/sheets/types';
import { makeDashboardTools } from '@/lib/ai/dashboard-tools';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODEL_ID = 'gemini-2.5-flash';

const SYSTEM_PROMPT = `Bạn là trợ lý phân tích ASO cho **TrueProfit ASO Dashboard** (TrueProfit là Shopify net-profit analytics app trên App Store).

**Phong cách trả lời — BẮT BUỘC tuân thủ:**

1. **MẶC ĐỊNH dùng bullet points** (gạch đầu dòng \`-\`). KHÔNG viết đoạn văn dài. Mỗi bullet 1 ý, max 1-2 dòng.
2. Trả lời tối đa **3-6 bullets** chính. Nếu cần nhóm → in đậm tiêu đề rồi gạch dòng.
3. Câu giới thiệu (nếu cần) chỉ **1 câu ngắn** trước khi bullets, hoặc bỏ luôn.
4. KHÔNG lặp lại câu hỏi. KHÔNG mở bài "Dạ, theo dữ liệu thì..." dài dòng.
5. KHÔNG kết bài cảm ơn / hỏi thêm. Trả lời xong là dừng.
6. Tiếng Việt lịch sự (xưng "Bạn / Anh / Chị"). User hỏi English → reply English.
7. Cite số từ tool, không bịa.

**Khi cần compare nhiều dòng dữ liệu → DÙNG MARKDOWN TABLE** (GitHub-flavored), cột số align phải:
\`\`\`
| Keyword | Users | Installs | CR | Pos |
|---|---:|---:|---:|---:|
| brand_x | 1,234 | 245 | 19.9% | 3 |
\`\`\`

**Ví dụ format đúng:**

❌ Sai: "Theo dữ liệu L7 thì keyword brand_x đang dẫn đầu với 1234 users tăng 12% so với tuần trước, trong khi competitor có 567 users giảm 5%, còn keyword profit thì..."

✅ Đúng:
"Top 3 keyword L7:
- **brand_x**: 1,234 users (+12%) · 245 installs · CR 19.9%
- **competitor**: 567 users (-5%) · 89 installs · CR 15.7%
- **profit**: 432 users (+8%) · 76 installs · CR 17.6%"

**Cách làm việc:**
- Gọi tool phù hợp lấy data thật trước khi trả lời.
- Default window = L7 nếu user không nói. Default surface = tất cả.
- Format số đẹp: "1,234 users (+12%)". Kèm window/surface/country khi có.
- Khi đưa nhận định, ngắn 1 câu giải thích lý do từ data (vd: "Users L7 giảm 15% do rank kw X tụt từ 3 → 8").
- Hỏi ngoài scope ASO → từ chối ngắn.

**Glossary:**
- organic = search tự nhiên · paid = Apple Search Ads (search_ad)
- Window: L3=3d · L7=7d · L14=14d · L30 ≈ tháng này · L90 ≈ 3 tháng
- KPIs: Users (demand), Install (số cài đặt), CR (conversion), Position (rank, lower better)
- VN + IN luôn exclude khỏi paid ads

**Tools:** get_overview · get_top_keywords · get_country_breakdown · get_category_share · get_volume_movers · get_market_trajectory · get_channel_split · get_daily_trend · search_keyword.`;

async function fetchPayload(): Promise<SheetPayload> {
  const raw = await fetchAllTabs();
  const masterKwLookup = parseMasterKw(raw['Master KW Lookup'] ?? []);
  const langKws = languageOnlyKeywords(masterKwLookup);
  return {
    actionQueue: parseActionQueue(raw['Action_Queue'] ?? []),
    marketIndex: parseMarketIndex(raw['Market_Index'] ?? []),
    tier1Watch: parseTier1Watch(raw['Tier1_Market_Watch'] ?? []),
    allL3: overrideCategoryExact(overrideToLanguage(parseKeywordTab(raw['All_L3'] ?? [], false), langKws)),
    allL7: overrideCategoryExact(overrideToLanguage(parseKeywordTab(raw['All_L7'] ?? [], false), langKws)),
    allL14: overrideCategoryExact(overrideToLanguage(parseKeywordTab(raw['All_L14'] ?? [], false), langKws)),
    allL30: overrideCategoryExact(overrideToLanguage(parseKeywordTab(raw['All_L30'] ?? [], false), langKws)),
    allL90: overrideCategoryExact(overrideToLanguage(parseKeywordTab(raw['All_L90'] ?? [], false), langKws)),
    countryL3: overrideCategoryExact(overrideToLanguage(parseKeywordTab(raw['Country_L3'] ?? [], true), langKws)),
    countryL7: overrideCategoryExact(overrideToLanguage(parseKeywordTab(raw['Country_L7'] ?? [], true), langKws)),
    countryL14: overrideCategoryExact(overrideToLanguage(parseKeywordTab(raw['Country_L14'] ?? [], true), langKws)),
    countryL30: overrideCategoryExact(overrideToLanguage(parseKeywordTab(raw['Country_L30'] ?? [], true), langKws)),
    countryL90: overrideCategoryExact(overrideToLanguage(parseKeywordTab(raw['Country_L90'] ?? [], true), langKws)),
    allL365: overrideCategoryExact(overrideToLanguage(parseSnapshot(raw['All_L365'] ?? [], false), langKws)),
    countryL365: overrideCategoryExact(overrideToLanguage(parseSnapshot(raw['Country_L365'] ?? [], true), langKws)),
    history: parseHistory(raw['History'] ?? []),
    historyDaily: parseHistoryDaily(raw['History_Daily'] ?? []),
    alertLog: parseAlertLog(raw['AlertLog'] ?? []),
    kwAddedManual: parseKwAddedManual(raw['KW_Added_Manual'] ?? []),
    masterKwLookup,
    pausedKw: parsePausedCamp(raw['Paused_camp'] ?? []),
    campLinks: parseCampLinks(raw['Camp_Links'] ?? []),
    bidCap: parseBidCap(raw['Max bid cap'] ?? []),
    shopifyCamps: parseShopifyCamps(raw['Shopify_daily'] ?? []),
    shopifyDateRange: parseShopifyDateRange(raw['Shopify_daily'] ?? []),
    negativeKw: parseNegativeKw(raw['Negative KW list'] ?? []),
    windowDates: (() => {
      const wd: Record<string, { from: string; to: string }> = {};
      (['L3', 'L7', 'L14', 'L30', 'L90'] as const).forEach((w) => {
        const r = parseWindowDateRange(raw[`All_${w}`] ?? []);
        if (r) wd[w] = r;
      });
      return wd;
    })(),
    fetchedAt: new Date().toISOString(),
  };
}

interface DashboardContext {
  page?: string;
  path?: string;
  window?: string;
  surface?: string;
  country?: string;
  keyword?: string;
  category?: string;
  date?: string;
}

function buildContextBlock(ctx: DashboardContext | undefined): string {
  if (!ctx) return '';
  const parts: string[] = [];
  if (ctx.page) parts.push(`Trang đang xem: ${ctx.page}`);
  if (ctx.date) parts.push(`Date mode — đang ghim ngày: ${ctx.date} (data per-ngày)`);
  if (ctx.window && !ctx.date) parts.push(`Window: ${ctx.window}`);
  if (ctx.surface && ctx.surface !== 'all') parts.push(`Surface: ${ctx.surface}`);
  if (ctx.country) parts.push(`Country focus: ${ctx.country}`);
  if (ctx.keyword) parts.push(`Keyword focus: ${ctx.keyword}`);
  if (ctx.category) parts.push(`Category focus: ${ctx.category}`);
  if (parts.length === 0) return '';
  return `\n\n**CONTEXT DASHBOARD (user ĐANG XEM cái này ngay lúc hỏi — DÙNG LÀM SCOPE MẶC ĐỊNH):**\n- ${parts.join('\n- ')}\n\nQuy tắc dùng context:\n- Khi user hỏi chung chung ("keyword này tụt sao", "tại sao giảm", "so với trước", "đang bao nhiêu") mà KHÔNG nói rõ window/country/surface/keyword → MẶC ĐỊNH lấy đúng các giá trị context ở trên (thay vì auto L7/all).\n- Nếu user nói rõ thông số khác → ưu tiên user, bỏ context.\n- Nếu đang date mode: trả lời theo ngày đã ghim; nếu user hỏi thứ không có data per-ngày (country/window) thì nói rõ giới hạn.`;
}

export async function POST(req: Request) {
  try {
    const { messages, dashboardContext }: { messages: UIMessage[]; dashboardContext?: DashboardContext } =
      await req.json();
    const payload = await fetchPayload();
    const tools = makeDashboardTools(payload);

    const result = streamText({
      model: google(MODEL_ID),
      system: SYSTEM_PROMPT + buildContextBlock(dashboardContext),
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
