// Keyword đó là tiếng nước nào.
//
// Các tab All_L* / Country_L* có cột lang (mã ISO: 'en', 'es', 'zh'…) do bộ
// phân loại của sheet gán, nhưng 684/2936 dòng để trống và mã thì người đọc
// phải tự dịch. Ở đây: ưu tiên mã của sheet; trống thì đoán theo bộ chữ (Hán,
// Kana, Hangul, Thái, Ả Rập, Kirin) — đoán được chắc vì bộ chữ không lẫn; chữ
// Latin không dấu mà không có mã thì coi là tiếng Anh (mặc định của app store);
// Latin có dấu mà không có mã thì nói thẳng là chưa xác định, không đoán bừa
// giữa Tây Ban Nha / Bồ Đào Nha / Pháp.

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
  /** 'sheet' = cột lang của tab; 'script' = đoán theo bộ chữ; 'default' = Latin
   *  không dấu, không mã → tiếng Anh; 'unknown' = Latin có dấu mà không có mã. */
  source: 'sheet' | 'script' | 'default' | 'unknown';
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

export function languageOfKeyword(keyword: string, langCode?: string | null): KeywordLanguage {
  const code = (langCode ?? '').trim().toLowerCase();
  if (code) {
    return { code, name: LANG_NAMES[code] ?? `Mã ${code}`, source: 'sheet' };
  }
  const kw = keyword ?? '';
  for (const s of SCRIPTS) {
    if (s.re.test(kw)) return { code: s.code, name: LANG_NAMES[s.code], source: 'script' };
  }
  // eslint-disable-next-line no-control-regex
  if (!/[^\x00-\x7F]/.test(kw)) return { code: 'en', name: 'Tiếng Anh', source: 'default' };
  return { code: '', name: 'Chưa xác định', source: 'unknown' };
}

/** Nhãn ngắn kèm mã, ví dụ 'Tiếng Tây Ban Nha (es)'. */
export function languageLabel(l: KeywordLanguage): string {
  return l.code ? `${l.name} (${l.code})` : l.name;
}
