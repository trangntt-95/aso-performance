'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function CopyKeywordsButton({
  keywords,
  label = 'Copy keywords',
  className,
}: {
  keywords: string[];
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  // Dedupe + preserve first-seen order so the output matches what's on screen.
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const k of keywords) {
    const key = k.trim();
    if (!key) continue;
    const dedupeKey = key.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    unique.push(key);
  }
  const count = unique.length;
  const disabled = count === 0;

  const handleCopy = async () => {
    if (disabled) return;
    const text = unique.join('\n');
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers / non-https contexts.
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — most likely clipboard permission denied
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      disabled={disabled}
      title={
        disabled
          ? 'Không có keyword để copy'
          : `Copy ${count} keyword (1 kw/dòng) — paste thẳng vào Google Sheets`
      }
      className={cn('h-7 text-xs gap-1', copied && 'border-emerald-400 text-emerald-700', className)}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied!' : `${label} (${count})`}
    </Button>
  );
}
