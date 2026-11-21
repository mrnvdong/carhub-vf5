// Cloudflare Pages Function: /api/remote
// Ultra-Lean KV + WebRTC P2P Signaling + 4-Layer Security + No-Touch Owner Mode:
// - Completely ISOLATED from personal /api/sync (QR NEVER exposes Sync Code, Home/Work, Playlists!)
// - 144-bit cryptographic sessionId + separate 144-bit hostSecret + 4-digit PIN + 3h TTL
// - ZERO-ACK sliding command ring buffer (saves 50% KV writes!) + Single-write approve/block!
// - Vanilla-ICE WebRTC P2P Signaling embedded in join/rtcAnswer -> UNLIMITED commands at 0 KV writes & 0 Worker reqs!
// - No-Touch Screen Mode (`noTouchMode: true`): First valid-PIN phone becomes `owner`, auto-locks strangers,
//   and unlocks full car screen remote control (switch screens, map zoom, scroll, HUD, theme, seek...) without touching the car!

import {
  buildTrustedJsonHeaders,
  isTrustedAppRequest,
  readJsonBodyLimited,
} from '../_lib/security';

const VALID_MOVIE_SOURCES = new Set(['kkphim', 'vsmov', 'cobephim', 'k20']);
const STANDARD_CMD_ACTIONS = new Set([
  'playTrack',
  'queueTrack',
  'openMovie',
  'openTv',
  'openNews',
  'playPause',
  'next',
  'prev',
]);

const FULL_CONTROL_CMD_ACTIONS = new Set([
  ...STANDARD_CMD_ACTIONS,
  'switchScreen',
  'seekRelative',
  'toggleFullscreen',
  'toggleTheme',
  'toggleHud',
  'toggleViewMode',
  'toggleFavorite',
  'toggleShuffle',
  'toggleRepeat',
  'mapControl',
  'scrollPage',
  'tvZap',
  'newsNav',
  'toggleVoiceAlert',
  'cycleUiScale',
  'cycleDockMode',
]);

const VALID_SCREENS = new Set([
  'cockpit',
  'nowPlaying',
  'tv',
  'news',
  'movies',
  'browse',
  'favorites',
  'history',
]);

const VALID_MAP_ACTIONS = new Set([
  'zoomIn',
  'zoomOut',
  'recenter',
  'toggleFollow',
  'toggleExpand',
  'toggleCameras',
  'toggleTraffic',
  'cancelRoute',
]);

interface RemoteDeviceEntry {
  id: string;
  label: string;
  joinedAt: number;
}

interface RemoteDeviceView {
  id: string;
  label: string;
  status: 'approved' | 'pending' | 'blocked';
  role: 'owner' | 'guest';
  joinedAt: number;
  lastCmdAt: number;
}

interface RtcSignalBlob {
  sdp: string;
  ts: number;
}

// Key 1: Host-owned config & answers (written ONLY by Host, except owner-only lock in noTouchMode via separate flag)
interface HostConfigRecord {
  sessionId: string;
  hostSecret: string;
  pin: string;
  noTouchMode: boolean;
  requirePin: boolean;
  requireApproval: boolean;
  locked: boolean;
  queueOnly: boolean;
  revoked: boolean;
  createdAt: number;
  expiresAt: number;
  approvedDevices: Record<string, RemoteDeviceEntry>;
  blockedDevices: Record<string, RemoteDeviceEntry>;
  rtcAnswers: Record<string, RtcSignalBlob>;
}

// Key 2: Guest join requests, No-Touch first-owner claim, PIN brute-force guard, & WebRTC Offers
interface GuestReqRecord {
  pendingDevices: Record<string, RemoteDeviceEntry>;
  autoApprovedDevices: Record<string, RemoteDeviceEntry>;
  ownerDeviceId: string | null;
  ownerJoinLocked: boolean;
  failedPinCount: number;
  pinLocked: boolean;
  rtcOffers: Record<string, RtcSignalBlob>;
}

// Key 3: Sliding ring buffer of last 10 commands (NO host ack writes needed!) + nav + rate limiter
interface GuestCmdRecord {
  cmdQueue: any[];
  pendingNav: any | null;
  rateWindowStart: number;
  rateWindowCount: number;
  lastGlobalCmdAt: number;
  lastCmdByDevice: Record<string, number>;
}

const devMemoryStore = new Map<string, { val: string; expiresAt: number }>();

function pruneDevMemory() {
  const now = Date.now();
  for (const [k, v] of devMemoryStore.entries()) {
    if (v.expiresAt <= now) devMemoryStore.delete(k);
  }
  while (devMemoryStore.size > 200) {
    const oldestKey = devMemoryStore.keys().next().value;
    if (!oldestKey) break;
    devMemoryStore.delete(oldestKey);
  }
}

async function kvGetJson<T>(key: string, env: any): Promise<T | null> {
  if (env?.CARHUB_KV) {
    const raw = await env.CARHUB_KV.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  const hit = devMemoryStore.get(key);
  if (!hit || hit.expiresAt <= Date.now()) {
    devMemoryStore.delete(key);
    return null;
  }
  try {
    return JSON.parse(hit.val) as T;
  } catch {
    return null;
  }
}

async function kvPutJson(key: string, value: any, ttlSec: number, env: any): Promise<void> {
  const safeTtl = Math.max(60, Math.ceil(ttlSec));
  const serialized = JSON.stringify(value);
  if (env?.CARHUB_KV) {
    await env.CARHUB_KV.put(key, serialized, { expirationTtl: safeTtl });
    return;
  }
  pruneDevMemory();
  devMemoryStore.set(key, { val: serialized, expiresAt: Date.now() + safeTtl * 1000 });
}

async function kvDelete(key: string, env: any): Promise<void> {
  if (env?.CARHUB_KV) {
    try {
      await env.CARHUB_KV.delete(key);
    } catch {}
    return;
  }
  devMemoryStore.delete(key);
}

const cfgKey = (sid: string) => `remote:${sid}:cfg`;
const reqKey = (sid: string) => `remote:${sid}:req`;
const cmdKey = (sid: string) => `remote:${sid}:cmd`;

function emptyReq(): GuestReqRecord {
  return {
    pendingDevices: {},
    autoApprovedDevices: {},
    ownerDeviceId: null,
    ownerJoinLocked: false,
    failedPinCount: 0,
    pinLocked: false,
    rtcOffers: {},
  };
}

function emptyCmd(): GuestCmdRecord {
  return {
    cmdQueue: [],
    pendingNav: null,
    rateWindowStart: Date.now(),
    rateWindowCount: 0,
    lastGlobalCmdAt: 0,
    lastCmdByDevice: {},
  };
}

function randomToken(bytesLen = 18): string {
  const arr = new Uint8Array(bytesLen);
  crypto.getRandomValues(arr);
  let bin = '';
  for (let i = 0; i < arr.length; i++) {
    bin += String.fromCharCode(arr[i]);
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomPin4(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(1000 + (arr[0] % 9000));
}

function isValidSessionId(raw: unknown): raw is string {
  return typeof raw === 'string' && /^[A-Za-z0-9_-]{18,40}$/.test(raw);
}

function isValidDeviceId(raw: unknown): raw is string {
  return typeof raw === 'string' && /^[A-Za-z0-9_-]{8,48}$/.test(raw);
}

function sanitizeSdpString(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length < 20 || trimmed.length > 10000) return null;
  if (!trimmed.includes('v=0')) return null;
  // RFC 4566: WebKit / iOS Safari requires SDP lines to terminate with CRLF
  return `${trimmed.replace(/\r?\n/g, '\r\n')}\r\n`;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function remainingTtlSec(cfg: HostConfigRecord): number {
  return Math.max(60, Math.ceil((cfg.expiresAt - Date.now()) / 1000));
}

function resolveDeviceStatus(
  deviceId: string,
  cfg: HostConfigRecord,
  req: GuestReqRecord
): {
  status: 'approved' | 'pending' | 'blocked' | 'new';
  role: 'owner' | 'guest';
  entry: RemoteDeviceEntry | null;
} {
  const isOwner = Boolean(cfg.noTouchMode && req.ownerDeviceId && req.ownerDeviceId === deviceId);
  const role: 'owner' | 'guest' = isOwner ? 'owner' : 'guest';

  if (cfg.blockedDevices[deviceId]) {
    return { status: 'blocked', role: 'guest', entry: cfg.blockedDevices[deviceId] };
  }
  if (cfg.approvedDevices[deviceId]) {
    return { status: 'approved', role, entry: cfg.approvedDevices[deviceId] };
  }
  if (!cfg.requireApproval && req.autoApprovedDevices[deviceId]) {
    return { status: 'approved', role, entry: req.autoApprovedDevices[deviceId] };
  }
  if (req.pendingDevices[deviceId]) {
    return { status: 'pending', role, entry: req.pendingDevices[deviceId] };
  }
  if (req.autoApprovedDevices[deviceId]) {
    return { status: 'pending', role, entry: req.autoApprovedDevices[deviceId] };
  }
  return { status: 'new', role: 'guest', entry: null };
}

function buildDevicesList(
  cfg: HostConfigRecord,
  req: GuestReqRecord,
  cmd: GuestCmdRecord
): RemoteDeviceView[] {
  const merged = new Map<string, RemoteDeviceView>();

  const put = (d: RemoteDeviceEntry, status: 'approved' | 'pending' | 'blocked') => {
    const isOwner = Boolean(cfg.noTouchMode && req.ownerDeviceId === d.id && status === 'approved');
    merged.set(d.id, {
      id: d.id,
      label: d.label,
      status,
      role: isOwner ? 'owner' : 'guest',
      joinedAt: d.joinedAt,
      lastCmdAt: cmd.lastCmdByDevice[d.id] || 0,
    });
  };

  for (const d of Object.values(req.pendingDevices)) put(d, 'pending');
  for (const d of Object.values(req.autoApprovedDevices)) {
    put(d, cfg.requireApproval ? 'pending' : 'approved');
  }
  for (const d of Object.values(cfg.approvedDevices)) put(d, 'approved');
  for (const d of Object.values(cfg.blockedDevices)) put(d, 'blocked');

  return Array.from(merged.values())
    .sort((a, b) => b.joinedAt - a.joinedAt)
    .slice(0, 12);
}

function formatHostState(cfg: HostConfigRecord, req: GuestReqRecord, cmd: GuestCmdRecord) {
  const effectiveLocked = Boolean(cfg.locked || req.pinLocked);
  const recentQueue = Array.isArray(cmd.cmdQueue) ? cmd.cmdQueue.slice(-10) : [];
  // Lọc các WebRTC offers đang chờ Host trả lời (offer mới hơn answer của device đó)
  const pendingRtcOffers: Array<{ deviceId: string; sdp: string; ts: number }> = [];
  for (const [devId, offer] of Object.entries(req.rtcOffers || {})) {
    const resolved = resolveDeviceStatus(devId, cfg, req);
    if (resolved.status !== 'approved') continue;
    const ans = cfg.rtcAnswers?.[devId];
    if (!ans || offer.ts > ans.ts) {
      pendingRtcOffers.push({ deviceId: devId, sdp: offer.sdp, ts: offer.ts });
    }
  }

  return {
    sessionId: cfg.sessionId,
    pin: cfg.pin,
    noTouchMode: Boolean(cfg.noTouchMode),
    requirePin: cfg.requirePin,
    requireApproval: cfg.requireApproval,
    locked: effectiveLocked,
    ownerJoinLocked: Boolean(req.ownerJoinLocked),
    queueOnly: cfg.queueOnly,
    createdAt: cfg.createdAt,
    expiresAt: cfg.expiresAt,
    devices: buildDevicesList(cfg, req, cmd),
    pendingCmd: recentQueue.length > 0 ? recentQueue[recentQueue.length - 1] : null,
    recentCmds: recentQueue,
    pendingNav: cmd.pendingNav,
    pendingRtcOffers,
  };
}

function sanitizeTrack(v: any) {
  if (!v || typeof v.id !== 'string' || !/^([a-zA-Z0-9_-]{11}|sc_\d{4,16})$/.test(v.id)) {
    return null;
  }
  const isSc = v.id.startsWith('sc_') || v.source === 'soundcloud';
  return {
    id: v.id,
    source: isSc ? 'soundcloud' : 'youtube',
    title: String(v.title || '').slice(0, 200),
    uploaderName: String(v.uploaderName || '').slice(0, 100),
    thumbnail: String(
      v.thumbnail || (isSc ? '' : `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`)
    ).slice(0, 300),
    duration: typeof v.duration === 'number' && Number.isFinite(v.duration) ? v.duration : 0,
    durationText: String(v.durationText || '').slice(0, 20),
  };
}

function sanitizeRemoteCmd(cmd: any, senderLabel: string, allowFullControl: boolean) {
  if (!cmd || typeof cmd.action !== 'string') return null;
  const allowedSet = allowFullControl ? FULL_CONTROL_CMD_ACTIONS : STANDARD_CMD_ACTIONS;
  if (!allowedSet.has(cmd.action)) return null;

  let payload: any = null;
  if (cmd.action === 'playTrack' || cmd.action === 'queueTrack') {
    payload = sanitizeTrack(cmd.payload);
    if (!payload) return null;
  } else if (cmd.action === 'openMovie') {
    const slug = String(cmd.payload?.slug || '').trim().slice(0, 160);
    const source = VALID_MOVIE_SOURCES.has(String(cmd.payload?.source))
      ? String(cmd.payload.source)
      : 'kkphim';
    const name = String(cmd.payload?.name || '').trim().slice(0, 160);
    if (!slug) return null;
    payload = { slug, source, name };
  } else if (cmd.action === 'openTv') {
    const query = String(cmd.payload?.query || cmd.payload?.name || '').trim().slice(0, 80);
    if (!query) return null;
    payload = { query };
  } else if (cmd.action === 'switchScreen') {
    const screen = String(cmd.payload?.screen || '').trim();
    if (!VALID_SCREENS.has(screen)) return null;
    payload = { screen };
  } else if (cmd.action === 'seekRelative') {
    const delta = Number(cmd.payload?.delta);
    if (!Number.isFinite(delta)) return null;
    payload = { delta: Math.max(-120, Math.min(120, Math.round(delta))) };
  } else if (cmd.action === 'mapControl') {
    const mapAction = String(cmd.payload?.mapAction || '').trim();
    if (!VALID_MAP_ACTIONS.has(mapAction)) return null;
    payload = { mapAction };
  } else if (cmd.action === 'scrollPage' || cmd.action === 'tvZap' || cmd.action === 'newsNav') {
    const dir = cmd.payload?.dir === 'prev' || cmd.payload?.dir === 'up' ? cmd.payload.dir : 'next';
    payload = { dir };
  }

  return {
    id: `rcmd-${Date.now()}-${randomToken(4)}`,
    action: cmd.action,
    payload,
    senderLabel: senderLabel.slice(0, 40),
    sentAt: new Date().toISOString(),
  };
}

function sanitizePendingNav(nav: any, senderLabel: string) {
  if (!nav) return null;
  const lat = Number(nav.lat);
  const lon = Number(nav.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return null;
  }
  return {
    id: `rnav-${Date.now()}-${randomToken(4)}`,
    name: String(nav.name || 'Điểm đến từ Remote').trim().slice(0, 140),
    subtitle: String(nav.subtitle || `Gửi từ ${senderLabel}`).trim().slice(0, 180),
    lat,
    lon,
    sentAt: new Date().toISOString(),
  };
}

function checkAndBumpRateLimit(
  cmd: GuestCmdRecord,
  isNoTouchOwner: boolean
): { ok: true } | { ok: false; error: string } {
  const now = Date.now();
  const minGapMs = isNoTouchOwner ? 350 : 1200;
  const maxPerMin = isNoTouchOwner ? 40 : 12;
  if (now - cmd.lastGlobalCmdAt < minGapMs) {
    return { ok: false, error: 'Gửi lệnh quá nhanh — vui lòng đợi giây lát.' };
  }
  if (now - cmd.rateWindowStart > 60_000) {
    cmd.rateWindowStart = now;
    cmd.rateWindowCount = 0;
  }
  if (cmd.rateWindowCount >= maxPerMin) {
    return { ok: false, error: 'Đạt giới hạn chống spam — vui lòng đợi ít giây.' };
  }
  cmd.rateWindowCount += 1;
  cmd.lastGlobalCmdAt = now;
  return { ok: true };
}

async function revokeSessionCleanly(cfg: HostConfigRecord, env: any): Promise<void> {
  const tombstone: HostConfigRecord = {
    ...cfg,
    revoked: true,
    locked: true,
    approvedDevices: {},
    blockedDevices: {},
    rtcAnswers: {},
  };
  await Promise.all([
    kvPutJson(cfgKey(cfg.sessionId), tombstone, 300, env),
    kvDelete(reqKey(cfg.sessionId), env),
    kvDelete(cmdKey(cfg.sessionId), env),
  ]);
}

export async function onRequestOptions(context: any) {
  return new Response(null, { status: 204, headers: buildTrustedJsonHeaders(context.request) });
}

export async function onRequestPost(context: any) {
  const { request, env } = context;
  const headers = { ...buildTrustedJsonHeaders(request), 'Cache-Control': 'no-store' };

  if (!isTrustedAppRequest(request)) {
    return new Response(JSON.stringify({ success: false, error: 'Forbidden origin' }), {
      status: 403,
      headers,
    });
  }

  const parsed = await readJsonBodyLimited(request, 65536);
  if (!parsed.ok) {
    return new Response(JSON.stringify({ success: false, error: parsed.error }), {
      status: parsed.status,
      headers,
    });
  }
  const body = parsed.data || {};
  const action = String(body.action || '');

  try {
    // =========================================================================
    // 1. HOST CREATE (1 KV write duy nhất!)
    // =========================================================================
    if (action === 'create') {
      const ttlSec = Math.min(14400, Math.max(1800, Number(body.ttlSec) || 10800));
      const noTouchMode = Boolean(body.noTouchMode);
      const now = Date.now();
      const cfg: HostConfigRecord = {
        sessionId: randomToken(18),
        hostSecret: randomToken(18),
        pin: randomPin4(),
        noTouchMode,
        // Màn không cảm ứng: BẮT BUỘC PIN 4 số trên màn xe, KHÔNG bắt chạm "Cho phép" trên màn xe!
        requirePin: noTouchMode ? true : body.requirePin !== false,
        requireApproval: noTouchMode ? false : body.requireApproval !== false,
        locked: false,
        queueOnly: noTouchMode ? false : Boolean(body.queueOnly),
        revoked: false,
        createdAt: now,
        expiresAt: now + ttlSec * 1000,
        approvedDevices: {},
        blockedDevices: {},
        rtcAnswers: {},
      };

      if (isValidSessionId(body.replaceSessionId) && typeof body.replaceHostSecret === 'string') {
        const old = await kvGetJson<HostConfigRecord>(cfgKey(body.replaceSessionId), env);
        if (old && !old.revoked && timingSafeEqualStr(old.hostSecret, body.replaceHostSecret)) {
          await revokeSessionCleanly(old, env);
        }
      }

      await kvPutJson(cfgKey(cfg.sessionId), cfg, ttlSec, env);
      return new Response(
        JSON.stringify({
          success: true,
          hostSecret: cfg.hostSecret,
          state: formatHostState(cfg, emptyReq(), emptyCmd()),
        }),
        { headers }
      );
    }

    const sessionId = body.sessionId;
    if (!isValidSessionId(sessionId)) {
      return new Response(
        JSON.stringify({
          success: false,
          code: 'INVALID_SESSION',
          error: 'Mã QR phiên điều khiển không hợp lệ. Hãy quét mã QR mới trên màn hình xe.',
        }),
        { status: 400, headers }
      );
    }

    const cfg = await kvGetJson<HostConfigRecord>(cfgKey(sessionId), env);
    if (!cfg || cfg.revoked || typeof cfg.expiresAt !== 'number' || Date.now() >= cfg.expiresAt) {
      return new Response(
        JSON.stringify({
          success: false,
          code: 'SESSION_EXPIRED',
          error: 'Phiên QR đã hết hạn hoặc chủ xe đã đổi mã QR mới. Hãy quét lại trên màn hình xe.',
        }),
        { status: 410, headers }
      );
    }

    const requireHost = (): boolean =>
      typeof body.hostSecret === 'string' &&
      body.hostSecret.length >= 16 &&
      timingSafeEqualStr(cfg.hostSecret, body.hostSecret);

    // =========================================================================
    // 2. HOST ACTIONS (poll / ack / rtcAnswer / updateSettings / approveDevice / blockDevice / revoke)
    // =========================================================================
    if (action === 'poll') {
      if (!requireHost()) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized host' }), {
          status: 403,
          headers,
        });
      }
      const [reqRec, cmdRec] = await Promise.all([
        kvGetJson<GuestReqRecord>(reqKey(sessionId), env),
        kvGetJson<GuestCmdRecord>(cmdKey(sessionId), env),
      ]);
      return new Response(
        JSON.stringify({
          success: true,
          state: formatHostState(cfg, reqRec || emptyReq(), cmdRec || emptyCmd()),
        }),
        { headers }
      );
    }

    // ZERO-KV-WRITE ACK: Host đã tự chống trùng bằng handledCmdIdsRef -> tiết kiệm 50% KV writes!
    if (action === 'ack') {
      if (!requireHost()) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized host' }), {
          status: 403,
          headers,
        });
      }
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    // Host trả lời WebRTC SDP Answer cho thiết bị đã được duyệt (1 KV write -> sau đó 0 KV write suốt chuyến!)
    if (action === 'rtcAnswer') {
      if (!requireHost()) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized host' }), {
          status: 403,
          headers,
        });
      }
      const devId = body.deviceId;
      const cleanSdp = sanitizeSdpString(body.sdp);
      if (!isValidDeviceId(devId) || !cleanSdp) {
        return new Response(JSON.stringify({ success: false, error: 'WebRTC Answer không hợp lệ.' }), {
          status: 400,
          headers,
        });
      }
      cfg.rtcAnswers = cfg.rtcAnswers || {};
      cfg.rtcAnswers[devId] = { sdp: cleanSdp, ts: Date.now() };
      await kvPutJson(cfgKey(sessionId), cfg, remainingTtlSec(cfg), env);
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    if (action === 'updateSettings') {
      if (!requireHost()) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized host' }), {
          status: 403,
          headers,
        });
      }
      const [reqRecRaw, cmdRecRaw] = await Promise.all([
        kvGetJson<GuestReqRecord>(reqKey(sessionId), env),
        kvGetJson<GuestCmdRecord>(cmdKey(sessionId), env),
      ]);
      const reqRec = reqRecRaw || emptyReq();
      const cmdRec = cmdRecRaw || emptyCmd();

      let reqChanged = false;
      if (typeof body.locked === 'boolean') {
        cfg.locked = body.locked;
        if (!body.locked && reqRec.pinLocked) {
          reqRec.pinLocked = false;
          reqRec.failedPinCount = 0;
          reqChanged = true;
        }
      }
      if (typeof body.queueOnly === 'boolean') cfg.queueOnly = body.queueOnly;
      if (typeof body.requirePin === 'boolean') cfg.requirePin = body.requirePin;
      if (typeof body.requireApproval === 'boolean') cfg.requireApproval = body.requireApproval;
      if (body.rotatePin === true) {
        cfg.pin = randomPin4();
        if (reqRec.failedPinCount > 0 || reqRec.pinLocked) {
          reqRec.failedPinCount = 0;
          reqRec.pinLocked = false;
          reqChanged = true;
        }
      }

      const ttl = remainingTtlSec(cfg);
      await kvPutJson(cfgKey(sessionId), cfg, ttl, env);
      if (reqChanged) {
        await kvPutJson(reqKey(sessionId), reqRec, ttl, env);
      }

      return new Response(
        JSON.stringify({ success: true, state: formatHostState(cfg, reqRec, cmdRec) }),
        { headers }
      );
    }

    // SINGLE-WRITE approveDevice / blockDevice: chỉ ghi :cfg (tiết kiệm 50% KV writes!)
    if (action === 'approveDevice' || action === 'blockDevice') {
      if (!requireHost()) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized host' }), {
          status: 403,
          headers,
        });
      }
      const devId = body.deviceId;
      if (!isValidDeviceId(devId)) {
        return new Response(JSON.stringify({ success: false, error: 'Mã thiết bị không hợp lệ.' }), {
          status: 400,
          headers,
        });
      }

      const [reqRecRaw, cmdRecRaw] = await Promise.all([
        kvGetJson<GuestReqRecord>(reqKey(sessionId), env),
        kvGetJson<GuestCmdRecord>(cmdKey(sessionId), env),
      ]);
      const reqRec = reqRecRaw || emptyReq();
      const cmdRec = cmdRecRaw || emptyCmd();

      const foundEntry =
        cfg.approvedDevices[devId] ||
        cfg.blockedDevices[devId] ||
        reqRec.pendingDevices[devId] ||
        reqRec.autoApprovedDevices[devId];

      if (!foundEntry) {
        return new Response(JSON.stringify({ success: false, error: 'Không tìm thấy thiết bị.' }), {
          status: 404,
          headers,
        });
      }

      if (action === 'approveDevice') {
        delete cfg.blockedDevices[devId];
        cfg.approvedDevices[devId] = foundEntry;
        const cleanAnswer = sanitizeSdpString(body.rtcAnswer);
        if (cleanAnswer) {
          cfg.rtcAnswers = cfg.rtcAnswers || {};
          cfg.rtcAnswers[devId] = { sdp: cleanAnswer, ts: Date.now() };
        }
      } else {
        delete cfg.approvedDevices[devId];
        cfg.blockedDevices[devId] = foundEntry;
      }

      await kvPutJson(cfgKey(sessionId), cfg, remainingTtlSec(cfg), env);
      return new Response(
        JSON.stringify({ success: true, state: formatHostState(cfg, reqRec, cmdRec) }),
        { headers }
      );
    }

    if (action === 'revoke') {
      if (!requireHost()) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized host' }), {
          status: 403,
          headers,
        });
      }
      await revokeSessionCleanly(cfg, env);
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    // =========================================================================
    // 3. GUEST / NO-TOUCH OWNER PHONE ACTIONS
    // =========================================================================
    const deviceId = body.deviceId;
    if (!isValidDeviceId(deviceId)) {
      return new Response(JSON.stringify({ success: false, error: 'Mã thiết bị không hợp lệ.' }), {
        status: 400,
        headers,
      });
    }

    const reqRec = (await kvGetJson<GuestReqRecord>(reqKey(sessionId), env)) || emptyReq();
    const effectiveLocked = Boolean(cfg.locked || reqRec.pinLocked);
    const devResolved = resolveDeviceStatus(deviceId, cfg, reqRec);
    const isOwner = devResolved.status === 'approved' && devResolved.role === 'owner';

    if (action === 'status') {
      const rtcAnswer =
        devResolved.status === 'approved' ? cfg.rtcAnswers?.[deviceId] || null : null;
      return new Response(
        JSON.stringify({
          success: true,
          status: devResolved.status,
          role: devResolved.role,
          noTouchMode: Boolean(cfg.noTouchMode),
          ownerJoinLocked: Boolean(reqRec.ownerJoinLocked),
          requirePin: cfg.requirePin,
          requireApproval: cfg.requireApproval,
          locked: effectiveLocked,
          queueOnly: cfg.queueOnly,
          expiresAt: cfg.expiresAt,
          rtcAnswer,
        }),
        { headers }
      );
    }

    // Thiết bị đã được duyệt gửi WebRTC Offer mới khi muốn mở kết nối P2P trực tiếp
    if (action === 'rtcOffer') {
      if (devResolved.status !== 'approved') {
        return new Response(JSON.stringify({ success: false, code: 'NOT_APPROVED', error: 'Chưa được duyệt.' }), {
          status: 403,
          headers,
        });
      }
      const cleanSdp = sanitizeSdpString(body.sdp);
      if (!cleanSdp) {
        return new Response(JSON.stringify({ success: false, error: 'WebRTC Offer không hợp lệ.' }), {
          status: 400,
          headers,
        });
      }
      reqRec.rtcOffers = reqRec.rtcOffers || {};
      reqRec.rtcOffers[deviceId] = { sdp: cleanSdp, ts: Date.now() };
      await kvPutJson(reqKey(sessionId), reqRec, remainingTtlSec(cfg), env);
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    // Chủ xe trên màn Không Cảm Ứng có thể khóa/mở nhận thêm máy lạ ngay từ điện thoại!
    if (action === 'ownerToggleJoinLock') {
      if (!isOwner) {
        return new Response(JSON.stringify({ success: false, error: 'Chỉ điện thoại chủ xe mới có quyền này.' }), {
          status: 403,
          headers,
        });
      }
      reqRec.ownerJoinLocked = Boolean(body.ownerJoinLocked);
      await kvPutJson(reqKey(sessionId), reqRec, remainingTtlSec(cfg), env);
      return new Response(
        JSON.stringify({ success: true, ownerJoinLocked: reqRec.ownerJoinLocked }),
        { headers }
      );
    }

    if (action === 'join') {
      if (effectiveLocked) {
        return new Response(
          JSON.stringify({
            success: false,
            code: 'LOCKED',
            error: 'Chủ xe đang bật chế độ Khóa Remote.',
          }),
          { status: 423, headers }
        );
      }

      if (devResolved.status === 'blocked') {
        return new Response(
          JSON.stringify({
            success: false,
            code: 'BLOCKED',
            error: 'Thiết bị của bạn đã bị chủ xe từ chối quyền điều khiển.',
          }),
          { status: 403, headers }
        );
      }

      if (devResolved.status === 'approved') {
        return new Response(
          JSON.stringify({
            success: true,
            status: 'approved',
            role: devResolved.role,
            noTouchMode: Boolean(cfg.noTouchMode),
            ownerJoinLocked: Boolean(reqRec.ownerJoinLocked),
            locked: effectiveLocked,
            queueOnly: cfg.queueOnly,
            expiresAt: cfg.expiresAt,
          }),
          { headers }
        );
      }

      // Ở chế độ Màn không cảm ứng: sau khi chủ xe đầu tiên ghép nối thành công -> tự khóa cổng máy lạ!
      if (cfg.noTouchMode && reqRec.ownerDeviceId && reqRec.ownerJoinLocked) {
        return new Response(
          JSON.stringify({
            success: false,
            code: 'LOCKED',
            error: 'Màn xe đang khóa ghép nối riêng cho điện thoại chủ xe đã kết nối.',
          }),
          { status: 423, headers }
        );
      }

      if (cfg.requirePin) {
        const providedPin = String(body.pin || '').replace(/\D/g, '').slice(0, 6);
        if (!providedPin || !timingSafeEqualStr(providedPin, cfg.pin)) {
          reqRec.failedPinCount += 1;
          const ttl = remainingTtlSec(cfg);
          if (reqRec.failedPinCount >= 6) {
            reqRec.pinLocked = true;
            reqRec.failedPinCount = 0;
            await kvPutJson(reqKey(sessionId), reqRec, ttl, env);
            return new Response(
              JSON.stringify({
                success: false,
                code: 'PIN_LOCKED',
                error: 'Nhập sai PIN quá 6 lần — phiên đã tự khóa để bảo vệ xe!',
              }),
              { status: 423, headers }
            );
          }
          await kvPutJson(reqKey(sessionId), reqRec, ttl, env);
          return new Response(
            JSON.stringify({
              success: false,
              code: 'WRONG_PIN',
              error: 'Sai mã PIN 4 số (nhìn mã PIN hiển thị ngay cạnh mã QR trên màn hình xe).',
            }),
            { status: 401, headers }
          );
        }
      }

      const totalUniqueIds = new Set([
        ...Object.keys(cfg.approvedDevices),
        ...Object.keys(reqRec.pendingDevices),
        ...Object.keys(reqRec.autoApprovedDevices),
      ]);
      if (!totalUniqueIds.has(deviceId) && totalUniqueIds.size >= 10) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Phiên đã đạt tối đa 10 thiết bị — chủ xe hãy bấm Đổi QR mới.',
          }),
          { status: 429, headers }
        );
      }

      const cleanLabel =
        String(body.deviceLabel || 'Điện thoại khách')
          .replace(/[<>"'`]/g, '')
          .trim()
          .slice(0, 36) || 'Điện thoại khách';

      const entry: RemoteDeviceEntry = {
        id: deviceId,
        label: cleanLabel,
        joinedAt: devResolved.entry?.joinedAt || Date.now(),
      };

      const nextStatus: 'approved' | 'pending' = cfg.requireApproval ? 'pending' : 'approved';
      let assignedRole: 'owner' | 'guest' = 'guest';
      if (nextStatus === 'pending') {
        reqRec.pendingDevices[deviceId] = entry;
        delete reqRec.autoApprovedDevices[deviceId];
      } else {
        reqRec.autoApprovedDevices[deviceId] = entry;
        delete reqRec.pendingDevices[deviceId];
        // Thiết bị ĐẦU TIÊN nhập đúng PIN trên màn Không Cảm Ứng trở thành Chủ xe & tự khóa máy lạ!
        if (cfg.noTouchMode && !reqRec.ownerDeviceId) {
          reqRec.ownerDeviceId = deviceId;
          reqRec.ownerJoinLocked = true;
          assignedRole = 'owner';
        }
      }

      // Nhúng luôn WebRTC SDP Offer ngay trong bước join (0 thêm lượt ghi KV!)
      const cleanOffer = sanitizeSdpString(body.rtcOffer);
      if (cleanOffer) {
        reqRec.rtcOffers = reqRec.rtcOffers || {};
        reqRec.rtcOffers[deviceId] = { sdp: cleanOffer, ts: Date.now() };
      }

      await kvPutJson(reqKey(sessionId), reqRec, remainingTtlSec(cfg), env);

      return new Response(
        JSON.stringify({
          success: true,
          status: nextStatus,
          role: assignedRole,
          noTouchMode: Boolean(cfg.noTouchMode),
          ownerJoinLocked: Boolean(reqRec.ownerJoinLocked),
          locked: effectiveLocked,
          queueOnly: cfg.queueOnly,
          expiresAt: cfg.expiresAt,
        }),
        { status: nextStatus === 'pending' ? 202 : 200, headers }
      );
    }

    if (action === 'sendCmd' || action === 'sendNav') {
      if (effectiveLocked) {
        return new Response(
          JSON.stringify({
            success: false,
            code: 'LOCKED',
            error: 'Chủ xe đang bật Khóa Remote — không thể gửi lệnh lúc này.',
          }),
          { status: 423, headers }
        );
      }

      if (devResolved.status === 'blocked') {
        return new Response(
          JSON.stringify({
            success: false,
            code: 'BLOCKED',
            error: 'Thiết bị này đã bị chủ xe chặn.',
          }),
          { status: 403, headers }
        );
      }
      if (devResolved.status !== 'approved' || !devResolved.entry) {
        return new Response(
          JSON.stringify({
            success: false,
            code: 'NOT_APPROVED',
            error: 'Thiết bị chưa được chủ xe duyệt trên màn hình xe.',
          }),
          { status: 403, headers }
        );
      }

      const cmdRec = (await kvGetJson<GuestCmdRecord>(cmdKey(sessionId), env)) || emptyCmd();
      const rl = checkAndBumpRateLimit(cmdRec, isOwner);
      if (!rl.ok) {
        return new Response(JSON.stringify({ success: false, code: 'RATE_LIMIT', error: rl.error }), {
          status: 429,
          headers,
        });
      }

      if (action === 'sendCmd') {
        const cleanCmd = sanitizeRemoteCmd(body.remoteCmd, devResolved.entry.label, isOwner);
        if (!cleanCmd) {
          return new Response(JSON.stringify({ success: false, error: 'Lệnh điều khiển không hợp lệ hoặc không đủ quyền.' }), {
            status: 400,
            headers,
          });
        }
        if (cfg.queueOnly && !isOwner && cleanCmd.action !== 'queueTrack') {
          return new Response(
            JSON.stringify({
              success: false,
              code: 'QUEUE_ONLY',
              error: 'Chủ xe đang bật "Chỉ xếp hàng đợi" — chỉ được bấm nút (+) thêm bài kế tiếp.',
            }),
            { status: 403, headers }
          );
        }

        // Vòng đệm trượt 10 lệnh gần nhất (Host tự lọc trùng, KHÔNG cần ack write!)
        cmdRec.cmdQueue = [...(cmdRec.cmdQueue || []).slice(-9), cleanCmd];
        cmdRec.lastCmdByDevice[deviceId] = Date.now();
        await kvPutJson(cmdKey(sessionId), cmdRec, remainingTtlSec(cfg), env);

        return new Response(
          JSON.stringify({
            success: true,
            remoteCmd: cleanCmd,
            queueOnly: cfg.queueOnly,
            locked: effectiveLocked,
          }),
          { headers }
        );
      }

      if (action === 'sendNav') {
        if (cfg.queueOnly && !isOwner) {
          return new Response(
            JSON.stringify({
              success: false,
              code: 'QUEUE_ONLY',
              error: 'Chủ xe đang bật "Chỉ xếp hàng đợi" — tạm khóa gửi điểm dẫn đường từ xa.',
            }),
            { status: 403, headers }
          );
        }
        const cleanNav = sanitizePendingNav(body.pendingNav, devResolved.entry.label);
        if (!cleanNav) {
          return new Response(JSON.stringify({ success: false, error: 'Tọa độ địa điểm không hợp lệ.' }), {
            status: 400,
            headers,
          });
        }
        cmdRec.pendingNav = cleanNav;
        cmdRec.lastCmdByDevice[deviceId] = Date.now();
        await kvPutJson(cmdKey(sessionId), cmdRec, remainingTtlSec(cfg), env);
        return new Response(JSON.stringify({ success: true, pendingNav: cleanNav }), { headers });
      }
    }

    return new Response(JSON.stringify({ success: false, error: 'Unsupported action' }), {
      status: 400,
      headers,
    });
  } catch {
    return new Response(
      JSON.stringify({
        success: false,
        code: 'STORAGE_ERROR',
        error: 'Hệ thống lưu trữ phiên tạm quá tải hoặc đang bảo trì. Vui lòng thử lại sau ít giây.',
      }),
      { status: 503, headers }
    );
  }
}
