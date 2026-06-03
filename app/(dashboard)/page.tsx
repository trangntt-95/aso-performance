import { Suspense } from 'react';
import { OverviewDashboard } from '@/components/overview/OverviewDashboard';

export default function OverviewPage() {
  return (
    <Suspense fallback={null}>
      <OverviewDashboard />
    </Suspense>
  );
}
