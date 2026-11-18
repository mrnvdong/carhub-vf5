export interface MediaCategory {
  id: string;
  label: string;
  shortLabel: string;
  query: string;
}

export const MEDIA_CATEGORIES: MediaCategory[] = [
  {
    id: 'remix',
    label: '🔥 Remix Lái Xe',
    shortLabel: '🔥 Remix',
    query: 'nhạc trẻ remix bass cực căng lái xe',
  },
  {
    id: 'vinahouse',
    label: '⚡ Vinahouse Nonstop',
    shortLabel: '⚡ Vinahouse',
    query: 'vinahouse nonstop căng đét mới nhất',
  },
  {
    id: 'driving',
    label: '🚗 Đường Dài Êm Ái',
    shortLabel: '🚗 Đường Dài',
    query: 'nhạc lái xe đường dài hay nhất',
  },
  {
    id: 'nhactre',
    label: '🎵 V-Pop Tuyển Chọn',
    shortLabel: '🎵 V-Pop',
    query: 'nhạc trẻ hay nhất hiện nay tuyển chọn',
  },
  {
    id: 'bolero',
    label: '📻 Bolero Trữ Tình',
    shortLabel: '📻 Bolero',
    query: 'bolero trữ tình hay nhất trên ô tô',
  },
  {
    id: 'chill',
    label: '☕ Lofi Chill Mưa',
    shortLabel: '☕ Lofi Chill',
    query: 'nhạc lofi chill tiếng mưa lái xe',
  },
  {
    id: 'acoustic',
    label: '🎸 Acoustic Thư Giãn',
    shortLabel: '🎸 Acoustic',
    query: 'nhạc acoustic nhẹ nhàng nghe trên ô tô',
  },
  {
    id: 'podcast',
    label: '🎙️ Podcast Hay',
    shortLabel: '🎙️ Podcast',
    query: 'hieu tv podcast hay nhất',
  },
  {
    id: 'kids',
    label: '👶 Nhạc Thiếu Nhi',
    shortLabel: '👶 Thiếu Nhi',
    query: 'ca nhạc thiếu nhi vui nhộn cho bé',
  },
];

export function getCategoryQuery(catId: string): string {
  const found = MEDIA_CATEGORIES.find((c) => c.id === catId);
  return found ? found.query : 'nhạc hay nghe trên ô tô';
}
