'use client';

import { useKeywordTrendStore, type KeywordTrendSurface } from '@/lib/store/keywordTrendStore';
import { cn } from '@/lib/utils';

interface Props {
  keyword: string;
  country?: string;
  surface?: KeywordTrendSurface;
  className?: string;
  children?: React.ReactNode;
  // Fired alongside opening the detail sheet — lets the caller also set a page
  // filter so one click does both (filter + deep-dive).
  onSelect?: (keyword: string) => void;
}

export function KeywordLink({ keyword, country, surface, className, children, onSelect }: Props) {
  const openKeyword = useKeywordTrendStore((s) => s.openKeyword);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openKeyword(keyword, { country, surface });
        onSelect?.(keyword);
      }}
      className={cn(
        'text-left hover:underline decoration-dotted underline-offset-2 cursor-pointer',
        className,
      )}
    >
      {children ?? keyword}
    </button>
  );
}
