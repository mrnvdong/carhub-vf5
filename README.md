# 🚗 CarHub VF5 - Trình xem YouTube không quảng cáo cho ô tô (VinFast VF5 & Apple CarPlay APTV)

Website nghe nhạc & xem video YouTube tối ưu chuyên biệt cho màn hình ô tô (VinFast VF5) chạy qua ứng dụng **APTV** trên Apple CarPlay.

---

## 🌟 Tính năng nổi bật cho ô tô

1. **Chặn quảng cáo 100%**:
   - Sử dụng kết hợp **Phương án B** (Cloudflare Edge InnerTube extractor) và **Phương án A** (Piped API Multi-Instance Fallback).
   - Phát trực tiếp luồng stream video/audio gốc không chứa bất kỳ đoạn mã quảng cáo hay tracker nào của YouTube.
   - Tích hợp **SponsorBlock**: Tự động nhận diện và tua qua các đoạn quảng cáo tài trợ do chính chủ kênh lồng ghép trong video.

2. **Thiết kế tối ưu cho màn hình cảm ứng VinFast VF5**:
   - **Dark Mode OLED**: Nền đen tuyền chống chói lóa khi lái xe ban đêm.
   - **Phím bấm kích thước lớn**: Cụm điều khiển Play/Pause (60px), tua lùi/tới 10s, chuyển bài to rõ, dễ thao tác 1 chạm khi dừng đèn đỏ.
   - **Tìm kiếm giọng nói tiếng Việt**: Bấm nút Micro và nói tên bài hát thay vì phải gõ bàn phím.
   - **Chế độ "Chỉ nghe nhạc" (Audio-Only Mode)**: Tắt video, hiển thị đĩa than xoay và hiệu ứng sóng nhạc, giúp tập trung lái xe và tiết kiệm hơn 80% dung lượng 4G/5G trên xe.
   - **Tương thích phím bấm vô lăng**: Tích hợp HTML5 `MediaSession API` giúp bạn có thể bấm nút Next/Previous/Play trên vô lăng xe VinFast VF5 để điều khiển.
   - **Tự động chuyển bài**: Tự động phát bài tiếp theo trong danh sách hoặc video liên quan.

---

## 🚀 Hướng dẫn triển khai lên Cloudflare Pages (Miễn phí 100%)

### Cách 1: Deploy bằng 1 câu lệnh qua Wrangler CLI (Nhanh nhất)

1. Mở terminal tại thư mục `Carhub`:
   ```bash
   npm run build
   npx wrangler pages deploy dist --project-name carhub-vf5
   ```
2. Nếu là lần đầu chạy, Wrangler sẽ mở trình duyệt để bạn đăng nhập tài khoản Cloudflare (hoàn toàn miễn phí).
3. Sau khi chạy xong, bạn sẽ nhận được một đường link miễn phí dạng:
   👉 **`https://carhub-vf5.pages.dev`**

---

### Cách 2: Kết nối tự động qua GitHub

1. Đẩy mã nguồn thư mục này lên một repository GitHub cá nhân.
2. Đăng nhập vào [Cloudflare Dashboard](https://dash.cloudflare.com/) > chọn **Compute (Workers & Pages)** > **Create application** > chọn tab **Pages** > **Connect to Git**.
3. Chọn repository của bạn và cấu hình build:
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. Bấm **Save and Deploy**. Mỗi khi bạn cập nhật code trên GitHub, Cloudflare sẽ tự động cập nhật website ngay lập tức.

---

## 📱 Hướng dẫn cài đặt và sử dụng trên VinFast VF5 qua APTV

1. Mở ứng dụng **APTV** trên iPhone.
2. Thêm một link web mới hoặc chỉnh sửa trang chủ trong APTV:
   - Nhập URL Cloudflare Pages của bạn (ví dụ: `https://carhub-vf5.pages.dev`).
3. Cắm iPhone vào cổng USB của VinFast VF5 để kích hoạt **Apple CarPlay**.
4. Mở ứng dụng **APTV** trên màn hình trung tâm của VF5:
   - Trang web sẽ hiển thị toàn màn hình với giao diện CarHub.
   - Bấm vào các danh mục có sẵn như: *🔥 Nhạc Remix Lái Xe*, *🚗 Đường Dài Thư Giãn*, *☕ Lofi Thư Giãn*, *📻 Bolero Bất Hủ*, *⚡ Vinahouse*, *👶 Thiếu Nhi*.
   - Hoặc bấm vào biểu tượng Micro để tìm kiếm bằng giọng nói tiếng Việt.
