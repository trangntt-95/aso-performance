// Keyword đó là tiếng nước nào.
//
// Các tab All_L* / Country_L* có cột lang (mã ISO: 'en', 'es', 'zh'…) do bộ
// phân loại của sheet gán, nhưng 684/2936 dòng để trống, và mã có lúc sai
// ("steuer zoll gebühre" ghi es, "kapıda ödeme" ghi de — đo 11/09/2026).
//
// Nên mã sheet không được tin tuyệt đối. Thứ tự:
//   1. Tín hiệu CHẮC từ chính keyword: bộ chữ (Hán, Kana, Hangul, Thái, Ả Rập,
//      Kirin, Hy Lạp, Devanagari), dấu tiếng Việt, hoặc ký tự chỉ một ngôn ngữ
//      Latin mới có (ß → de, ñ → es, ã/õ → pt, ł/ą/ę → pl, ı/ğ → tr, ș/ț → ro,
//      ř/ě/ů → cs, œ → fr). Tín hiệu này GHI ĐÈ mã sheet khi hai bên khác nhau,
//      và giữ lại mã sheet để hiện "sheet ghi …" — sửa nhưng không giấu.
//   2. Mã sheet, khi không có tín hiệu chắc nào cãi lại.
//   3. Tín hiệu YẾU: từ nối đặc trưng (und/für → de, para/los → es, com/não →
//      pt…). Chỉ dùng để LẤP CHỖ TRỐNG, không ghi đè — 'de' vừa là tiếng Đức
//      vừa là "của" trong tiếng Tây Ban Nha.
//   4. Latin không dấu, không mã → tiếng Anh (mặc định của app store).
//   5. Latin có dấu mà không nhận ra → nói thẳng chưa xác định, không đoán bừa.
//
// Sửa ở đây là sửa TRÊN DASHBOARD; cột lang trong sheet không đổi (Apps Script
// của sheet ghi cột đó).

const LANG_NAMES: Record<string, string> = {
  en: 'Tiếng Anh',
  es: 'Tiếng Tây Ban Nha',
  pt: 'Tiếng Bồ Đào Nha',
  fr: 'Tiếng Pháp',
  de: 'Tiếng Đức',
  it: 'Tiếng Ý',
  nl: 'Tiếng Hà Lan',
  sv: 'Tiếng Thụy Điển',
  da: 'Tiếng Đan Mạch',
  no: 'Tiếng Na Uy',
  fi: 'Tiếng Phần Lan',
  pl: 'Tiếng Ba Lan',
  ro: 'Tiếng Romania',
  tr: 'Tiếng Thổ Nhĩ Kỳ',
  ru: 'Tiếng Nga',
  uk: 'Tiếng Ukraina',
  el: 'Tiếng Hy Lạp',
  cs: 'Tiếng Séc',
  hu: 'Tiếng Hungary',
  ar: 'Tiếng Ả Rập',
  he: 'Tiếng Do Thái',
  hi: 'Tiếng Hindi',
  th: 'Tiếng Thái',
  vi: 'Tiếng Việt',
  id: 'Tiếng Indonesia',
  ms: 'Tiếng Malay',
  ja: 'Tiếng Nhật',
  ko: 'Tiếng Hàn',
  zh: 'Tiếng Trung',
  'zh-tw': 'Tiếng Trung (phồn thể)',
  'zh-cn': 'Tiếng Trung (giản thể)',
};

export interface KeywordLanguage {
  /** Mã ISO đã chuẩn hoá ('es'), hoặc '' khi không biết. */
  code: string;
  /** Tên tiếng Việt để hiện. */
  name: string;
  /**
   * 'sheet' = cột lang của tab; 'corrected' = bộ chữ / ký tự đặc trưng cãi lại
   * mã sheet và thắng (xem sheetCode); 'script' = sheet trống, đoán theo bộ chữ
   * hoặc ký tự đặc trưng; 'words' = sheet trống, đoán theo từ nối; 'default' =
   * Latin không dấu, không mã → tiếng Anh; 'unknown' = Latin có dấu mà không
   * nhận ra.
   */
  source: 'sheet' | 'corrected' | 'script' | 'words' | 'default' | 'unknown';
  /** Mã sheet đã ghi, khi source = 'corrected'. */
  sheetCode?: string;
}

const SCRIPTS: { re: RegExp; code: string }[] = [
  { re: /[぀-ヿ]/, code: 'ja' }, // Hiragana / Katakana — kiểm tra trước Hán vì tiếng Nhật cũng có Kanji
  { re: /[가-힯ᄀ-ᇿ]/, code: 'ko' },
  { re: /[一-鿿㐀-䶿]/, code: 'zh' },
  { re: /[฀-๿]/, code: 'th' },
  { re: /[؀-ۿݐ-ݿ]/, code: 'ar' },
  { re: /[֐-׿]/, code: 'he' },
  { re: /[Ѐ-ӿ]/, code: 'ru' },
  { re: /[Ͱ-Ͽ]/, code: 'el' },
  { re: /[ऀ-ॿ]/, code: 'hi' },
  // Tiếng Việt: các dấu chỉ tiếng Việt mới có (ơ, ư, ă, đ, và dấu thanh trên nguyên âm).
  { re: /[ơưăđĂĐƠƯẠ-ỹ]/, code: 'vi' },
];

// Ký tự mà (trong các ngôn ngữ app store hay gặp) chỉ MỘT ngôn ngữ Latin dùng.
// Không có ü/ö/ä (Đức, Thổ, Hungary, Thụy Điển đều dùng), không có é/á/ó
// (Tây Ban Nha, Bồ Đào Nha, Pháp, Hungary…) — những chữ đó không kết luận được.
const LATIN_MARKERS: { re: RegExp; code: string }[] = [
  { re: /ß/, code: 'de' },
  { re: /[ñ¿¡]/, code: 'es' },
  { re: /[ãõ]/i, code: 'pt' },
  { re: /[łąęśżźćń]/i, code: 'pl' },
  { re: /[ığ]|İ/, code: 'tr' }, // ı không chấm và ğ chỉ Thổ có; ş dùng chung với Romania cũ
  { re: /[șț]/i, code: 'ro' },
  { re: /[řěů]/i, code: 'cs' },
  { re: /œ/i, code: 'fr' },
];

// Từ nối đặc trưng — tín hiệu YẾU, chỉ lấp chỗ trống. Cố ý bỏ những từ hai
// ngôn ngữ dùng chung ('de' es/pt, 'a' es/pt/it, 'la' es/fr/it, 'e' pt/it).
const STOPWORDS: { code: string; words: string[] }[] = [
  { code: 'de', words: ['und', 'für', 'mit', 'der', 'die', 'das', 'nicht', 'ohne', 'auf'] },
  { code: 'es', words: ['para', 'los', 'las', 'por', 'como', 'ganancias'] },
  { code: 'pt', words: ['com', 'não', 'dos', 'das', 'uma', 'você', 'seu', 'lucro'] },
  { code: 'fr', words: ['pour', 'avec', 'les', 'des', 'une', 'sur', 'vos', 'mes'] },
  { code: 'it', words: ['per', 'gli', 'della', 'delle', 'dei', 'profitto'] },
  { code: 'nl', words: ['voor', 'het', 'een', 'van', 'met', 'naar', 'winst'] },
  { code: 'tr', words: ['ve', 'için', 'ile', 'bir', 'takip'] },
  { code: 'id', words: ['dan', 'untuk', 'dengan', 'yang', 'aplikasi'] },
];

/** Tín hiệu chắc: bộ chữ hoặc ký tự đặc trưng. '' khi không có. */
export function strongSignal(keyword: string): string {
  const kw = keyword ?? '';
  for (const s of SCRIPTS) if (s.re.test(kw)) return s.code;
  const hits = new Set<string>();
  for (const m of LATIN_MARKERS) if (m.re.test(kw)) hits.add(m.code);
  // Hai ngôn ngữ cùng lên tiếng thì không ai chắc.
  return hits.size === 1 ? Array.from(hits)[0] : '';
}

/** Tín hiệu yếu: từ nối. '' khi không có hoặc hai ngôn ngữ cùng khớp. */
export function weakSignal(keyword: string): string {
  const words = (keyword ?? '').toLowerCase().split(/[\s\-_,./|()\[\]"']+/).filter(Boolean);
  const hits = new Set<string>();
  for (const s of STOPWORDS) if (words.some((w) => s.words.includes(w))) hits.add(s.code);
  return hits.size === 1 ? Array.from(hits)[0] : '';
}

const sameFamily = (a: string, b: string): boolean => a === b || (a.startsWith('zh') && b.startsWith('zh'));

/**
 * Category mà keyword gần như luôn là tên thương hiệu hoặc biến thể gõ sai của
 * nó ("truprofit", "true proft", "lifetimely"). Bộ phân loại ngôn ngữ của
 * sheet và Google Translate đều đoán bừa trên chuỗi vô nghĩa — "truprofit" ra
 * es / "bodybuilding" (14/09/2026) — nên với category này, chữ Latin không dấu
 * là tiếng Anh, bất kể sheet ghi gì, trừ khi bộ chữ nói khác.
 */
const BRANDISH = new Set(['brand', 'profit', 'competitor']);

export function languageOfKeyword(
  keyword: string,
  langCode?: string | null,
  category?: string | null,
): KeywordLanguage {
  const code = (langCode ?? '').trim().toLowerCase();
  const strong = strongSignal(keyword);
  // eslint-disable-next-line no-control-regex
  const ascii = !/[^\x00-\x7F]/.test(keyword ?? '');
  if (!strong && ascii && category && BRANDISH.has(category.trim().toLowerCase())) {
    return code && code !== 'en'
      ? { code: 'en', name: 'Tiếng Anh', source: 'corrected', sheetCode: code }
      : { code: 'en', name: 'Tiếng Anh', source: code ? 'sheet' : 'default' };
  }
  if (code) {
    if (strong && !sameFamily(strong, code)) {
      return { code: strong, name: LANG_NAMES[strong] ?? `Mã ${strong}`, source: 'corrected', sheetCode: code };
    }
    return { code, name: LANG_NAMES[code] ?? `Mã ${code}`, source: 'sheet' };
  }
  if (strong) return { code: strong, name: LANG_NAMES[strong] ?? `Mã ${strong}`, source: 'script' };
  const weak = weakSignal(keyword);
  if (weak) return { code: weak, name: LANG_NAMES[weak] ?? `Mã ${weak}`, source: 'words' };
  // eslint-disable-next-line no-control-regex
  if (!/[^\x00-\x7F]/.test(keyword ?? '')) return { code: 'en', name: 'Tiếng Anh', source: 'default' };
  return { code: '', name: 'Chưa xác định', source: 'unknown' };
}

/** Nhãn ngắn kèm mã, ví dụ 'Tiếng Tây Ban Nha (es)'. */
export function languageLabel(l: KeywordLanguage): string {
  return l.code ? `${l.name} (${l.code})` : l.name;
}
