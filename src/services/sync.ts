import { UserPlaylist, VideoItem } from '../types';

export interface SyncPayload {
  updatedAt: string;
  favorites: VideoItem[];
  playlists: UserPlaylist[];
}

export interface SyncResponse {
  success: boolean;
  code?: string;
  storage?: string;
  updatedAt?: string;
  data?: SyncPayload;
  error?: string;
}

export function normalizeSyncCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/^VF5[-_\s]?/, '')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

export async function pushSyncData(
  rawCode: string,
  favorites: VideoItem[],
  playlists: UserPlaylist[]
): Promise<SyncResponse> {
  const code = normalizeSyncCode(rawCode);
  if (code.length < 4) {
    return { success: false, error: 'Mã đồng bộ phải có ít nhất 4 chữ số.' };
  }

  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, favorites, playlists }),
      signal: AbortSignal.timeout(7000),
    });
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return {
        success: false,
        error: 'Máy chủ đồng bộ chưa sẵn sàng (Hãy chạy trên Cloudflare Pages hoặc wrangler pages dev).',
      };
    }
    const json = await res.json();
    if (!res.ok || !json.success) {
      return { success: false, error: json.error || 'Không thể lưu dữ liệu đồng bộ.' };
    }
    return {
      success: true,
      code: json.code,
      storage: json.storage,
      updatedAt: json.updatedAt,
    };
  } catch {
    return { success: false, error: 'Lỗi kết nối mạng khi đẩy dữ liệu lên mây.' };
  }
}

export async function pullSyncData(rawCode: string): Promise<SyncResponse> {
  const code = normalizeSyncCode(rawCode);
  if (code.length < 4) {
    return { success: false, error: 'Mã đồng bộ phải có ít nhất 4 chữ số.' };
  }

  try {
    const res = await fetch(`/api/sync?code=${encodeURIComponent(code)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(7000),
    });
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return {
        success: false,
        error: 'Máy chủ đồng bộ chưa phản hồi.',
      };
    }
    const json = await res.json();
    if (!res.ok || !json.success || !json.data) {
      return {
        success: false,
        error: json.error || `Không tìm thấy danh sách cho mã VF5-${code}.`,
      };
    }
    return {
      success: true,
      code: json.code,
      storage: json.storage,
      data: json.data,
    };
  } catch {
    return { success: false, error: 'Lỗi kết nối mạng khi tải danh sách về xe.' };
  }
}
