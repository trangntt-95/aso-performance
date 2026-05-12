import { Layers } from 'lucide-react';

export default function CategoriesPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center text-gray-500">
      <Layers className="h-10 w-10 mb-3 text-gray-400" />
      <div className="font-semibold mb-1">Categories</div>
      <div className="text-sm max-w-md">
        Drill-down per Brand / Competitor / Profit / Feature / Language — coming in Phase 2.
      </div>
    </div>
  );
}
