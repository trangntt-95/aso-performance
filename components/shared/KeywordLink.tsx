'use client';

import { useKeywordTrendStore, type KeywordTrendSurface } from '@/lib/store/keywordTrendStore';
import { cn } from '@/lib/utils';

interface Props {
  keyword: string;
  country?: string;
  surface?: KeywordTrendSurface;
  className?: string;
  children?: React.ReactNode;
}

export function KeywordLink({ keyword, country, surface, className, children }: Props) {
  const openKeyword = useKeywordTrendStore((s) => s.openKeyword);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openKeyword(keyword, { country, surface });
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
