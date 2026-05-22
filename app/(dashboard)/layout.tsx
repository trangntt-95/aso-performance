import { Sidebar, MobileTabBar } from '@/components/shared/Sidebar';
import { TopBar } from '@/components/shared/TopBar';
import { KeywordTrendSheet } from '@/components/keyword-trend/KeywordTrendSheet';
import { CountryDetailSheet } from '@/components/overview/CountryDetailSheet';
import { CategoryDetailSheet } from '@/components/overview/CategoryDetailSheet';
import { ChatWidget } from '@/components/chat/ChatWidget';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">{children}</main>
      </div>
      <MobileTabBar />
      <KeywordTrendSheet />
      <CountryDetailSheet />
      <CategoryDetailSheet />
      <ChatWidget />
    </div>
  );
}
