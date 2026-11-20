import {
  CustomHazardPin,
  MovieItem,
  MovieWatchHistoryItem,
  PendingNavTarget,
  RemoteControlCommand,
  SavedPlace,
  UserPlaylist,
  VideoItem,
} from '../types';

export interface SyncPayload {
  updatedAt: string;
  favorites: VideoItem[];
  playlists: UserPlaylist[];
  savedPlaces?: SavedPlace[];
  movieFavorites?: MovieItem[];
  movieHistory?: MovieWatchHistoryItem[];
  customHazards?: CustomHazardPin[];
  pendingNav?: PendingNavTarget | null;
  remoteCmd?: RemoteControlCommand | null;
}

export interface SyncResponse {
  success: boolean;
  code?: string;
  storage?: string;
  updatedAt?: string;
  data?: SyncPayload;
  pendingNav?: PendingNavTarget | null;
  remoteCmd?: RemoteControlCommand | null;
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
  savedPlaces: SavedPlace[] = [],
  extras?: {
    movieFavorites?: MovieItem[];
    movieHistory?: MovieWatchHistoryItem[];
    customHazards?: CustomHazardPin[];
  }
): Promise<SyncResponse> {
  const code = normalizeSyncCode(rawCode);
  if (code.length < 4) {
    return { success: false, error: 'Mã đồng bộ phải có ít nhất 4 chữ số.' };
  }

  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'full',
        code,
        favorites,
        playlists,
        savedPlaces,
        ...(extras?.movieFavorites ? { movieFavorites: extras.movieFavorites } : {}),
        ...(extras?.movieHistory ? { movieHistory: extras.movieHistory } : {}),
        ...(extras?.customHazards ? { customHazards: extras.customHazards } : {}),
      }),
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

export async function pushExtrasSyncData(
  rawCode: string,
  extras: {
    movieFavorites?: MovieItem[];
    movieHistory?: MovieWatchHistoryItem[];
    customHazards?: CustomHazardPin[];
  }
): Promise<SyncResponse> {
  const code = normalizeSyncCode(rawCode);
  if (code.length < 4) return { success: false };
  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'syncExtras', code, ...extras }),
      signal: AbortSignal.timeout(6500),
    });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok || !ct.includes('application/json')) return { success: false };
    const json = await res.json();
    return { success: Boolean(json?.success), code: json?.code, updatedAt: json?.updatedAt };
  } catch {
    return { success: false };
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

// Co-Pilot Remote: Hàng ghế sau gửi lệnh phát nhạc / thêm hàng đợi / mở phim / điều khiển lên màn VF5!
export async function sendRemoteCommand(
  rawCode: string,
  action: RemoteControlCommand['action'],
  payload?: any
): Promise<SyncResponse> {
  const code = normalizeSyncCode(rawCode);
  if (code.length < 4) {
    return { success: false, error: 'Chưa nhập Mã Xe hợp lệ.' };
  }

  const remoteCmd: RemoteControlCommand = {
    id: `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    action,
    payload,
    sentAt: new Date().toISOString(),
  };

  try {
    sessionStorage.setItem('carhub_self_sent_cmd_id', remoteCmd.id);
  } catch {}

  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sendCmd', code, remoteCmd }),
      signal: AbortSignal.timeout(6500),
    });
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      return { success: false, error: 'Máy chủ đồng bộ chưa phản hồi.' };
    }
    const json = await res.json();
    if (!res.ok || !json.success) {
      return { success: false, error: json.error || 'Không gửi được lệnh lên màn xe.' };
    }
    return { success: true, code: json.code, remoteCmd: json.remoteCmd };
  } catch {
    return { success: false, error: 'Lỗi kết nối khi gửi lệnh Co-Pilot.' };
  }
}

export async function pollCarRemoteState(rawCode: string): Promise<{
  pendingNav: PendingNavTarget | null;
  remoteCmd: RemoteControlCommand | null;
}> {
  const code = normalizeSyncCode(rawCode);
  if (code.length < 4) return { pendingNav: null, remoteCmd: null };

  try {
    const res = await fetch(`/api/sync?code=${encodeURIComponent(code)}&navOnly=1`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4500),
    });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok || !ct.includes('application/json')) {
      return { pendingNav: null, remoteCmd: null };
    }
    const json = await res.json();
    return {
      pendingNav: json?.pendingNav || null,
      remoteCmd: json?.remoteCmd || null,
    };
  } catch {
    return { pendingNav: null, remoteCmd: null };
  }
}

export async function pollPendingNav(rawCode: string): Promise<PendingNavTarget | null> {
  const st = await pollCarRemoteState(rawCode);
  return st.pendingNav;
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

export async function clearRemoteCommand(rawCode: string): Promise<void> {
  const code = normalizeSyncCode(rawCode);
  if (code.length < 4) return;
  try {
    await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clearCmd', code }),
      signal: AbortSignal.timeout(4000),
    });
  } catch {}
}
