// Dữ liệu tham khảo các điểm Camera Phạt Nguội CSGT & Tuyến Cấm Dừng / Cấm Đỗ (P.130 / P.131a)
// trọng điểm tại Việt Nam (Hà Nội, TP.HCM, Đà Nẵng, Hải Phòng, Cần Thơ & các tuyến Cao tốc chính).
// Kết hợp cùng dữ liệu thời gian thực từ OpenStreetMap (/api/road) và Điểm Ghim Cá Nhân của tài xế!

export type TrafficPointKind =
  | 'camera_speed'
  | 'camera_redlight'
  | 'camera_lane'
  | 'no_stopping'
  | 'no_parking';

export interface VietnamTrafficPoint {
  id: string;
  kind: TrafficPointKind;
  name: string;
  road: string;
  lat: number;
  lon: number;
  speedLimit?: number;
  signCode?: 'P.130' | 'P.131a';
  hasCamera?: boolean;
  note?: string;
}

export const VIETNAM_TRAFFIC_POINTS: VietnamTrafficPoint[] = [
  // =========================================================================
  // HÀ NỘI — CAMERA PHẠT NGUỘI & TUYẾN CẤM DỪNG / CẤM ĐỖ (P.130 / P.131a)
  // =========================================================================
  {
    id: 'hn-cam-ngatuso',
    kind: 'camera_redlight',
    name: 'Camera Ngã Tư Sở',
    road: 'Nguyễn Trãi – Tây Sơn – Láng',
    lat: 21.0033,
    lon: 105.8203,
    hasCamera: true,
    note: 'Vượt đèn đỏ, sai làn, không tuân thủ vạch kẻ',
  },
  {
    id: 'hn-cam-giaiphong-daicoviet',
    kind: 'camera_redlight',
    name: 'Camera Giải Phóng – Đại Cồ Việt',
    road: 'Giải Phóng – Đại Cồ Việt',
    lat: 21.0074,
    lon: 105.8421,
    hasCamera: true,
    note: 'Phạt nguội vượt đèn đỏ & dừng đỗ sai quy định',
  },
  {
    id: 'hn-cam-giaiphong-kimdong',
    kind: 'camera_redlight',
    name: 'Camera Giải Phóng – Kim Đồng',
    road: 'Giải Phóng',
    lat: 20.9854,
    lon: 105.8415,
    hasCamera: true,
    note: 'Vượt đèn đỏ, lấn làn BRT/ô tô',
  },
  {
    id: 'hn-cam-phohue-hangbai',
    kind: 'camera_redlight',
    name: 'Camera Phố Huế – Trần Khát Chân',
    road: 'Phố Huế – Bạch Mai',
    lat: 21.0082,
    lon: 105.8515,
    hasCamera: true,
    note: 'Vượt đèn đỏ, sai làn, cấm dừng đỗ',
  },
  {
    id: 'hn-p130-hangbai',
    kind: 'no_stopping',
    name: 'Cấm dừng & đỗ Hàng Bài – Tràng Tiền',
    road: 'Hàng Bài – Đinh Tiên Hoàng',
    lat: 21.0246,
    lon: 105.853,
    signCode: 'P.130',
    hasCamera: true,
    note: 'Biển P.130 + Camera phạt nguội quận Hoàn Kiếm',
  },
  {
    id: 'hn-p130-tranhungdao',
    kind: 'no_stopping',
    name: 'Cấm dừng & đỗ Trần Hưng Đạo – Quán Sứ',
    road: 'Trần Hưng Đạo',
    lat: 21.0221,
    lon: 105.8468,
    signCode: 'P.130',
    hasCamera: true,
    note: 'Khu vực Bệnh viện & Cơ quan — P.130 phạt nguội',
  },
  {
    id: 'hn-p130-phohue',
    kind: 'no_stopping',
    name: 'Cấm dừng & đỗ Phố Huế (tuyến 1 chiều)',
    road: 'Phố Huế',
    lat: 21.0156,
    lon: 105.8519,
    signCode: 'P.130',
    hasCamera: true,
    note: 'Tuyến văn minh đô thị cấm dừng đỗ P.130',
  },
  {
    id: 'hn-p130-kimma',
    kind: 'no_stopping',
    name: 'Cấm dừng & đỗ Kim Mã – Liễu Giai',
    road: 'Kim Mã',
    lat: 21.0314,
    lon: 105.8145,
    signCode: 'P.130',
    hasCamera: true,
    note: 'Biển P.130 + Camera ngã tư Kim Mã – Liễu Giai',
  },
  {
    id: 'hn-cam-tranphu-dienbienphu',
    kind: 'camera_redlight',
    name: 'Camera Trần Phú – Điện Biên Phủ',
    road: 'Điện Biên Phủ – Trần Phú',
    lat: 21.0309,
    lon: 105.8407,
    hasCamera: true,
    note: 'Vượt đèn đỏ & dừng đỗ sai quy định Ba Đình',
  },
  {
    id: 'hn-cam-langha-thaiha',
    kind: 'camera_redlight',
    name: 'Camera Láng Hạ – Thái Hà',
    road: 'Láng Hạ',
    lat: 21.0145,
    lon: 105.8172,
    hasCamera: true,
    note: 'Camera phạt nguội làn BRT & vượt đèn đỏ',
  },
  {
    id: 'hn-cam-levanluong-kdt',
    kind: 'camera_lane',
    name: 'Camera Làn BRT Lê Văn Lương – Khuất Duy Tiến',
    road: 'Lê Văn Lương – Tố Hữu',
    lat: 21.0029,
    lon: 105.7995,
    hasCamera: true,
    note: 'Phạt nguội đi vào làn BRT & vượt đèn đỏ',
  },
  {
    id: 'hn-cam-khuatduytien-nt',
    kind: 'camera_redlight',
    name: 'Camera Nguyễn Trãi – Khuất Duy Tiến',
    road: 'Nguyễn Trãi – Vành đai 3',
    lat: 20.9927,
    lon: 105.8027,
    hasCamera: true,
    note: 'Vượt đèn đỏ, đi sai làn nút giao 4 tầng',
  },
  {
    id: 'hn-cam-vd3-trencao',
    kind: 'camera_lane',
    name: 'Camera Vành Đai 3 Trên Cao (làn khẩn cấp)',
    road: 'Vành đai 3 trên cao',
    lat: 20.9968,
    lon: 105.7955,
    speedLimit: 80,
    hasCamera: true,
    note: 'Phạt nguội đi vào làn dừng khẩn cấp & tốc độ 80 km/h',
  },
  {
    id: 'hn-cam-vd3-linhdam',
    kind: 'camera_speed',
    name: 'Camera Vành Đai 3 – Linh Đàm',
    road: 'Vành đai 3 trên cao',
    lat: 20.9685,
    lon: 105.8295,
    speedLimit: 80,
    hasCamera: true,
    note: 'Camera tốc độ 80 km/h & làn dừng khẩn cấp',
  },
  {
    id: 'hn-cam-xuanthuy-cg',
    kind: 'camera_redlight',
    name: 'Camera Xuân Thủy – Phạm Hùng (Mai Dịch)',
    road: 'Xuân Thủy – Hồ Tùng Mậu',
    lat: 21.0369,
    lon: 105.7815,
    hasCamera: true,
    note: 'Phạt nguội vượt đèn đỏ & dừng đón khách',
  },
  {
    id: 'hn-cam-pvd-hqv',
    kind: 'camera_redlight',
    name: 'Camera Phạm Văn Đồng – Hoàng Quốc Việt',
    road: 'Phạm Văn Đồng',
    lat: 21.0466,
    lon: 105.7848,
    hasCamera: true,
    note: 'Vượt đèn đỏ, sai làn & tốc độ trên cầu cạn',
  },
  {
    id: 'hn-cam-vochicong',
    kind: 'camera_speed',
    name: 'Camera Tốc Độ Võ Chí Công – Cầu Nhật Tân',
    road: 'Võ Chí Công',
    lat: 21.0765,
    lon: 105.8065,
    speedLimit: 80,
    hasCamera: true,
    note: 'Camera bắn tốc độ tự động 80 km/h & sai làn',
  },
  {
    id: 'hn-cam-vonguyengiap',
    kind: 'camera_speed',
    name: 'Camera Tốc Độ Võ Nguyên Giáp (Đi Nội Bài)',
    road: 'Võ Nguyên Giáp',
    lat: 21.1518,
    lon: 105.8215,
    speedLimit: 90,
    hasCamera: true,
    note: 'Camera tốc độ 90 km/h & cấm dừng đỗ P.130',
  },
  {
    id: 'hn-p130-noibai',
    kind: 'no_stopping',
    name: 'Cấm dừng đỗ sảnh Sân bay Nội Bài (P.130)',
    road: 'Sân bay Nội Bài T1/T2',
    lat: 21.2187,
    lon: 105.8042,
    signCode: 'P.130',
    hasCamera: true,
    note: 'Camera tự động phạt dừng đỗ quá 3 phút / sai vạch',
  },
  {
    id: 'hn-cam-dlthanglong',
    kind: 'camera_speed',
    name: 'Camera Đại Lộ Thăng Long (Km 6)',
    road: 'Đại lộ Thăng Long',
    lat: 21.0068,
    lon: 105.7495,
    speedLimit: 100,
    hasCamera: true,
    note: 'Camera tốc độ 100 km/h & làn dừng khẩn cấp',
  },
  {
    id: 'hn-cam-nguyenvancu',
    kind: 'camera_redlight',
    name: 'Camera Nguyễn Văn Cừ – Cầu Chương Dương',
    road: 'Nguyễn Văn Cừ',
    lat: 21.0419,
    lon: 105.8698,
    hasCamera: true,
    note: 'Vượt đèn đỏ, lấn làn ô tô/xe máy đầu cầu',
  },
  {
    id: 'hn-p130-tranduyhung',
    kind: 'no_stopping',
    name: 'Cấm dừng & đỗ Trần Duy Hưng',
    road: 'Trần Duy Hưng',
    lat: 21.0091,
    lon: 105.7985,
    signCode: 'P.130',
    hasCamera: true,
    note: 'Biển P.130 dọc tuyến + Camera nút Hoàng Minh Giám',
  },
  {
    id: 'hn-p131-giangvo',
    kind: 'no_parking',
    name: 'Cấm đỗ xe Giảng Võ – Cát Linh (P.131a)',
    road: 'Giảng Võ',
    lat: 21.0268,
    lon: 105.8256,
    signCode: 'P.131a',
    hasCamera: true,
    note: 'Biển P.131a cấm đỗ xe trục BRT Giảng Võ',
  },
  {
    id: 'hn-p130-leduan',
    kind: 'no_stopping',
    name: 'Cấm dừng & đỗ Lê Duẩn – Ga Hà Nội',
    road: 'Lê Duẩn',
    lat: 21.0241,
    lon: 105.8414,
    signCode: 'P.130',
    hasCamera: true,
    note: 'Biển P.130 khu vực Ga Hà Nội',
  },
  {
    id: 'hn-cam-ocp-vd2',
    kind: 'camera_speed',
    name: 'Camera Vành Đai 2 Trên Cao (Minh Khai – Ngã Tư Vọng)',
    road: 'Vành đai 2 trên cao',
    lat: 20.9963,
    lon: 105.8515,
    speedLimit: 80,
    hasCamera: true,
    note: 'Camera tốc độ 80 km/h & cấm dừng đỗ tuyệt đối',
  },

  // =========================================================================
  // TP. HỒ CHÍ MINH — CAMERA PHẠT NGUỘI & CẤM DỪNG / CẤM ĐỖ (P.130 / P.131a)
  // =========================================================================
  {
    id: 'hcm-cam-thuthiem',
    kind: 'camera_speed',
    name: 'Camera Hầm Thủ Thiêm – Mai Chí Thọ',
    road: 'Hầm Sông Sài Gòn – Võ Văn Kiệt',
    lat: 10.7712,
    lon: 106.7115,
    speedLimit: 60,
    hasCamera: true,
    note: 'Camera tốc độ 60 km/h, giữ khoảng cách & cấm chuyển làn trong hầm',
  },
  {
    id: 'hcm-cam-vovankiet',
    kind: 'camera_speed',
    name: 'Camera Võ Văn Kiệt (Cầu Calmette – Nguyễn Tri Phương)',
    road: 'Đại lộ Võ Văn Kiệt',
    lat: 10.7574,
    lon: 106.6788,
    speedLimit: 60,
    hasCamera: true,
    note: 'Camera bắn tốc độ 60 km/h & sai làn ô tô',
  },
  {
    id: 'hcm-cam-xlhn-thuduc',
    kind: 'camera_redlight',
    name: 'Camera Ngã Tư Thủ Đức – Xa Lộ Hà Nội',
    road: 'Võ Nguyên Giáp (XLHN)',
    lat: 10.8484,
    lon: 106.7745,
    hasCamera: true,
    note: 'Phạt nguội vượt đèn đỏ & lấn làn',
  },
  {
    id: 'hcm-cam-hangxanh',
    kind: 'camera_redlight',
    name: 'Camera Điện Biên Phủ – Ngã Tư Hàng Xanh',
    road: 'Điện Biên Phủ – Xô Viết Nghệ Tĩnh',
    lat: 10.8012,
    lon: 106.7113,
    hasCamera: true,
    note: 'Vượt đèn đỏ, lấn làn & dừng đỗ sai quy định',
  },
  {
    id: 'hcm-cam-pvd-binhloi',
    kind: 'camera_speed',
    name: 'Camera Phạm Văn Đồng – Cầu Bình Lợi',
    road: 'Phạm Văn Đồng',
    lat: 10.8245,
    lon: 106.7098,
    speedLimit: 60,
    hasCamera: true,
    note: 'Camera bắn tốc độ & sai làn ô tô',
  },
  {
    id: 'hcm-cam-nvl',
    kind: 'camera_speed',
    name: 'Camera Nguyễn Văn Linh – Nguyễn Hữu Thọ',
    road: 'Nguyễn Văn Linh',
    lat: 10.7295,
    lon: 106.7016,
    speedLimit: 60,
    hasCamera: true,
    note: 'Camera tốc độ & vượt đèn đỏ quận 7',
  },
  {
    id: 'hcm-p130-leloi',
    kind: 'no_stopping',
    name: 'Cấm dừng & đỗ Lê Lợi – Đồng Khởi (Q.1)',
    road: 'Lê Lợi – Đồng Khởi',
    lat: 10.7746,
    lon: 106.7019,
    signCode: 'P.130',
    hasCamera: true,
    note: 'Camera phạt nguội cấm dừng đỗ P.130 trung tâm Q.1',
  },
  {
    id: 'hcm-p130-pasteur',
    kind: 'no_stopping',
    name: 'Cấm dừng & đỗ Pasteur – Lý Tự Trọng',
    road: 'Pasteur',
    lat: 10.7782,
    lon: 106.6996,
    signCode: 'P.130',
    hasCamera: true,
    note: 'Biển P.130 + Camera phạt nguội cố định',
  },
  {
    id: 'hcm-p130-nkkn',
    kind: 'no_stopping',
    name: 'Cấm dừng & đỗ Nam Kỳ Khởi Nghĩa',
    road: 'Nam Kỳ Khởi Nghĩa',
    lat: 10.7862,
    lon: 106.6881,
    signCode: 'P.130',
    hasCamera: true,
    note: 'Trục sân bay Tân Sơn Nhất — P.130 có camera phạt nguội',
  },
  {
    id: 'hcm-p130-tsn',
    kind: 'no_stopping',
    name: 'Cấm dừng & đỗ Trường Sơn – Sân bay Tân Sơn Nhất',
    road: 'Trường Sơn',
    lat: 10.8139,
    lon: 106.6642,
    signCode: 'P.130',
    hasCamera: true,
    note: 'Camera tự động phạt dừng đỗ sai vạch khu vực sân bay',
  },
  {
    id: 'hcm-p131-conghoa',
    kind: 'no_parking',
    name: 'Cấm đỗ xe Cộng Hòa – Hoàng Hoa Thám (P.131a)',
    road: 'Cộng Hòa',
    lat: 10.8022,
    lon: 106.6476,
    signCode: 'P.131a',
    hasCamera: true,
    note: 'Biển P.131a + Camera phạt nguội quận Tân Bình',
  },
  {
    id: 'hcm-p130-dbp-q3',
    kind: 'no_stopping',
    name: 'Cấm dừng & đỗ Điện Biên Phủ – CMT8 (Q.3)',
    road: 'Điện Biên Phủ',
    lat: 10.7786,
    lon: 106.6852,
    signCode: 'P.130',
    hasCamera: true,
    note: 'Camera phạt nguội dừng đỗ & vượt đèn đỏ',
  },

  // =========================================================================
  // ĐÀ NẴNG, HẢI PHÒNG, CẦN THƠ & CÁC TUYẾN CAO TỐC TRỌNG ĐIỂM
  // =========================================================================
  {
    id: 'dn-cam-caurong',
    kind: 'camera_redlight',
    name: 'Camera Cầu Rồng – Nguyễn Văn Linh',
    road: 'Nguyễn Văn Linh – Bạch Đằng',
    lat: 16.0611,
    lon: 108.2248,
    hasCamera: true,
    note: 'Camera phạt nguội vượt đèn đỏ & cấm dừng đỗ P.130',
  },
  {
    id: 'dn-p130-bachdang',
    kind: 'no_stopping',
    name: 'Cấm dừng & đỗ Bạch Đằng – Trần Phú (Đà Nẵng)',
    road: 'Bạch Đằng',
    lat: 16.0694,
    lon: 108.2245,
    signCode: 'P.130',
    hasCamera: true,
    note: 'Tuyến trung tâm sông Hàn cấm dừng đỗ P.130',
  },
  {
    id: 'hp-cam-lach-tray',
    kind: 'camera_redlight',
    name: 'Camera Lạch Tray – Nguyễn Bỉnh Khiêm (Hải Phòng)',
    road: 'Lạch Tray',
    lat: 20.8407,
    lon: 106.6938,
    hasCamera: true,
    note: 'Hệ thống camera phạt nguội TP Hải Phòng',
  },
  {
    id: 'ct-cam-30thang4',
    kind: 'camera_redlight',
    name: 'Camera Đường 30 Tháng 4 – Mậu Thân (Cần Thơ)',
    road: '30 Tháng 4',
    lat: 10.0299,
    lon: 105.7745,
    hasCamera: true,
    note: 'Camera phạt nguội vượt đèn đỏ & dừng đỗ sai quy định',
  },
  {
    id: 'ct-pvcg-km185',
    kind: 'camera_speed',
    name: 'Camera Cao tốc Pháp Vân – Cầu Giẽ (Km 185)',
    road: 'CT01 Pháp Vân – Cầu Giẽ',
    lat: 20.9315,
    lon: 105.8628,
    speedLimit: 100,
    hasCamera: true,
    note: 'Camera tốc độ 100 km/h & làn dừng khẩn cấp',
  },
  {
    id: 'ct-hnhp-km10',
    kind: 'camera_speed',
    name: 'Camera Cao tốc Hà Nội – Hải Phòng (Km 10)',
    road: 'CT04 Hà Nội – Hải Phòng',
    lat: 20.9642,
    lon: 105.9785,
    speedLimit: 120,
    hasCamera: true,
    note: 'Camera tốc độ 120 km/h & giám sát toàn tuyến 5B',
  },
  {
    id: 'ct-nblc-km15',
    kind: 'camera_speed',
    name: 'Camera Cao tốc Nội Bài – Lào Cai (Km 15)',
    road: 'CT05 Nội Bài – Lào Cai',
    lat: 21.2645,
    lon: 105.6892,
    speedLimit: 100,
    hasCamera: true,
    note: 'Camera bắn tốc độ 100 km/h & cấm đè vạch liền',
  },
  {
    id: 'ct-ltdg-km8',
    kind: 'camera_speed',
    name: 'Camera Cao tốc TP.HCM – Long Thành – Dầu Giây',
    road: 'CT01 HLD',
    lat: 10.7995,
    lon: 106.8294,
    speedLimit: 100,
    hasCamera: true,
    note: 'Camera tốc độ 100 km/h & phạt nguội làn khẩn cấp',
  },
  {
    id: 'ct-hcmtl-km16',
    kind: 'camera_speed',
    name: 'Camera Cao tốc TP.HCM – Trung Lương',
    road: 'CT01 Trung Lương',
    lat: 10.6712,
    lon: 106.5194,
    speedLimit: 100,
    hasCamera: true,
    note: 'Camera tốc độ 100 km/h & làn dừng khẩn cấp',
  },
];

function localHaversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function localBearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function localAngleDiff(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

/**
 * Truy vấn cục bộ 0ms danh sách Camera Phạt Nguội & Biển P.130/P.131a quanh xe (0 Worker req, chạy cả khi mất 4G!)
 */
export function findLocalAreaTrafficPoints(
  lat: number,
  lon: number,
  radiusKm = 12
): Array<VietnamTrafficPoint & { distanceM: number }> {
  const maxM = radiusKm * 1000;
  const out: Array<VietnamTrafficPoint & { distanceM: number }> = [];
  for (const pt of VIETNAM_TRAFFIC_POINTS) {
    const distM = Math.round(localHaversineM(lat, lon, pt.lat, pt.lon));
    if (distM <= maxM) {
      out.push({ ...pt, distanceM: distM });
    }
  }
  out.sort((a, b) => a.distanceM - b.distanceM);
  return out.slice(0, 60);
}

/**
 * Cảnh báo tức thời 0ms các điểm Camera Phạt Nguội (550m) & Biển P.130/P.131a (240m) phía trước xe!
 */
export function findLocalNearbyTrafficAlerts(
  lat: number,
  lon: number,
  heading: number | null
): {
  hazards: Array<{
    type: 'camera' | 'no_stopping' | 'no_parking';
    label: string;
    detail?: string;
    signCode?: 'P.130' | 'P.131a';
    distanceM: number;
    lat: number;
    lon: number;
  }>;
  parkingRestriction: {
    type: 'no_stopping' | 'no_parking';
    signCode: 'P.130' | 'P.131a';
    label: string;
    reason: string;
    isVerified: boolean;
    hasCamera?: boolean;
  } | null;
} {
  const hazards: Array<{
    type: 'camera' | 'no_stopping' | 'no_parking';
    label: string;
    detail?: string;
    signCode?: 'P.130' | 'P.131a';
    distanceM: number;
    lat: number;
    lon: number;
  }> = [];
  let parkingRestriction: {
    type: 'no_stopping' | 'no_parking';
    signCode: 'P.130' | 'P.131a';
    label: string;
    reason: string;
    isVerified: boolean;
    hasCamera?: boolean;
  } | null = null;

  for (const pt of VIETNAM_TRAFFIC_POINTS) {
    const distM = Math.round(localHaversineM(lat, lon, pt.lat, pt.lon));
    const isParking = pt.kind === 'no_stopping' || pt.kind === 'no_parking';
    if (distM > (isParking ? 280 : 550)) continue;

    if (!isParking && heading !== null && distM > 45) {
      const brg = localBearingDeg(lat, lon, pt.lat, pt.lon);
      if (localAngleDiff(heading, brg) > 85) continue;
    }

    if (pt.kind === 'no_stopping' || pt.kind === 'no_parking') {
      const parkingKind: 'no_stopping' | 'no_parking' = pt.kind;
      const signCode = pt.signCode || (parkingKind === 'no_stopping' ? 'P.130' : 'P.131a');
      hazards.push({
        type: parkingKind,
        label: parkingKind === 'no_stopping' ? `Cấm dừng & đỗ (${signCode})` : `Cấm đỗ xe (${signCode})`,
        detail: pt.note || pt.name,
        signCode,
        distanceM: distM,
        lat: pt.lat,
        lon: pt.lon,
      });
      if (distM <= 240 && (!parkingRestriction || parkingKind === 'no_stopping')) {
        parkingRestriction = {
          type: parkingKind,
          signCode,
          label: parkingKind === 'no_stopping' ? 'Cấm dừng & Cấm đỗ' : 'Cấm đỗ xe',
          reason: pt.note || `${pt.name} (${pt.road})`,
          isVerified: true,
          hasCamera: Boolean(pt.hasCamera),
        };
      }
    } else {
      const camLabel =
        pt.kind === 'camera_speed'
          ? `Cam tốc độ ${distM}m`
          : pt.kind === 'camera_redlight'
          ? `Cam phạt nguội ${distM}m`
          : `Cam làn đường ${distM}m`;
      hazards.push({
        type: 'camera',
        label: camLabel,
        detail: `${pt.name}${pt.note ? ` • ${pt.note}` : ''}`,
        distanceM: distM,
        lat: pt.lat,
        lon: pt.lon,
      });
    }
  }
  return { hazards, parkingRestriction };
}
