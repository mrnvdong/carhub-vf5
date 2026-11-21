# 🚗 CarHub VF5 — Trung Tâm Giải Trí, Bản Đồ 3D Cockpit & Điều Khiển Từ Xa Cho Màn Hình Ô Tô

**CarHub VF5** là ứng dụng web chuẩn màn hình ô tô (CarPlay qua **APTV / asCar**, màn hình Android Box, hoặc **màn hình zin không cảm ứng**) tích hợp **Bản đồ 3D dẫn đường & cảnh báo giao thông Việt Nam**, **Nhạc YouTube & SoundCloud**, **Truyền hình trực tiếp**, **Kho Phim**, **Báo Nói**, **Tiện ích xe điện (EV)** và **Điều khiển từ xa qua điện thoại chuẩn WebRTC P2P (`0ms`)**.

🌐 **Bản chạy trực tiếp (Production)**: **[https://carhub-vf5.pages.dev](https://carhub-vf5.pages.dev)**  
📱 **Bản cho màn hình KHÔNG cảm ứng**: **[https://carhub-vf5.pages.dev/?notouch=1](https://carhub-vf5.pages.dev/?notouch=1)**

---

## 📑 Mục lục

1. [Điểm nổi bật & Hệ sinh thái tính năng](#-1-điểm-nổi-bật--hệ-sinh-thái-tính-năng)
2. [Hướng dẫn sử dụng trên xe có cảm ứng (CarPlay / Android)](#-2-hướng-dẫn-sử-dụng-trên-xe-có-cảm-ứng)
3. [Phiên bản cho màn hình KHÔNG cảm ứng (`/?notouch=1`)](#-3-phiên-bản-cho-màn-hình-không-cảm-ứng)
4. [Điều khiển từ xa qua QR (Co-Pilot Remote) & Bảo mật 4 lớp](#-4-điều-khiển-từ-xa-qua-qr--bảo-mật-4-lớp)
5. [Đồng bộ mây cá nhân (Sync Code) & Send-to-Car](#-5-đồng-bộ-mây-cá-nhân--send-to-car)
6. [Kiến trúc tối ưu gói Free `$0/tháng` & Sức chứa thực tế](#-6-kiến-trúc-tối-ưu-gói-free-0tháng--sức-chứa-thực-tế)
7. [Cấu trúc dự án & API Endpoints](#-7-cấu-trúc-dự-án--api-endpoints)
8. [Hướng dẫn tự cài đặt & Deploy lên Cloudflare Pages](#-8-hướng-dẫn-tự-cài-đặt--deploy-lên-cloudflare-pages)

---

## 🌟 1. Điểm nổi bật & Hệ sinh thái tính năng

### 🗺️ 1.1. Bản đồ 3D Cockpit HUD & Cảnh báo giao thông Việt Nam (100% miễn phí, không cần API Key)
- **4 giao diện bản đồ chuyên dụng cho ô tô**: **3D Sáng**, **3D Đêm** (tự tối ưu tương phản ban đêm chống chói mắt), **OSM Chuẩn**, và **Vệ tinh**, đi kèm chế độ **Sáng / Tối / Tự động theo giờ** cho toàn giao diện.
- **Đồng hồ tốc độ GPS (`km/h`) + Biển báo giới hạn tốc độ P.127** theo thời gian thực (`/api/road`), tự hiển thị tên đường, số làn, đường một chiều và cảnh báo khi chạy vượt ngưỡng tốc độ.
- **Cảnh báo Camera phạt nguội, Biển P.130 (Cấm dừng & đỗ), P.131a (Cấm đỗ) chạy 100% CỤC BỘ (`0ms`)**:
  - Tích hợp sẵn cơ sở dữ liệu điểm camera phạt nguội & tuyến phố cấm dừng/đỗ lớn tại Việt Nam ngay trên trình duyệt — **hoạt động tức thì ngay cả khi vào hầm hoặc mất sóng 4G**, không tốn request server.
  - **Không làm ngắt nhạc khó chịu**: Mặc định cảnh báo bằng **biển báo trực quan nổi bật trên bản đồ** (không đọc giọng nói cắt ngang nhạc). Nếu tài xế muốn nghe nhắc bằng giọng nói tiếng Việt, có nút bật/tắt nhanh trong giao diện, đồng thời hệ thống tự động phát tiếp nhạc/TV sau khi đọc xong.
- **Dẫn đường từng ngã rẽ tiếng Việt (`/api/route`)**:
  - Tự tính chính xác quãng đường & thời gian còn lại, tự dẫn đường lại (**Auto-Reroute**) khi đi lệch lộ trình > 75m, và nhắc trước ngã rẽ `180m` & `45m`.
  - Hỗ trợ tìm địa điểm **tiếng Việt không dấu** (`ho guom`, `vincom`, `san bay`), tìm nhanh 1 chạm **⚡ Trạm sạc VinFast**, **🅿️ Bãi đỗ xe**, **☕ Cà phê**, **🏬 TTTM**, cùng ghim **🏠 Nhà riêng / 🏢 Cơ quan / ⭐ Điểm quen**.
  - **Mini Speed & Turn Pill**: Khi chuyển sang nghe nhạc, xem TV hay đọc báo, bản đồ vẫn duy trì lộ trình ngầm và hiện thanh nhỏ báo tốc độ + ngã rẽ kế tiếp.
- **Chế độ HUD hắt kính lái**: Phóng to tốc độ GPS, biển giới hạn, ngã rẽ tiếp theo và hỗ trợ lật gương ngang để đặt lên taplo chiếu lên kính lái ban đêm.

### 🎵 1.2. Trình nghe nhạc YouTube & SoundCloud chuẩn ô tô
- **Chuyển bài `0ms` mượt mà**: Giữ duy nhất 1 phiên phát YouTube IFrame và chuyển bài qua `loadVideoById`, tự bỏ qua video bị khóa nhúng, hỗ trợ phím cứng **vô lăng** (`Next`, `Prev`, `Play/Pause`).
- **Tích hợp song song SoundCloud**: Hỗ trợ tìm kiếm & phát nhạc SoundCloud chất lượng cao trực tiếp không cần cài app ngoài.
- **SponsorBlock Auto-Skip**: Tự động bỏ qua đoạn thoại kịch đầu MV (`music_offtopic`), `intro`, `outro` và quảng cáo tài trợ.
- **Karaoke & Đài phát vô tận (`⚡ Mix`)**: Tự tải lời bài hát đồng bộ (LRCLIB + YouTube TimedText), tạo đài phát liên tục theo gu nhạc, hỗ trợ **Cử chỉ vuốt mù** (vuốt ngang đổi bài, chạm đúp thả tim).
- **Bộ cân bằng âm thanh 5 băng tần (EQ)** & Quản lý nhiều **Playlist cá nhân** (*Đi Cao Tốc*, *Bolero Chọn Lọc*, *Nhạc Cho Bé*...).

### 📺 1.3. Truyền hình Trực Tiếp (TV Live — Cơ chế Direct-First ổn định như VLC)
- Tự nạp danh sách kênh truyền hình Việt Nam (VTV, HTV, Vĩnh Long, địa phương, thể thao, giải trí...) kèm bộ nhớ đệm 30 phút.
- **Cơ chế phát Direct-First**: Ưu tiên phát trực tiếp luồng HLS/DASH/m3u8 từ trình duyệt (tương tự VLC, bỏ qua trung gian không cần thiết để giảm độ trễ & tránh nghẽn CDN), chỉ fallback sang proxy an toàn khi gặp kênh chặn CORS.
- Hỗ trợ chuyển kênh nhanh (`Lên / Xuống`), ghim kênh yêu thích và chọn kênh bằng giọng nói hoặc từ điện thoại.

### 🎬 1.4. Kho Phim HD & 📰 Báo Nói Tiếng Việt
- **Kho Phim trực tuyến**: Tìm kiếm và xem phim bộ / phim lẻ (hỗ trợ ưu tiên bản **Thuyết minh / Lồng tiếng** khi đi đường), tự động lưu **Lịch sử xem & Phim yêu thích**, kèm tùy chọn **Khóa video khi xe đang chạy** để đảm bảo an toàn lái xe.
- **Báo Nói (News Audio)**: Cập nhật tin tức nóng theo chuyên mục (*Tin Nóng*, *Thời Sự*, *Kinh Tế*, *Xe & Công Nghệ*, *Thể Thao*...) và đọc to thành tiếng bằng giọng đọc tiếng Việt rõ ràng để nghe rảnh tay khi lái xe.

### ⚡ 1.5. Bộ công cụ Xe Điện (VF5 Tools)
- **Tính toán pin & quãng đường dự kiến (EV SOC Estimator)**: Nhập `% pin hiện tại` & hiệu suất (`km/%`) để tự tính `% pin còn lại khi đến đích` dựa trên lộ trình dẫn đường đang chạy, kèm nút tìm **Trạm sạc VinFast** gần nhất.
- **Đồng hồ hành trình (Trip Computer)**: Theo dõi quãng đường đã đi, thời gian lái, vận tốc trung bình/tối đa và **nhắc nghỉ ngơi** nếu lái liên tục trên 120 phút.
- **Ghim điểm cảnh báo cộng đồng cá nhân (Custom Hazards)**: Tự đánh dấu nhanh ổ gà, chốt bắn tốc độ, ngập nước hay camera mới trên đường quen.

### 🎛️ 1.6. Giao diện nổi tinh gọn & Trợ lý giọng nói
- **Thanh nổi ẩn gọn gàng bên phải**: Thu gọn thành cụm nổi 4 nút **`Cockpit • Tìm • Menu • QR`** giúp mở tìm kiếm/giọng nói tức thì mà không che khuất bản đồ hay nội dung đang xem, hỗ trợ di chuyển vị trí thanh nổi (*Phải / Trên / Dưới*) và chỉnh 4 cỡ chữ.
- **Trợ lý giọng nói tiếng Việt**: Hỗ trợ ra lệnh mở nhạc, mở kênh TV, mở phim, bật báo nói, tìm điểm đến dẫn đường rảnh tay.

---

## 🚘 2. Hướng dẫn sử dụng trên xe có cảm ứng

1. **Mở trên màn hình xe**:
   - Trên **VinFast VF5 / Apple CarPlay (APTV, asCar)** hoặc **Android Box**: mở trình duyệt và truy cập **`https://carhub-vf5.pages.dev`**.
   - Nếu muốn tải sẵn Playlist & địa chỉ Nhà/Cơ quan của bạn, thêm mã đồng bộ vào link (ví dụ: `https://carhub-vf5.pages.dev/?sync=6868`).
2. **Thao tác bằng thanh nổi 4 nút (mặc định bên phải màn hình)**:
   - **`Cockpit`**: Quay nhanh về màn hình Bản đồ 3D + Đồng hồ tốc độ + Điều khiển nhạc mini.
   - **`Tìm`**: Mở ngay hộp Tìm kiếm nhạc/video (YouTube, SoundCloud) & Trợ lý giọng nói chỉ với 1 chạm.
   - **`Menu`**: Mở bảng chọn nhanh tất cả tính năng (*Nghe nhạc*, *Video YT*, *TV Live*, *Phim*, *Báo Nói*, *Khám phá*, *Playlist*, *Lịch sử*, *Công cụ VF5/EV/EQ*, *HUD*, *Sáng/Tối*, *Cỡ chữ*, *Vị trí thanh nổi*, *Chế độ Không cảm ứng*).
   - **`QR`**: Hiện mã QR + mã PIN 4 số phiên tạm thời để người ngồi ghế phụ hoặc hàng ghế sau quét chọn nhạc/gửi điểm đến.
3. **Bật/tắt âm thanh cảnh báo giao thông**:
   - Mặc định biển báo **Camera phạt nguội / P.130 / P.131a** chỉ hiện trực quan để không cắt ngang nhạc.
   - Khi muốn nghe đọc giọng nói cảnh báo, bấm biểu tượng loa trên màn hình Cockpit hoặc trong `Menu`.

---

## 🕹️ 3. Phiên bản cho màn hình KHÔNG cảm ứng

Dành riêng cho các dòng xe có màn hình trung tâm **không hỗ trợ cảm ứng** (Mazda, BMW, Mercedes, Audi, hoặc màn hình HDMI/Android Box không chạm), cho phép **điều khiển 100% mọi tính năng của màn xe bằng điện thoại với độ trễ `< 15ms`**.

### Cách kích hoạt
- **Cách 1 (Khuyên dùng — 0 lần chạm trên xe)**: Lưu trang chủ trình duyệt trên màn xe thành:
  ```
  https://carhub-vf5.pages.dev/?notouch=1
  ```
- **Cách 2**: Vào `Menu` → bật công tắc **"Màn không cảm ứng (Remote toàn phần)"** (hoặc sao chép nhanh link `/?notouch=1` trong tab **QR**).

### Cách ghép nối & sử dụng
1. Khi màn xe mở ở chế độ không cảm ứng, màn hình sẽ **tự động hiện khung QR tạm thời + Mã PIN 4 số cỡ lớn** (không cần bấm nút nào trên xe).
2. Lấy điện thoại của chủ xe quét mã QR → nhập đúng **4 số PIN** trên màn xe.
3. **Chủ xe lên quyền & tự khóa máy lạ**:
   - Điện thoại đầu tiên nhập đúng PIN sẽ tự động được cấp quyền **Chủ xe (`owner`)** và **hệ thống tự khóa cổng ghép nối (`ownerJoinLocked = true`)** — chặn đứng người lạ ở ngoài kể cả khi họ nhìn thấy mã QR và PIN.
   - Khung QR trên màn hình xe lập tức **tự ẩn gọn** thành nhãn nhỏ `⚡ P2P 0ms` để trả lại toàn bộ không gian hiển thị.
   - Nếu muốn cho thêm điện thoại người nhà trong xe cùng điều khiển, chủ xe chỉ cần bấm nút **Mở khóa ghép nối** ngay trên điện thoại của mình.
4. **Bàn điều khiển toàn phần (`🎮 Điều khiển`) trên điện thoại**:
   - **Chuyển đủ 8 màn hình**: `Cockpit`, `Nhạc`, `TV`, `Phim`, `Báo`, `Yêu thích`, `Playlist`, `Hàng đợi`.
   - **Điều khiển Media**: Phát/Dừng, Bài trước/sau, Tua nhanh/lùi `±15s`, Trộn bài, Lặp lại, Thả tim, Toàn màn hình.
   - **Điều khiển Bản đồ 3D**: Phóng to/Thu nhỏ (`+ / -`), Về vị trí xe, Khóa theo xe, Mở rộng toàn bản đồ, Bật/tắt lớp Camera phạt nguội, Bật/tắt giao thông, Hủy lộ trình.
   - **Điều khiển trang & hệ thống**: Cuộn trang Lên/Xuống, Chuyển kênh TV, Chuyển bài Báo nói, Chuyển Sáng/Tối, Bật/tắt HUD, Bật/tắt giọng nói cảnh báo, Đổi cỡ chữ, Đổi vị trí thanh nổi.
   - **Phản hồi 2 chiều trực tiếp**: Điện thoại hiển thị trạng thái màn hình xe đang mở, tên bài hát/kênh và tốc độ xe theo thời gian thực.
   - Ngoài ra, giao diện màn hình xe có sẵn **viền sáng `:focus-visible`** hỗ trợ tốt cho các xe có **núm xoay điều khiển** (Mazda Connect, BMW iDrive, Mercedes COMAND) hoặc bàn phím Bluetooth.

---

## 🛡️ 4. Điều khiển từ xa qua QR & Bảo mật 4 lớp

Khác với cách dùng chung mã cố định dễ bị người ngoài lưu link rồi phá xe từ xa, CarHub VF5 tách biệt hoàn toàn **Mã đồng bộ cá nhân** khỏi **Mã QR điều khiển tạm thời** với 4 lớp bảo vệ:

1. **Lớp 1 — Token phiên 144-bit tự hủy sau 3 giờ**: Mỗi chuyến đi tạo 1 mã ngẫu nhiên (`?copilot=...`) hoàn toàn không chứa Mã Xe, không làm lộ địa chỉ Nhà/Cơ quan hay Playlist cá nhân.
2. **Lớp 2 — Mã PIN 4 số chỉ hiển thị bên trong cabin**: Người có ảnh chụp mã QR nhưng không ngồi trong xe sẽ không có PIN (nhập sai quá 6 lần tự động khóa phiên).
3. **Lớp 3 — Tài xế duyệt máy 1 chạm (hoặc Khóa Chủ Xe trên bản No-Touch)**:
   - Trên màn có cảm ứng: Mỗi điện thoại quét QR vào danh sách chờ để tài xế bấm **Cho phép** hoặc **Đá & Chặn**.
   - Trên màn không cảm ứng: Tự khóa cổng ngay sau khi điện thoại chủ xe đầu tiên ghép nối thành công.
4. **Lớp 4 — Kiểm soát quyền & Chống spam**:
   - Nút **Khóa Remote** khẩn cấp, chế độ **Chỉ xếp hàng đợi (`Queue-Only`)** tránh hành khách nhảy bài đang nghe, nút **Đổi QR & Đá hết máy cũ**, nút **Tắt phiên** hủy vĩnh viễn (`HTTP 410`) và giới hạn tốc độ gửi lệnh chống spam.

---

## ☁️ 5. Đồng bộ mây cá nhân & Send-to-Car

- Vào `Menu` → **Đồng bộ mây**, nhập hoặc tạo **Mã Xe cá nhân** (4–12 ký tự, ví dụ `6868` hoặc tên riêng khó đoán).
- Dữ liệu đồng bộ 2 chiều qua Cloudflare KV:
  - Danh sách **Playlist nhạc**, **Bài hát yêu thích**, **Phim yêu thích**, **Lịch sử xem phim**.
  - Các điểm **Ghim bản đồ** (*Nhà riêng*, *Cơ quan*, *Điểm quen*) và **Cảnh báo cá nhân**.
- **Send-to-Car**: Bạn có thể mở CarHub trên điện thoại ở nhà (cùng mã đồng bộ), tìm sẵn địa chỉ cần đi và bấm **Gửi lên xe** → khi lên xe màn Cockpit tự nhận tọa độ, đọc tên điểm đến và dẫn đường ngay.

---

## ⚡ 6. Kiến trúc tối ưu gói Free `$0/tháng` & Sức chứa thực tế

CarHub VF5 được thiết kế để có thể chia sẻ công khai cho hàng trăm người dùng mỗi ngày **ngay trên gói miễn phí Cloudflare Pages Free + Workers KV Free (`$0/tháng`)** mà không cần thuê server hay dịch vụ trả phí:

| Hạng mục tối ưu | Cơ chế hoạt động | Hiệu quả tiết kiệm |
|---|---|---|
| **WebRTC DataChannel P2P (`<15ms`)** | Điện thoại và màn xe bắt tay qua Vanilla-ICE (SDP Offer nhúng ngay trong bước `join`), sau khi nối thành công mọi lệnh điều khiển & trạng thái chạy trực tiếp P2P (**0 Worker req, 0 KV write**). Tự động fallback sang HTTP nếu mạng 4G/NAT chặn UDP. | Chỉ **3 KV writes** cho toàn bộ chuyến đi 3 tiếng (giảm **88%** ghi KV, giảm **91%** polling) |
| **DB Camera & Biển cấm cục bộ** | Toàn bộ dữ liệu Camera phạt nguội & Biển P.130/P.131a Việt Nam chạy trực tiếp trên trình duyệt. | **-100%** lượt gọi `/api/road?mode=cameras`, chạy cả khi mất 4G |
| **Tiết lưu thông minh + Cache đa tầng** | Giãn nhịp gọi `/api/road` theo vận tốc + cache lưới 10 phút trên máy khách + **Cloudflare Edge Cache (`caches.default`)** cho `/api/road` (30p), `/api/news` (5p), `/api/movie` (5p–12h), `/api/tv` (30p). | Giảm **~78–85%** request server; tốc độ Edge HIT chỉ **70–98ms** |

### Sức chứa đo đạc thực tế trên Cloudflare Free (`$0/tháng`)
- **Lái xe chuẩn** *(Bản đồ 3D + Nhạc + TV Direct-First + Phim + Báo)*: **`400 – 550+` xe hoạt động/ngày (DAU)**.
- **Xe dùng QR Remote / Màn hình không cảm ứng**: **`250 – 330+` xe/ngày (DAU)** *(nhờ WebRTC P2P chỉ tốn 3 KV writes/chuyến)*.
- **Độ chịu tải đồng thời (Benchmark live)**: **0% lỗi** tại `50+` xe bắn yêu cầu dồn dập cùng lúc (đạt **497.5 req/s** ở Edge).
- Khi lượng người dùng cộng đồng vượt mốc trên, chỉ cần nâng lên **Cloudflare Workers Paid (`$5/tháng`)** là lập tức mở rộng gấp 10x–33x mà không cần sửa code.

---

## 🧩 7. Cấu trúc dự án & API Endpoints

```text
carhub-vf5/
├── src/
│   ├── components/         # CockpitView, CarCockpitMap, VideoPlayer, TvLiveView, MoviesView,
│   │                       # NewsAudioView, CoPilotRemoteView, NoTouchPairingOverlay, Vf5ToolsModal...
│   ├── hooks/              # useCockpitTelemetry, useRemoteHostSession, useTvLive, useCarHardwareControls...
│   ├── services/           # webrtcRemote, remoteSession, api, tv, movie, news, sync, audioEq, voiceAudio...
│   ├── data/               # vietnamCameras.ts (DB Camera & P.130/P.131a chạy cục bộ)
│   └── types/              # Định nghĩa kiểu TypeScript toàn hệ thống
├── functions/
│   ├── _lib/               # security.ts (chống XSS/SSRF/Origin), movieSources.ts, vietnamCameras.ts, youtubeSearch.ts
│   └── api/
│       ├── remote.ts       # Phiên QR 4 lớp, chế độ No-Touch Owner Lock, WebRTC SDP signaling
│       ├── sync.ts         # Đồng bộ Playlist / Ghim bản đồ / Send-to-Car (Cloudflare KV)
│       ├── road.ts         # Tốc độ tối đa P.127 & hạ tầng đường (OSM Overpass + Edge Cache 30p)
│       ├── route.ts        # Dẫn đường từng ngã rẽ tiếng Việt (OSRM)
│       ├── places.ts       # Tìm kiếm địa điểm không dấu & Trạm sạc EV
│       ├── search.ts       # Tìm kiếm nhạc/video YouTube
│       ├── mix.ts          # Đài phát vô tận (Radio Mix)
│       ├── lyrics.ts       # Lời bài hát đồng bộ (LRCLIB / YouTube TimedText)
│       ├── suggest.ts      # Gợi ý từ khóa tìm kiếm
│       ├── soundcloud.ts   # Tìm kiếm & phát luồng SoundCloud
│       ├── tv.ts           # Danh sách kênh TV & fallback proxy an toàn
│       ├── movie.ts        # Tổng hợp nguồn phim + Edge Cache
│       ├── news.ts         # Tin tức Báo Mới + Audio/TTS đọc báo + Edge Cache
│       └── health.ts       # Kiểm tra tình trạng hệ thống & KV binding
├── wrangler.toml           # Cấu hình Cloudflare Pages & KV Namespace (CARHUB_KV)
└── package.json
```

---

## 🛠️ 8. Hướng dẫn tự cài đặt & Deploy lên Cloudflare Pages

### Yêu cầu
- Node.js `>= 18`
- Tài khoản [Cloudflare](https://dash.cloudflare.com/) (gói Free `$0/tháng` là đủ chạy toàn bộ tính năng)

### 8.1. Chạy phát triển trên máy (Local)
```bash
git clone https://github.com/mrnvdong/carhub-vf5.git
cd carhub-vf5
npm install

# Chạy frontend Vite
npm run dev

# Hoặc build và chạy đầy đủ cả frontend + Cloudflare Pages Functions ở local
npm run build
npm run pages:dev
```

### 8.2. Triển khai bản riêng của bạn lên Cloudflare Pages
1. Tạo 1 KV Namespace tên `CARHUB_KV` trên Cloudflare:
   ```bash
   npx wrangler kv namespace create CARHUB_KV
   ```
2. Cập nhật `id` vừa tạo vào file `wrangler.toml`:
   ```toml
   [[kv_namespaces]]
   binding = "CARHUB_KV"
   id = "<YOUR_KV_NAMESPACE_ID>"
   ```
3. (Tùy chọn) Nếu dùng domain riêng, thêm domain của bạn vào danh sách cho phép trong `functions/_lib/security.ts`.
4. Build và deploy:
   ```bash
   npm run build
   npx wrangler pages deploy dist --project-name carhub-vf5 --branch main
   ```

---

## ⚠️ Lưu ý an toàn giao thông

> Hãy luôn ưu tiên quan sát đường và tuân thủ Luật Giao thông đường bộ. Nên bật **Khóa video khi xe chạy** trong *Công cụ VF5*, thiết lập sẵn điểm đến bằng **Send-to-Car** trước khi xuất phát hoặc để hành khách ghế phụ thao tác qua **QR Remote**. Các cảnh báo tốc độ, camera phạt nguội và biển P.130/P.131a mang tính chất hỗ trợ tham khảo — luôn quan sát biển báo thực tế trên đường.
