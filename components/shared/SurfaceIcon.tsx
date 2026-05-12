import type { SurfaceLabel } from '@/lib/sheets/types';
import { DollarSign, Leaf } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SurfaceIcon({ surface, withLabel }: { surface: SurfaceLabel; withLabel?: boolean }) {
  const isPaid = surface === 'paid';
  const Icon = isPaid ? DollarSign : Leaf;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[11px]',
        isPaid ? 'text-amber-700' : 'text-green-700',
      )}
      title={surface}
    >
      <Icon className="h-3 w-3" />
      {withLabel && <span>{surface}</span>}
    </span>
  );
}
