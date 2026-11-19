import { PendingNavTarget, SavedPlace, UserPlaylist, VideoItem } from '../types';

export interface SyncPayload {
  updatedAt: string;
  favorites: VideoItem[];
  playlists: UserPlaylist[];
  savedPlaces?: SavedPlace[];
  pendingNav?: PendingNavTarget | null;
}

export interface SyncResponse {
  success: boolean;
  code?: string;
  storage?: string;
  updatedAt?: string;
  data?: SyncPayload;
  pendingNav?: PendingNavTarget | null;
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
  playlists: UserPlaylist[],
  savedPlaces: SavedPlace[] = []
): Promise<SyncResponse> {
  const code = normalizeSyncCode(rawCode);
  if (code.length < 4) {
    return { success: false, error: 'Mã đồng bộ phải có ít nhất 4 chữ số.' };
  }

  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'full', code, favorites, playlists, savedPlaces }),
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

// Send-to-Car: Điện thoại gửi điểm đến lên màn Cockpit VF5 qua Mã Xe (không ghi đè Playlist)
export async function sendNavToCar(
  rawCode: string,
  target: { name: string; subtitle: string; lat: number; lon: number }
): Promise<SyncResponse> {
  const code = normalizeSyncCode(rawCode);
  if (code.length < 4) {
    return { success: false, error: 'Chưa gắn Mã Xe (4–6 số) để gửi điểm đến.' };
  }

  const pendingNav: PendingNavTarget = {
    id: `nav-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: target.name,
    subtitle: target.subtitle,
    lat: target.lat,
    lon: target.lon,
    sentAt: new Date().toISOString(),
  };

  // Đánh dấu ID do chính thiết bị này gửi để chính nó không tự nuốt mất lệnh dành cho xe VF5!
  try {
    sessionStorage.setItem('carhub_self_sent_nav_id', pendingNav.id);
  } catch {}

  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sendNav', code, pendingNav }),
      signal: AbortSignal.timeout(6500),
    });
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return { success: false, error: 'Máy chủ đồng bộ chưa phản hồi.' };
    }
    const json = await res.json();
    if (!res.ok || !json.success) {
      return { success: false, error: json.error || 'Không gửi được điểm đến lên xe.' };
    }
    return { success: true, code: json.code, pendingNav: json.pendingNav };
  } catch {
    return { success: false, error: 'Lỗi kết nối khi gửi điểm đến lên xe VF5.' };
  }
}

export async function pollPendingNav(rawCode: string): Promise<PendingNavTarget | null> {
  const code = normalizeSyncCode(rawCode);
  if (code.length < 4) return null;

  try {
    const res = await fetch(`/api/sync?code=${encodeURIComponent(code)}&navOnly=1`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4500),
    });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok || !ct.includes('application/json')) return null;
    const json = await res.json();
    return json?.pendingNav || null;
  } catch {
    return null;
  }
}

export async function clearPendingNav(rawCode: string): Promise<void> {
  const code = normalizeSyncCode(rawCode);
  if (code.length < 4) return;
  try {
    await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clearNav', code }),
      signal: AbortSignal.timeout(4000),
    });
  } catch {}
}
