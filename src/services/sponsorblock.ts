import { SponsorSegment } from '../types';

const sponsorCache = new Map<string, SponsorSegment[]>();

const CATEGORIES = [
  'sponsor',
  'selfpromo',
  'interaction',
  'intro',
  'outro',
  'music_offtopic',
];

export async function fetchSponsorSegments(videoId: string): Promise<SponsorSegment[]> {
  if (!videoId) return [];
  if (sponsorCache.has(videoId)) {
    return sponsorCache.get(videoId) || [];
  }

  try {
    const url = `https://sponsor.ajay.app/api/skipSegments?videoID=${encodeURIComponent(
      videoId
    )}&categories=${encodeURIComponent(JSON.stringify(CATEGORIES))}`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(3500),
    });

    if (res.status === 404) {
      sponsorCache.set(videoId, []);
      return [];
    }

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        const segments: SponsorSegment[] = data
          .filter(
            (item: any) =>
              Array.isArray(item?.segment) &&
              typeof item.segment[0] === 'number' &&
              typeof item.segment[1] === 'number' &&
              item.segment[1] - item.segment[0] >= 1.5
          )
          .map((item: any) => ({
            category: String(item.category || 'sponsor'),
            start: item.segment[0],
            end: item.segment[1],
          }))
          .sort((a, b) => a.start - b.start);

        sponsorCache.set(videoId, segments);
        return segments;
      }
    }
  } catch {
    // Silent fallback when offline or timed out
  }

  sponsorCache.set(videoId, []);
  return [];
}

export function getSponsorCategoryLabel(category: string): string {
  switch (category) {
    case 'music_offtopic':
      return 'đoạn kịch / thoại ngoài nhạc';
    case 'intro':
      return 'đoạn dạo đầu MV';
    case 'outro':
      return 'đoạn kết MV';
    case 'sponsor':
      return 'quảng cáo tài trợ';
    case 'selfpromo':
    case 'interaction':
      return 'lời kêu gọi đăng ký';
    default:
      return 'đoạn ngoài lề';
  }
}
