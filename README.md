# 🚗 CarHub VF5 — Trình Nghe Nhạc, Video & Cockpit HUD trên Apple CarPlay (APTV & asCar)

Ứng dụng giải trí & bảng điều khiển thông minh được thiết kế chuyên biệt cho **màn hình trung tâm 8 inch của VinFast VF5** khi kết nối **Apple CarPlay** qua **APTV** và **asCar**.

---

## 🌟 Tính năng nổi bật cho VinFast VF5

1. **Giao diện 2 cột ngang chuẩn màn hình CarPlay (`APTV` & `asCar`)**:
   - Bố cục tự động khớp mọi khung hình CarPlay (`640×360 @2x`, `710×480`, `800×480`, `1024×600`), không bao giờ cắt khuất cụm nút Play/Pause/Next/Prev.
   - Giữ duy nhất 1 phiên YouTube IFrame và đổi bài `0ms` qua `loadVideoById`, tự động bỏ qua các video bị chủ kênh khóa nhúng.
   - Nhận lệnh trực tiếp từ phím cứng trên **vô lăng VinFast VF5** (`Next`, `Prev`, `Play/Pause`).

2. **Tự động bỏ qua dạo đầu MV & Quảng cáo tài trợ (SponsorBlock)**:
   - Tự động nhảy qua các đoạn diễn kịch / hội thoại đầu MV (`music_offtopic`), `intro`, `outro` và quảng cáo tài trợ để vào thẳng phần nhạc chính. Có thể bật/tắt 1 chạm bằng nút `⏩` cạnh tên bài.

3. **Quản lý nhiều Playlist riêng & Đồng bộ bằng Mã Xe 4 số (`VF5-XXXX`)**:
   - Tạo nhiều danh sách riêng (*Đi Cao Tốc*, *Bolero Chọn Lọc*, *Nhạc Cho Bé*...).
   - Bàn phím số to chuyên dụng cho màn xe: soạn sẵn nhạc trên điện thoại/máy tính ở nhà $\rightarrow$ bấm **Đẩy lên mây** $\rightarrow$ lên xe nhập đúng 4 số (hoặc mở link `https://carhub-vf5.pages.dev/?sync=6868` trên `APTV` / `asCar`) là đồng bộ tức thì.
   - *(Tùy chọn lưu vĩnh viễn toàn cầu)*: Vào **Cloudflare Pages > Settings > Functions > KV Namespace Bindings**, gắn biến `CARHUB_KV` trỏ tới một KV Namespace bất kỳ. Nếu chưa gắn KV, hệ thống vẫn tự hoạt động ngay qua tầng lưu trữ Cloudflare Edge Cache 30 ngày.

4. **Màn hình HUD Cockpit VF5 & Chế độ Dịu mắt Ban đêm (`🌙`)**:
   - Mục **Cockpit** hiển thị **Đồng hồ tốc độ GPS (`km/h`) số lớn** đổi màu theo dải tốc độ (`Đô thị` / `Ngoài đô thị` / `Cao tốc`), **Giờ & Ngày**, **Thời tiết & Cảnh báo mưa đường trơn** theo vị trí thực tế (Open-Meteo), cùng **khung Karaoke 2 dòng** liếc nhanh.
   - Tự động hạ độ chói nền sau `18:00` tối (hoặc bấm nút `🌙 / ☀️` ở góc dưới thanh trái) giúp không chói mắt khi lái đêm.

5. **Cử chỉ Vuốt mù (Blind Gestures) & Đài phát thông minh (`⚡ Mix`)**:
   - **Vuốt ngang Trái / Phải** trên Ảnh bìa (hoặc thẻ nhạc trong Cockpit) để chuyển bài không cần nhìn nút; **Chạm đúp** để thả tim lưu bài.
   - Bấm nút **`⚡ Mix`** để tự động lập đài phát vô tận gồm các bài hát cùng ca sĩ / cùng gu với bài đang nghe.

---

## 🚀 Phát triển & Triển khai (Cloudflare Pages)

```bash
# Chạy môi trường dev
npm install
npm run dev

# Kiểm tra TypeScript & Build Production
npm run build

# Deploy lên Cloudflare Pages
npx wrangler pages deploy dist --project-name carhub-vf5
```
