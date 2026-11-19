# 🚗 CarHub VF5 — Trình Nghe Nhạc, Video & Bản Đồ 3D Cockpit HUD trên Apple CarPlay (APTV & asCar)

Ứng dụng giải trí & trợ lý lái xe thông minh được thiết kế chuyên biệt cho **màn hình trung tâm 8 inch của VinFast VF5** khi kết nối **Apple CarPlay** qua **APTV** và **asCar** — triển khai trọn gói trên **Cloudflare Pages** (https://carhub-vf5.pages.dev).

---

## 🌟 Tính năng nổi bật cho VinFast VF5

1. **Bản đồ 3D WebGL Cockpit HUD & Dẫn đường thông minh (100% miễn phí, không cần API Key)**:
   - 4 lớp bản đồ tùy chọn: **3D Sáng**, **3D Đêm** (tự tối ưu độ tương phản chữ & khối nhà 3D chuẩn màn ô tô), **OSM Chuẩn**, và **Vệ tinh**, tự động đồng bộ phối màu hộp tìm kiếm & HUD theo chế độ Sáng/Đêm.
   - **Đồng hồ tốc độ GPS (`km/h`) + Biển báo giới hạn tốc độ P.127** theo thời gian thực (`/api/road`), cảnh báo Camera phạt nguội / Đường sắt / Trạm thu phí phía trước bằng **âm thanh bíp (đã mở khóa trên iOS CarPlay) + giọng nói tiếng Việt**.
   - **Dẫn đường từng ngã rẽ tiếng Việt** (`/api/route` qua FOSSGIS OSRM): tự tính đúng km & phút còn lại dọc theo tuyến, **tự dẫn đường lại (Auto-Reroute)** khi đi chệch > 75m, và **đọc chỉ đường bằng giọng nói tiếng Việt** trước ngã rẽ `180m` & `45m`.
   - **Tìm kiếm địa điểm thông minh** (`/api/places` kết hợp Photon + Nominatim + Overpass): hỗ trợ gõ **tiếng Việt không dấu** (`ho guom`, `vincom`, `san bay`), tìm nhanh 1 chạm **⚡ Trạm sạc VinFast**, **🅿️ Bãi đỗ xe**, **☕ Cà phê**, **🏬 TTTM**, cùng **Ghim Nhà riêng (`🏠`) / Cơ quan (`🏢`) / Điểm quen (`⭐`)**.
   - **Tùy biến bố cục 60fps**: đổi vị trí **Bản đồ Trái / Phải** và kéo thả thanh ngăn giữa 2 khung mượt mà, giữ sống lộ trình & hiển thị **Mini Speed & Turn Pill** khi chuyển sang tab khác.

2. **Send-to-Car & Đồng bộ Mã Xe 4 số (`VF5-XXXX`) qua Cloudflare KV**:
   - Quản lý nhiều Playlist riêng (*Đi Cao Tốc*, *Bolero Chọn Lọc*, *Nhạc Cho Bé*...) và điểm ghim bản đồ — đồng bộ 2 chiều sạch sẽ giữa điện thoại ở nhà và màn VF5 (`?sync=6868`).
   - **Send-to-Car**: Tìm điểm đến trên điện thoại rồi bấm **“Gửi xe”** $\rightarrow$ màn Cockpit trên VF5 tự nhận, phát chuông báo, đọc tên điểm đến và vẽ ngay lộ trình 3D mà không cần gõ phím trên CarPlay.

3. **Trình nghe nhạc & Video YouTube chuẩn CarPlay (`0ms` đổi bài)**:
   - Giữ duy nhất 1 phiên YouTube IFrame và đổi bài qua `loadVideoById`, tự động bỏ qua video khóa nhúng, hỗ trợ phím cứng **vô lăng VinFast VF5** (`Next`, `Prev`, `Play/Pause`).
   - **SponsorBlock Auto-Skip**: Tự nhảy qua đoạn kịch / thoại đầu MV (`music_offtopic`), `intro`, `outro` và quảng cáo tài trợ.
   - **Lời bài hát đồng bộ (Karaoke)** từ LRCLIB + YouTube TimedText, **Đài phát vô tận (`⚡ Mix`)**, **Cử chỉ Vuốt mù** (vuốt ngang chuyển bài, chạm đúp thả tim), và **Chế độ Dịu mắt Ban đêm (`🌙`)**.

---

## 🚀 Phát triển & Triển khai (Cloudflare Pages)

```bash
# Cài đặt & chạy môi trường dev
npm install
npm run dev

# Kiểm tra TypeScript & Build Production
npm run build

# Deploy lên Cloudflare Pages
npx wrangler pages deploy dist --project-name carhub-vf5 --branch main
```
