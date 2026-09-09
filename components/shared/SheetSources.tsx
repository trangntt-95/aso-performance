'use client';

import { useSheetData } from '@/lib/hooks/useSheetData';
import { sourcesBySheet, type DataSourceKey } from '@/lib/market/dataGaps';
import { formatDMYTime } from '@/lib/utils/format';

// A one-line footer naming where a screen's data comes from.
//
// Deliberately tiny and last. It answers one question — "where does this come
// from" — that otherwise costs a trip through the code, and it stops being
// answerable at all once numbers are quoted out of context.
//
// Hai mức, và mức chi tiết mới là mức đáng có: tên spreadsheet ("ASO (sheet
// chính)") chỉ nói được có ba chỗ, còn tên TAB ("Max bid cap", "Country_L*")
// mới trả lời được "số này lấy ở đâu ra". Nên khi trang khai báo source của nó
// thì footer kể tên tab, nhóm theo spreadsheet, và chỉ spreadsheet mới mang
// link — link thẳng tới tab cần gid, mà gid không nằm trong payload.
//
// Danh sách tab lấy từ chính mảng `sources` mà trang đã khai cho DataGapNote,
// nên hai footer không thể nói khác nhau về cùng một trang: sửa một chỗ là cả
// hai đổi theo. Link thì lấy từ payload chứ không viết cứng ở đây, nên đổi tên
// sheet hay trỏ sang id khác không để lại prose cũ.
export function SheetSources({
  sources,
  extra,
}: {
  sources?: readonly DataSourceKey[];
  /**
   * Tab trong sheet ASO mà registry của DataGapNote không có.
   *
   * Có một loại tab như vậy: App_Notes đọc qua /api/notes chứ không nằm trong
   * payload, nên không thể có DataSourceKey (registry cần một hàm đếm dòng từ
   * payload). Không nêu nó ra thì footer của Change log chỉ kể Camp_Links và
   * PerGeo_CPI_Cap — đúng, vì trang dùng chúng để dựng dropdown, nhưng người
   * đọc sẽ tưởng log nằm ở đó. Đứng trước vì nó là nguồn chính của trang.
   */
  extra?: readonly string[];
}) {
  const { data } = useSheetData();
  const spreadsheets = data?.sheetSources ?? [];
  if (!spreadsheets.length) return null;

  const linkOf = (id: string) => spreadsheets.find((s) => s.id === id) ?? null;
  const groups = sourcesBySheet(sources ?? []).map((g) =>
    g.sheet === 'aso' && extra?.length ? { ...g, labels: [...extra, ...g.labels] } : g,
  );
  if (groups.length === 0 && extra?.length) groups.push({ sheet: 'aso', labels: [...extra] });

  return (
    <div className="text-[10px] leading-relaxed text-slate-400">
      Nguồn:{' '}
      {groups.length > 0
        ? groups.map((g, i) => {
            const link = linkOf(g.sheet);
            return (
              <span key={g.sheet}>
                {i > 0 && ' · '}
                {link ? (
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-indigo-600 hover:underline"
                  >
                    {link.label}
                  </a>
                ) : (
                  g.sheet
                )}
                {' → '}
                <span className="text-slate-400">{g.labels.join(', ')}</span>
              </span>
            );
          })
        : spreadsheets.map((s, i) => (
            <span key={s.url}>
              {i > 0 && ' · '}
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-indigo-600 hover:underline"
              >
                {s.label}
              </a>
            </span>
          ))}
      {data?.fetchedAt && <> · đọc lúc {formatDMYTime(data.fetchedAt)}</>}
    </div>
  );
}
