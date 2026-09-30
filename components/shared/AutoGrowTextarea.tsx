'use client';

import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type ComponentProps } from 'react';

// Textarea cao đúng bằng nội dung.
//
// Khung Note cố định 2 dòng nghĩa là ghi chú dài hơn 2 dòng bị giấu — người
// viết phải kéo tay từng ô để đọc lại chính mình. Ở đây chiều cao đi theo
// scrollHeight mỗi lần nội dung đổi (kể cả khi note tải về từ sheet sau khi
// mount), nên mở bảng ra là thấy đủ. `rows` vẫn là chiều cao TỐI THIỂU để ô
// trống không xẹp thành một vạch. Người dùng kéo tay (resize-y) vẫn được, và
// lần gõ tiếp theo sẽ tính lại theo nội dung.
//
// forwardRef (30/09/2026): thanh định dạng RichToolbar cần tới textarea để bọc
// đoạn đang bôi đen bằng markup.
export const AutoGrowTextarea = forwardRef<HTMLTextAreaElement, ComponentProps<'textarea'>>(function AutoGrowTextarea(
  { value, style, ...props },
  outerRef,
) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(outerRef, () => ref.current as HTMLTextAreaElement, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto'; // co lại trước, kẻo scrollHeight giữ chiều cao cũ khi xoá chữ
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} value={value} style={{ overflowY: 'hidden', ...style }} {...props} />;
});
