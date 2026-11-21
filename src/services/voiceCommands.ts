// Bộ định tuyến Trợ Lý Giọng Nói Tiếng Việt Toàn App cho CarHub VF5
// Phân tích tự nhiên câu nói từ nút Mic: Dẫn đường / Trạm sạc / Phim / TV-VOV / Báo Audio / Giao diện / Nhạc.

export type VoiceCommandIntent =
  | { type: 'navigate_home' }
  | { type: 'navigate_work' }
  | { type: 'find_ev' }
  | { type: 'navigate_place'; query: string }
  | { type: 'search_movie'; query: string }
  | { type: 'open_tv'; channelQuery?: string }
  | { type: 'open_news'; topic?: string }
  | { type: 'set_theme'; theme: 'light' | 'dark' }
  | { type: 'open_hud' }
  | { type: 'search_music'; query: string };

export function stripVietnameseTones(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ');
}

function normalizeVi(raw: string): string {
  return stripVietnameseTones(raw);
}

export function parseVietnameseVoiceCommand(rawInput: string): VoiceCommandIntent {
  const raw = rawInput.trim();
  const norm = normalizeVi(raw);
  if (!norm) return { type: 'search_music', query: raw };

  // 1) Dẫn đường về nhà / cơ quan
  if (/^(dan duong |chi duong |di |lai xe )?(ve nha|toi nha|den nha|nha rieng)$/.test(norm)) {
    return { type: 'navigate_home' };
  }
  if (/^(dan duong |chi duong |di |lai xe )?(di lam|den co quan|toi co quan|van phong|cong ty)$/.test(norm)) {
    return { type: 'navigate_work' };
  }

  // 2) Tìm trạm sạc VinFast / V-Green
  if (/(tram sac|sac pin|sac xe|v-?green|vinfast sac)/.test(norm)) {
    return { type: 'find_ev' };
  }

  // 3) Dẫn đường tới địa điểm bất kỳ
  const navMatch = raw.match(
    /^(?:dẫn đường|dan duong|chỉ đường|chi duong|đi tới|di toi|đi đến|di den|tìm đường|tim duong)\s+(?:đến|den|tới|toi|ra|vào|vao|về|ve)?\s*(.+)$/i
  );
  if (navMatch && navMatch[1]?.trim().length >= 2) {
    return { type: 'navigate_place', query: navMatch[1].trim() };
  }

  // 4) Mở / Tìm phim trong Rạp Phim 4 nguồn
  const movieMatch = raw.match(
    /^(?:mở phim|mo phim|xem phim|tìm phim|tim phim|chiếu phim|chieu phim|rạp phim|rap phim)\s*(.*)$/i
  );
  if (movieMatch) {
    return { type: 'search_movie', query: (movieMatch[1] || '').trim() };
  }

  // 5) Mở TV Live / Radio VOV Giao thông / VTV / HTV
  if (/^(mo |bat |xem |nghe )?(vov|vov giao thong|vtv\d*|htv\d*|tv live|truyen hinh|tivi|radio)/.test(norm)) {
    const chMatch = norm.match(/(vov giao thong|vov\d*|vtv\d*|htv\d*)/);
    return { type: 'open_tv', channelQuery: chMatch?.[1] || '' };
  }

  // 6) Đọc Báo / Tin tức / Báo Audio
  if (/^(doc bao|nghe bao|bao audio|tin tuc|tin moi|mo bao|bat bao|diem tin)/.test(norm)) {
    return { type: 'open_news' };
  }

  // 7) Bật HUD kính lái
  if (/^(bat |mo )?(hud|kinh lai|dong ho kinh lai)/.test(norm)) {
    return { type: 'open_hud' };
  }

  // 8) Đổi giao diện Sáng / Tối
  if (/^(che do toi|giao dien toi|nen toi|bat che do toi|ban dem)/.test(norm)) {
    return { type: 'set_theme', theme: 'dark' };
  }
  if (/^(che do sang|giao dien sang|nen sang|bat che do sang|ban ngay)/.test(norm)) {
    return { type: 'set_theme', theme: 'light' };
  }

  // 9) Mặc định: tìm nhạc (cắt bớt chữ "mở nhạc / nghe nhạc / bật bài..." nếu có)
  const cleanMusic = raw
    .replace(/^(?:mở nhạc|mo nhac|nghe nhạc|nghe nhac|bật bài|bat bai|mở bài|mo bai|phát bài|phat bai|tìm bài|tim bai)\s+/i, '')
    .trim();
  return { type: 'search_music', query: cleanMusic || raw };
}

export const VOICE_COMMAND_HINTS = [
  { icon: '🏠', label: 'Dẫn đường về nhà', cmd: 'Dẫn đường về nhà' },
  { icon: '⚡', label: 'Tìm trạm sạc gần nhất', cmd: 'Tìm trạm sạc VinFast' },
  { icon: '🎬', label: 'Mở phim hành động', cmd: 'Mở phim hành động' },
  { icon: '📻', label: 'Bật VOV Giao thông', cmd: 'Bật VOV Giao thông' },
  { icon: '📰', label: 'Đọc tin mới hôm nay', cmd: 'Đọc báo tin mới' },
  { icon: '🪞', label: 'Bật HUD Kính Lái', cmd: 'Bật HUD kính lái' },
];
