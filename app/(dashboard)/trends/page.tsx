import { Sparkles } from 'lucide-react';

export default function TrendsPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center text-gray-500">
      <Sparkles className="h-10 w-10 mb-3 text-gray-400" />
      <div className="font-semibold mb-1">Trends</div>
      <div className="text-sm max-w-md">
        90-day keyword trends + WoW comparison — coming in Phase 3.
      </div>
    </div>
  );
}
