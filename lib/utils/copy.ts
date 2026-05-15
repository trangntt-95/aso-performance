import type { AlertType, BidAction } from '@/lib/sheets/types';

const ALERT_VI: Record<string, string> = {
  '🚨 USER DROP + POS WORSEN': 'Người dùng giảm & rank tụt — phòng thủ ngay',
  '⚠️ POSITION WORSEN': 'Rank tụt — có thể đối thủ outbid',
  '💔 INSTALL DROP': 'Lượt install giảm — listing/CR có vấn đề',
  '💸 CR DROP': 'Tỷ lệ CR giảm — match type hoặc listing yếu',
  '📉 USER DROP': 'Lượt impression / users giảm',
  OK: 'Bình thường',
  '🌱 user growth + pos improve': 'Users tăng + rank lên — combo win',
  '📈 pos improve': 'Rank đang lên',
  '❤️ install up': 'Install tăng — conversion ổn',
  '💚 cr improve': 'CR cải thiện',
  '🚀 user growth': 'Users tăng — demand đang lên',
  '🎯 ORG STRONG, PAID MISSING': 'Organic mạnh, paid chưa bid country này',
  '🎯 ORG STRONG, PAID WEAK': 'Organic mạnh, paid đang bid yếu (rank > 3)',
  '🎯 ORG GOOD, POS LOW': 'Organic ổn nhưng rank còn thấp',
};

const ACTION_VI: Record<string, string> = {
  'RAISE BID': 'Tăng bid',
  'RAISE BID PAID': 'Tăng bid paid',
  'REDUCE BID': 'Giảm bid',
  'AUDIT KW': 'Audit keyword',
  'AUDIT MATCH TYPE': 'Audit match type',
  NEGATIVE: 'Thêm negative keyword',
  PAUSE: 'Tạm dừng',
  SCALE: 'Scale lên',
  MONITOR: 'Theo dõi',
  HOLD: 'Giữ nguyên',
  'EXPAND TO PAID': 'Mở camp paid (bid country này)',
  'HOLD PAID': 'Giữ paid như cũ',
  'REVIEW PAID BID': 'Xem lại bid paid',
  'CHECK ORGANIC': 'Kiểm tra organic',
  'CHECK ORGANIC ALGO': 'Kiểm tra organic algo',
  'CHECK LISTING': 'Kiểm tra listing',
  'REVIEW LISTING': 'Xem lại listing',
  'MONITOR ORGANIC': 'Theo dõi organic',
  REVIEW: 'Xem lại',
};

export function alertCopy(alert: AlertType | string): string {
  return ALERT_VI[alert] ?? alert;
}

export function actionCopy(action: BidAction | string): string {
  return ACTION_VI[action] ?? action;
}
