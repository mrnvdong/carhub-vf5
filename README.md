# 🚗 CarHub VF5 - Trình xem YouTube cho ô tô (VinFast VF5 & Apple CarPlay APTV)

Website nghe nhạc & xem video YouTube tối ưu chuyên biệt cho màn hình ô tô (VinFast VF5) chạy qua ứng dụng **APTV** trên Apple CarPlay.

---

## 🌟 Cơ chế hoạt động & Tính năng

1. **Cơ chế phát & Chặn quảng cáo (Tách bạch theo nguồn phát)**:
   * **Luồng trực tiếp (Direct MP4 / HLS)**:
     - Tự động bóc tách luồng phát sạch từ YouTube (InnerTube ANDROID_VR & Piped API clusters).
     - **Không có quảng cáo video YouTube**: Do chỉ lấy file stream thô và phát qua trình phát chuẩn HTML5.
     - **Tích hợp SponsorBlock**: Tự động nhận diện và tua nhanh qua các đoạn quảng cáo tài trợ do chính YouTuber lồng ghép trong video.
     - Hỗ trợ đầy đủ cụm phím điều khiển to, tua 10s, thanh scrub và MediaSession API.
   * **Nguồn dự phòng YouTube Embed**:
     - Kích hoạt khi video bị YouTube khóa bản quyền chặt hoặc yêu cầu đăng nhập tài khoản.
     - *Lưu ý*: Với nguồn nhúng Embed, quảng cáo và giao diện hiển thị do YouTube kiểm soát; các nút điều khiển tùy biến (tua 10s, MediaSession vô lăng, chế độ chỉ nghe nhạc) sẽ tự động ẩn/khóa để tránh gây nhầm lẫn cho người lái.

2. **Thiết kế tối ưu cho màn hình cảm ứng VinFast VF5**:
   * **Hai phiên bản giao diện linh hoạt (Chuyển đổi 1-chạm)**:
     - 🎵 **Giao diện YouTube Music**: Chuyên biệt cho nghe nhạc khi lái xe với nền đen sâu OLED (`#030303`), hiệu ứng Ambient Glow phát sáng theo ảnh bìa album, ảnh bìa vuông sắc nét, nút chuyển đổi nhanh giữa `[Bài hát]` và `[Video]`, nút Play/Pause trắng khổng lồ chuẩn YouTube Music, và hàng đợi phát (Up Next) có sóng nhạc equalizer động.
     - 🎬 **Giao diện CarHub Video (Classic)**: Chuyên biệt để xem video ca nhạc, MV với khung hình lớn và cụm điều khiển đầy đủ.
     - Chuyển đổi qua lại ngay trên thanh Header mà **không làm ngắt bài nhạc đang phát**.
   * **Tương thích toàn diện phím cứng & phím vô lăng VinFast VF5**:
     - **Apple CarPlay qua APTV**: Duy trì Audio Session liên tục qua `navigator.mediaSession` (không unmount khi đổi bài), hỗ trợ đầy đủ lệnh Play, Pause, Next bài, Prev bài, Tua 10s từ phím bấm vô lăng xe VF5.
     - **Android Box / Màn Android**: Bắt trọn vẹn các sự kiện bàn phím phần cứng (`MediaTrackNext`, `MediaTrackPrevious`, `MediaPlayPause`, phím mũi tên, phím Space).
     - **Khởi động nhanh**: Nếu vừa lên xe chưa chọn bài, chỉ cần bấm phím Next hoặc Play trên vô lăng là xe tự động phát ngay bài đầu tiên trong danh sách đề xuất.
   * **Cụm điều khiển cảm ứng lớn**: Nút Play/Pause (72-88px), tua lùi/tới 10s, chuyển bài to rõ, dễ thao tác 1 chạm khi dừng đèn đỏ.
   * **Tìm kiếm giọng nói tiếng Việt**: Bấm nút Micro và nói tên bài hát thay vì phải gõ bàn phím.
   * **Chế độ phát ngẫu nhiên (Shuffle) & Lặp lại (Repeat)**: Hỗ trợ phát ngẫu nhiên danh sách và lặp lại 1 bài hoặc toàn bộ danh sách.
   * **Chế độ "Chỉ nghe nhạc" (Audio-Only Mode)**: Tắt video, hiển thị album art/đĩa than giúp tập trung lái xe và tiết kiệm hơn 80% dung lượng 4G/eSIM của xe.
   * **Phân trang vô hạn (Infinite / Load More)**: Tải trước 35 - 40 bài, hỗ trợ nút "Tải thêm bài hát khác" để duyệt hàng trăm bài hát liên tục.

---

## 🚀 Hướng dẫn triển khai lên Cloudflare Pages

### Deploy bằng Wrangler CLI:
```bash
npm run build
npx wrangler pages deploy dist --project-name carhub-vf5
```

---

## 📱 Quy trình kiểm tra thực tế trên VinFast VF5 qua APTV (Apple CarPlay)

1. Mở ứng dụng **APTV** trên iPhone, nhập URL:
   👉 **`https://carhub-vf5.pages.dev`**
2. Cắm cáp kết nối iPhone với xe VinFast VF5 và chọn **Apple CarPlay** trên màn hình trung tâm.
3. **Quy trình kiểm tra 5 bước**:
   * **Bước 1 - Search**: Thử tìm kiếm bằng cả gõ phím và nói qua Micro ("Nhạc trẻ remix"). Xác nhận danh sách hiện ra >30 video và nút "Tải thêm" hoạt động.
   * **Bước 2 - Phát luồng**: Chạm vào 1 bài hát, kiểm tra badge góc dưới hiển thị `Direct Stream` hoặc `HLS Stream`. Xác nhận video phát mượt, không có quảng cáo đầu clip.
   * **Bước 3 - Tua & SponsorBlock**: Bấm nút tua `+10s` / `-10s` trên màn hình xem video có phản hồi tức thì không.
   * **Bước 4 - Chế độ "Chỉ nghe nhạc"**: Bấm nút tai nghe màu xanh lá. Màn hình phải chuyển sang đĩa than xoay, âm thanh tiếp tục phát bình thường. Nếu bài nào không có audio stream, nút này sẽ tự khóa để tránh phát lỗi.
   * **Bước 5 - Phím vô lăng**: Bấm nút chuyển bài Next/Prev trên vô lăng VinFast VF5 để kiểm tra bài hát có chuyển mượt mà không.
