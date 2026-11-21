import { PendingNavTarget, RemoteControlCommand } from '../types';
import { fetchWithTimeout } from '../utils/timedFetch';

export interface RemoteDeviceInfo {
  id: string;
  label: string;
  status: 'approved' | 'pending' | 'blocked';
  joinedAt: number;
  lastCmdAt: number;
}

export interface RemoteSessionState {
  sessionId: string;
  pin: string;
  requirePin: boolean;
  requireApproval: boolean;
  locked: boolean;
  queueOnly: boolean;
  createdAt: number;
  expiresAt: number;
  devices: RemoteDeviceInfo[];
  pendingCmd: (RemoteControlCommand & { senderLabel?: string }) | null;
  pendingNav: PendingNavTarget | null;
}

export interface RemoteHostCredentials {
  sessionId: string;
  hostSecret: string;
  expiresAt: number;
}

const HOST_STORAGE_KEY = 'carhub_remote_host_session_v1';
const GUEST_DEVICE_ID_KEY = 'carhub_remote_guest_device_id';

export function loadSavedHostCredentials(): RemoteHostCredentials | null {
  try {
    const raw = localStorage.getItem(HOST_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RemoteHostCredentials;
    if (
      !parsed?.sessionId ||
      !parsed?.hostSecret ||
      typeof parsed.expiresAt !== 'number' ||
      Date.now() >= parsed.expiresAt - 60_000
    ) {
      localStorage.removeItem(HOST_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveHostCredentials(creds: RemoteHostCredentials): void {
  try {
    localStorage.setItem(HOST_STORAGE_KEY, JSON.stringify(creds));
  } catch {}
}

export function clearHostCredentials(): void {
  try {
    localStorage.removeItem(HOST_STORAGE_KEY);
  } catch {}
}

export function buildSecureCoPilotUrl(sessionId: string): string {
  if (typeof window === 'undefined' || !sessionId) return '';
  return `${window.location.origin}/?copilot=s_${encodeURIComponent(sessionId)}`;
}

export function extractRemoteSessionId(copilotParam: string): string | null {
  const trimmed = copilotParam.trim();
  if (!trimmed.startsWith('s_')) return null;
  const token = trimmed.slice(2);
  return /^[A-Za-z0-9_-]{18,40}$/.test(token) ? token : null;
}

async function postRemoteApi(body: Record<string, any>, timeoutMs = 6500): Promise<{
  ok: boolean;
  status: number;
  data: any;
}> {
  try {
    const res = await fetchWithTimeout(
      '/api/remote',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      },
      timeoutMs
    );
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json() : null;
    return { ok: res.ok && Boolean(data?.success), status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: 'Mất kết nối máy chủ điều khiển từ xa.' } };
  }
}

// =========================================================================
// CAR HOST API
// =========================================================================

export async function createRemoteHostSession(options?: {
  ttlSec?: number;
  requirePin?: boolean;
  requireApproval?: boolean;
  queueOnly?: boolean;
  replaceCreds?: RemoteHostCredentials | null;
}): Promise<{ creds: RemoteHostCredentials; state: RemoteSessionState } | null> {
  const { ok, data } = await postRemoteApi({
    action: 'create',
    ttlSec: options?.ttlSec ?? 10800, // 3 giờ tự hủy
    requirePin: options?.requirePin ?? true,
    requireApproval: options?.requireApproval ?? true,
    queueOnly: options?.queueOnly ?? false,
    ...(options?.replaceCreds
      ? {
          replaceSessionId: options.replaceCreds.sessionId,
          replaceHostSecret: options.replaceCreds.hostSecret,
        }
      : {}),
  });
  if (!ok || !data?.hostSecret || !data?.state?.sessionId) return null;

  const creds: RemoteHostCredentials = {
    sessionId: data.state.sessionId,
    hostSecret: data.hostSecret,
    expiresAt: data.state.expiresAt,
  };
  saveHostCredentials(creds);
  return { creds, state: data.state as RemoteSessionState };
}

export async function pollRemoteHostSession(
  creds: RemoteHostCredentials
): Promise<{ expired?: boolean; state: RemoteSessionState | null }> {
  const { ok, status, data } = await postRemoteApi(
    {
      action: 'poll',
      sessionId: creds.sessionId,
      hostSecret: creds.hostSecret,
    },
    4500
  );
  if (status === 410 || status === 404 || status === 403) {
    clearHostCredentials();
    return { expired: true, state: null };
  }
  if (!ok || !data?.state) return { state: null };
  return { state: data.state as RemoteSessionState };
}

export async function ackRemoteHostSession(
  creds: RemoteHostCredentials,
  ack: { cmdId?: string; navId?: string }
): Promise<void> {
  await postRemoteApi(
    {
      action: 'ack',
      sessionId: creds.sessionId,
      hostSecret: creds.hostSecret,
      ...ack,
    },
    4000
  );
}

export async function updateRemoteHostSettings(
  creds: RemoteHostCredentials,
  patch: {
    locked?: boolean;
    queueOnly?: boolean;
    requirePin?: boolean;
    requireApproval?: boolean;
    rotatePin?: boolean;
  }
): Promise<RemoteSessionState | null> {
  const { ok, data } = await postRemoteApi({
    action: 'updateSettings',
    sessionId: creds.sessionId,
    hostSecret: creds.hostSecret,
    ...patch,
  });
  return ok && data?.state ? (data.state as RemoteSessionState) : null;
}

export async function setRemoteHostDeviceDecision(
  creds: RemoteHostCredentials,
  deviceId: string,
  decision: 'approve' | 'block'
): Promise<RemoteSessionState | null> {
  const { ok, data } = await postRemoteApi({
    action: decision === 'approve' ? 'approveDevice' : 'blockDevice',
    sessionId: creds.sessionId,
    hostSecret: creds.hostSecret,
    deviceId,
  });
  return ok && data?.state ? (data.state as RemoteSessionState) : null;
}

export async function revokeRemoteHostSession(creds: RemoteHostCredentials): Promise<void> {
  clearHostCredentials();
  await postRemoteApi(
    {
      action: 'revoke',
      sessionId: creds.sessionId,
      hostSecret: creds.hostSecret,
    },
    4500
  );
}

// =========================================================================
// GUEST PHONE API
// =========================================================================

export function getOrCreateGuestDeviceId(): string {
  try {
    const existing = localStorage.getItem(GUEST_DEVICE_ID_KEY);
    if (existing && /^[A-Za-z0-9_-]{8,48}$/.test(existing)) return existing;
    const arr = new Uint8Array(12);
    crypto.getRandomValues(arr);
    const id = Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(GUEST_DEVICE_ID_KEY, id);
    return id;
  } catch {
    return `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function detectGuestDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Điện thoại';
  const ua = navigator.userAgent || '';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Samsung|SM-/i.test(ua)) return 'Samsung';
  if (/Android/i.test(ua)) return 'Android';
  return 'Điện thoại';
}

export async function checkGuestSessionStatus(sessionId: string, deviceId: string): Promise<{
  ok: boolean;
  code?: string;
  error?: string;
  status?: 'new' | 'pending' | 'approved' | 'blocked';
  requirePin?: boolean;
  requireApproval?: boolean;
  locked?: boolean;
  queueOnly?: boolean;
  expiresAt?: number;
}> {
  const { ok, data } = await postRemoteApi({
    action: 'status',
    sessionId,
    deviceId,
  });
  if (!ok) {
    return { ok: false, code: data?.code, error: data?.error || 'Không kiểm tra được phiên QR.' };
  }
  return {
    ok: true,
    status: data.status,
    requirePin: Boolean(data.requirePin),
    requireApproval: Boolean(data.requireApproval),
    locked: Boolean(data.locked),
    queueOnly: Boolean(data.queueOnly),
    expiresAt: data.expiresAt,
  };
}

export async function joinGuestRemoteSession(
  sessionId: string,
  deviceId: string,
  deviceLabel: string,
  pin: string
): Promise<{
  ok: boolean;
  code?: string;
  error?: string;
  status?: 'approved' | 'pending';
  locked?: boolean;
  queueOnly?: boolean;
  expiresAt?: number;
}> {
  const { ok, data } = await postRemoteApi({
    action: 'join',
    sessionId,
    deviceId,
    deviceLabel,
    pin,
  });
  if (!ok) {
    return { ok: false, code: data?.code, error: data?.error || 'Không thể kết nối vào xe.' };
  }
  return {
    ok: true,
    status: data.status,
    locked: Boolean(data.locked),
    queueOnly: Boolean(data.queueOnly),
    expiresAt: data.expiresAt,
  };
}

export async function sendGuestRemoteCommand(
  sessionId: string,
  deviceId: string,
  action: RemoteControlCommand['action'],
  payload?: any
): Promise<{ ok: boolean; code?: string; error?: string; queueOnly?: boolean; locked?: boolean }> {
  const { ok, data } = await postRemoteApi({
    action: 'sendCmd',
    sessionId,
    deviceId,
    remoteCmd: { action, payload },
  });
  if (!ok) {
    return { ok: false, code: data?.code, error: data?.error || 'Không gửi được lệnh lên màn xe.' };
  }
  return {
    ok: true,
    queueOnly: Boolean(data?.queueOnly),
    locked: Boolean(data?.locked),
  };
}

export async function sendGuestRemoteNav(
  sessionId: string,
  deviceId: string,
  target: { name: string; subtitle: string; lat: number; lon: number }
): Promise<{ ok: boolean; code?: string; error?: string }> {
  const { ok, data } = await postRemoteApi({
    action: 'sendNav',
    sessionId,
    deviceId,
    pendingNav: target,
  });
  if (!ok) {
    return { ok: false, code: data?.code, error: data?.error || 'Không gửi được điểm đến.' };
  }
  return { ok: true };
}
