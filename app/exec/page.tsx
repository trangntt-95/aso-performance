import type { Metadata } from 'next';
import { OverviewDashboard } from '@/components/overview/OverviewDashboard';

export const metadata: Metadata = {
  title: 'TrueProfit ASO · Executive view',
  description: 'Read-only ASO dashboard for stakeholders.',
};

export default function ExecPage() {
  return <OverviewDashboard embedded />;
}
