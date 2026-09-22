/**
 * Số ngày một camp / keyword vừa ghi note được tạm ẩn khỏi danh sách "cần xử
 * lý" (chuyển sang "đã xử lý"), sau đó tự quay lại để kiểm tra kết quả.
 *
 * Dùng chung cho Underbid, Overbid, Camp Health, Brand top — trước 22/09/2026
 * mỗi tab khai riêng một hằng 5 ngày, Trang đổi thành 7 thì phải sửa bốn chỗ.
 */
export const NOTE_HIDE_DAYS = 7;

/**
 * Riêng Camp Health: một camp vừa chỉnh bid cần lâu hơn mới đủ dữ liệu để
 * kết luận (spend, install gom theo tuần), nên Trang muốn ẩn 15 ngày
 * (22/09/2026). Các tab keyword vẫn dùng NOTE_HIDE_DAYS.
 */
export const CAMP_HEALTH_NOTE_HIDE_DAYS = 15;
