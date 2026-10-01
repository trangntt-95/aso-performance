// Campaign ID nhỏ cạnh tên camp — để đối chiếu với Shopify Ads và để ô tìm
// kiếm theo ID có chỗ nhìn thấy (Trang 01/10/2026: tên camp đổi đuôi liên
// tục, ID là thứ không đổi).
export function CampIdTag({ id }: { id: string }) {
  return (
    <span
      title="Campaign ID (Camp_Links)"
      className="shrink-0 rounded bg-slate-100 px-1 font-mono text-[9px] font-medium leading-[1.5] text-slate-500"
    >
      #{id}
    </span>
  );
}
