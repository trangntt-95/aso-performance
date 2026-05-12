import { Globe2 } from 'lucide-react';

export default function Tier1WatchPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center text-gray-500">
      <Globe2 className="h-10 w-10 mb-3 text-gray-400" />
      <div className="font-semibold mb-1">Tier 1 Market Watch</div>
      <div className="text-sm max-w-md">
        US/UK/CA/AU keyword alerts across L3/L7/L14/L30 — coming in Phase 2.
      </div>
    </div>
  );
}
