import type { AlertType, BidAction, Category, Priority, Verdict } from '@/lib/sheets/types';

export interface BadgeStyle {
  bg: string;
  text: string;
  bold?: boolean;
}

export const PRIORITY_STYLES: Record<Priority, BadgeStyle> = {
  P0: { bg: 'bg-red-700', text: 'text-white', bold: true },
  P1: { bg: 'bg-orange-500', text: 'text-white', bold: true },
  P2: { bg: 'bg-yellow-300', text: 'text-black', bold: true },
  P3: { bg: 'bg-gray-300', text: 'text-gray-800' },
};

const FALLBACK_ALERT_STYLE: BadgeStyle = { bg: 'bg-gray-100', text: 'text-gray-700' };

export const ALERT_STYLES: Record<AlertType, BadgeStyle> = {
  '🚨 USER DROP + POS WORSEN': { bg: 'bg-red-700', text: 'text-white', bold: true },
  '⚠️ POSITION WORSEN': { bg: 'bg-red-100', text: 'text-red-900', bold: true },
  '💔 INSTALL DROP': { bg: 'bg-orange-500', text: 'text-white', bold: true },
  '💸 CR DROP': { bg: 'bg-yellow-200', text: 'text-yellow-900', bold: true },
  '📉 USER DROP': { bg: 'bg-yellow-100', text: 'text-yellow-900', bold: true },
  OK: { bg: 'bg-gray-100', text: 'text-gray-600' },
  '🌱 user growth + pos improve': { bg: 'bg-green-700', text: 'text-white' },
  '📈 pos improve': { bg: 'bg-green-100', text: 'text-green-900' },
  '❤️ install up': { bg: 'bg-emerald-100', text: 'text-emerald-900' },
  '💚 cr improve': { bg: 'bg-green-100', text: 'text-green-900' },
  '🚀 user growth': { bg: 'bg-green-50', text: 'text-green-900' },
  '🎯 ORG STRONG, PAID MISSING': { bg: 'bg-blue-700', text: 'text-white', bold: true },
  '🎯 ORG STRONG, PAID WEAK': { bg: 'bg-blue-500', text: 'text-white', bold: true },
  '🎯 ORG GOOD, POS LOW': { bg: 'bg-teal-500', text: 'text-white' },
};

export function alertStyle(alert: AlertType | string): BadgeStyle {
  return (ALERT_STYLES as Record<string, BadgeStyle>)[alert] ?? FALLBACK_ALERT_STYLE;
}

const FALLBACK_ACTION_STYLE: BadgeStyle = { bg: 'bg-gray-100', text: 'text-gray-700' };

export const BID_ACTION_STYLES: Record<BidAction, BadgeStyle> = {
  PAUSE: { bg: 'bg-red-700', text: 'text-white', bold: true },
  NEGATIVE: { bg: 'bg-orange-500', text: 'text-white', bold: true },
  'RAISE BID': { bg: 'bg-green-700', text: 'text-white', bold: true },
  'RAISE BID PAID': { bg: 'bg-green-800', text: 'text-white', bold: true },
  'EXPAND TO PAID': { bg: 'bg-green-700', text: 'text-white', bold: true },
  SCALE: { bg: 'bg-green-700', text: 'text-white', bold: true },
  'REDUCE BID': { bg: 'bg-yellow-200', text: 'text-yellow-900', bold: true },
  'REVIEW PAID BID': { bg: 'bg-yellow-200', text: 'text-yellow-900', bold: true },
  'AUDIT KW': { bg: 'bg-yellow-100', text: 'text-yellow-900' },
  'AUDIT MATCH TYPE': { bg: 'bg-yellow-100', text: 'text-yellow-900' },
  'REVIEW LISTING': { bg: 'bg-red-100', text: 'text-red-900', bold: true },
  'CHECK LISTING': { bg: 'bg-red-100', text: 'text-red-900' },
  'CHECK ORGANIC': { bg: 'bg-gray-300', text: 'text-gray-900' },
  'CHECK ORGANIC ALGO': { bg: 'bg-gray-300', text: 'text-gray-900' },
  HOLD: { bg: 'bg-gray-100', text: 'text-gray-700' },
  'HOLD PAID': { bg: 'bg-green-50', text: 'text-green-900' },
  MONITOR: { bg: 'bg-gray-100', text: 'text-gray-700' },
  'MONITOR ORGANIC': { bg: 'bg-gray-100', text: 'text-gray-700' },
  REVIEW: { bg: 'bg-gray-100', text: 'text-gray-700' },
};

export function bidActionStyle(action: BidAction | string): BadgeStyle {
  return (BID_ACTION_STYLES as Record<string, BadgeStyle>)[action] ?? FALLBACK_ACTION_STYLE;
}

export const CATEGORY_STYLES: Record<Category, { bg: string; text: string; emoji: string }> = {
  Brand: { bg: 'bg-purple-100', text: 'text-purple-900', emoji: '🏷️' },
  Competitor: { bg: 'bg-red-100', text: 'text-red-900', emoji: '⚔️' },
  Profit: { bg: 'bg-green-100', text: 'text-green-900', emoji: '💰' },
  Feature: { bg: 'bg-blue-100', text: 'text-blue-900', emoji: '⚙️' },
  Language: { bg: 'bg-indigo-100', text: 'text-indigo-900', emoji: '🌐' },
  Others: { bg: 'bg-amber-100', text: 'text-amber-900', emoji: '📦' },
  CPM: { bg: 'bg-pink-100', text: 'text-pink-900', emoji: '📢' },
  Noise: { bg: 'bg-gray-200', text: 'text-gray-700', emoji: '🗑️' },
  Unknown: { bg: 'bg-gray-100', text: 'text-gray-500', emoji: '❓' },
  CatePage: { bg: 'bg-cyan-100', text: 'text-cyan-900', emoji: '📑' },
  Category: { bg: 'bg-cyan-100', text: 'text-cyan-900', emoji: '📚' },
  Test: { bg: 'bg-yellow-100', text: 'text-yellow-900', emoji: '🧪' },
};

export function categoryStyle(cat: Category | string) {
  return (CATEGORY_STYLES as Record<string, { bg: string; text: string; emoji: string }>)[cat] ?? CATEGORY_STYLES.Unknown;
}

export const VERDICT_STYLES: Record<Verdict, BadgeStyle> = {
  '📉 MARKET DOWN': { bg: 'bg-red-700', text: 'text-white', bold: true },
  '⚠️ SOFT DECLINE': { bg: 'bg-red-100', text: 'text-red-900' },
  '→ STABLE': { bg: 'bg-gray-100', text: 'text-gray-700' },
  '📈 SOFT GROWTH': { bg: 'bg-green-100', text: 'text-green-900' },
  '🚀 MARKET UP': { bg: 'bg-green-700', text: 'text-white', bold: true },
};

export function verdictStyle(v: Verdict | string): BadgeStyle {
  return (VERDICT_STYLES as Record<string, BadgeStyle>)[v] ?? { bg: 'bg-gray-100', text: 'text-gray-700' };
}

export const CATEGORY_ORDER: Category[] = [
  'Brand',
  'Competitor',
  'Profit',
  'Feature',
  'Language',
  'CatePage',
  'Category',
  'Others',
  'CPM',
  'Noise',
  'Unknown',
  'Test',
];

export const PRIORITY_ORDER: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
