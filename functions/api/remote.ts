// Cloudflare Pages Function: /api/remote
// Hardened, Zero-Login, Ephemeral Co-Pilot Remote Session Engine for VinFast VF5:
// - Completely ISOLATED from personal /api/sync (QR NEVER exposes Sync Code, Home/Work addresses, or Playlists!)
// - 144-bit cryptographic sessionId (QR) + separate 144-bit hostSecret (car screen only)
// - Split-key KV architecture (:cfg Host-only / :req Guest joins & PIN lockout / :cmd FIFO queue & rate limit)
//   -> Guests can NEVER race or overwrite Host's locked / queueOnly / blocked / revoked state!
// - NO stale Edge Cache fallback when CARHUB_KV is bound + explicit revoked tombstone -> revoked sessions NEVER resurrect!
// - 4-digit rotating in-car PIN (max 6 wrong guesses -> auto-locks), 1-tap Driver Approval, FIFO cmd queue (max 5)

import {
  buildTrustedJsonHeaders,
  isTrustedAppRequest,
  readJsonBodyLimited,
} from '../_lib/security';

const VALID_MOVIE_SOURCES = new Set(['kkphim', 'vsmov', 'cobephim', 'k20']);
const ALLOWED_CMD_ACTIONS = new Set([
  'playTrack',
  'queueTrack',
  'openMovie',
  'openTv',
  'openNews',
  'playPause',
  'next',
  'prev',
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
  joinedAt: number;
  lastCmdAt: number;
}

// Key 1: Host-owned configuration & access control (written ONLY by Host!)
interface HostConfigRecord {
  sessionId: string;
  hostSecret: string;
  pin: string;
  requirePin: boolean;
  requireApproval: boolean;
  locked: boolean;
  queueOnly: boolean;
  revoked: boolean;
  createdAt: number;
  expiresAt: number;
  approvedDevices: Record<string, RemoteDeviceEntry>;
  blockedDevices: Record<string, RemoteDeviceEntry>;
}

// Key 2: Guest join requests & PIN brute-force counter (written by Guests on join, cleared by Host on approve/block/reset)
interface GuestReqRecord {
  pendingDevices: Record<string, RemoteDeviceEntry>;
  autoApprovedDevices: Record<string, RemoteDeviceEntry>;
  failedPinCount: number;
  pinLocked: boolean;
}

// Key 3: Guest command FIFO queue & rate-limiter (written by Guests on sendCmd/sendNav, acked by Host)
interface GuestCmdRecord {
  cmdQueue: any[];
  pendingNav: any | null;
  rateWindowStart: number;
  rateWindowCount: number;
  lastGlobalCmdAt: number;
  lastCmdByDevice: Record<string, number>;
}

// Dev-only in-memory store (used ONLY when CARHUB_KV binding is absent, capped to 200 entries)
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
    failedPinCount: 0,
    pinLocked: false,
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
): { status: 'approved' | 'pending' | 'blocked' | 'new'; entry: RemoteDeviceEntry | null } {
  // Thứ tự ưu tiên tuyệt đối: Host Blocked > Host Approved > Guest Auto-Approved (khi không cần duyệt) > Pending > New
  if (cfg.blockedDevices[deviceId]) {
    return { status: 'blocked', entry: cfg.blockedDevices[deviceId] };
  }
  if (cfg.approvedDevices[deviceId]) {
    return { status: 'approved', entry: cfg.approvedDevices[deviceId] };
  }
  if (!cfg.requireApproval && req.autoApprovedDevices[deviceId]) {
    return { status: 'approved', entry: req.autoApprovedDevices[deviceId] };
  }
  if (req.pendingDevices[deviceId]) {
    return { status: 'pending', entry: req.pendingDevices[deviceId] };
  }
  if (req.autoApprovedDevices[deviceId]) {
    // Trường hợp chủ xe bật lại requireApproval sau khi khách vào auto -> hạ về pending để chủ xe duyệt lại!
    return { status: 'pending', entry: req.autoApprovedDevices[deviceId] };
  }
  return { status: 'new', entry: null };
}

function buildDevicesList(
  cfg: HostConfigRecord,
  req: GuestReqRecord,
  cmd: GuestCmdRecord
): RemoteDeviceView[] {
  const merged = new Map<string, RemoteDeviceView>();

  for (const d of Object.values(req.pendingDevices)) {
    merged.set(d.id, {
      id: d.id,
      label: d.label,
      status: 'pending',
      joinedAt: d.joinedAt,
      lastCmdAt: cmd.lastCmdByDevice[d.id] || 0,
    });
  }
  for (const d of Object.values(req.autoApprovedDevices)) {
    merged.set(d.id, {
      id: d.id,
      label: d.label,
      status: cfg.requireApproval ? 'pending' : 'approved',
      joinedAt: d.joinedAt,
      lastCmdAt: cmd.lastCmdByDevice[d.id] || 0,
    });
  }
  for (const d of Object.values(cfg.approvedDevices)) {
    merged.set(d.id, {
      id: d.id,
      label: d.label,
      status: 'approved',
      joinedAt: d.joinedAt,
      lastCmdAt: cmd.lastCmdByDevice[d.id] || 0,
    });
  }
  for (const d of Object.values(cfg.blockedDevices)) {
    merged.set(d.id, {
      id: d.id,
      label: d.label,
      status: 'blocked',
      joinedAt: d.joinedAt,
      lastCmdAt: cmd.lastCmdByDevice[d.id] || 0,
    });
  }

  return Array.from(merged.values())
    .sort((a, b) => b.joinedAt - a.joinedAt)
    .slice(0, 12);
}

function formatHostState(cfg: HostConfigRecord, req: GuestReqRecord, cmd: GuestCmdRecord) {
  const effectiveLocked = Boolean(cfg.locked || req.pinLocked);
  return {
    sessionId: cfg.sessionId,
    pin: cfg.pin,
    requirePin: cfg.requirePin,
    requireApproval: cfg.requireApproval,
    locked: effectiveLocked,
    queueOnly: cfg.queueOnly,
    createdAt: cfg.createdAt,
    expiresAt: cfg.expiresAt,
    devices: buildDevicesList(cfg, req, cmd),
    pendingCmd: cmd.cmdQueue.length > 0 ? cmd.cmdQueue[0] : null,
    pendingCmdCount: cmd.cmdQueue.length,
    pendingNav: cmd.pendingNav,
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

function sanitizeRemoteCmd(cmd: any, senderLabel: string) {
  if (!cmd || typeof cmd.action !== 'string' || !ALLOWED_CMD_ACTIONS.has(cmd.action)) {
    return null;
  }
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
    name: String(nav.name || 'Điểm đến từ Co-Pilot').trim().slice(0, 140),
    subtitle: String(nav.subtitle || `Gửi từ ${senderLabel}`).trim().slice(0, 180),
    lat,
    lon,
    sentAt: new Date().toISOString(),
  };
}

function checkAndBumpRateLimit(cmd: GuestCmdRecord): { ok: true } | { ok: false; error: string } {
  const now = Date.now();
  if (now - cmd.lastGlobalCmdAt < 1400) {
    return { ok: false, error: 'Gửi lệnh quá nhanh — vui lòng đợi 1–2 giây giữa các thao tác.' };
  }
  if (now - cmd.rateWindowStart > 60_000) {
    cmd.rateWindowStart = now;
    cmd.rateWindowCount = 0;
  }
  if (cmd.rateWindowCount >= 10) {
    return { ok: false, error: 'Đạt giới hạn chống spam (10 lệnh/phút) — vui lòng đợi ít giây.' };
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
  };
  // Ghi tombstone ngắn 300s để chặn tuyệt đối mọi đọc sót; đồng thời xóa :req & :cmd
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
    // 1. HOST CREATE: Tạo phiên QR Remote mới (144-bit token + 4-digit PIN + TTL 3h)
    // =========================================================================
    if (action === 'create') {
      const ttlSec = Math.min(14400, Math.max(1800, Number(body.ttlSec) || 10800));
      const now = Date.now();
      const cfg: HostConfigRecord = {
        sessionId: randomToken(18),
        hostSecret: randomToken(18),
        pin: randomPin4(),
        requirePin: body.requirePin !== false,
        requireApproval: body.requireApproval !== false,
        locked: false,
        queueOnly: Boolean(body.queueOnly),
        revoked: false,
        createdAt: now,
        expiresAt: now + ttlSec * 1000,
        approvedDevices: {},
        blockedDevices: {},
      };

      // Nếu xe đang có phiên cũ -> thu hồi sạch ngay khi tạo QR mới!
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

    // Các hành động sau đều bắt buộc có sessionId hợp lệ
    const sessionId = body.sessionId;
    if (!isValidSessionId(sessionId)) {
      return new Response(
        JSON.stringify({
          success: false,
          code: 'INVALID_SESSION',
          error: 'Mã QR phiên điều khiển không hợp lệ. Hãy quét mã QR mới trên màn hình xe VF5.',
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
          error: 'Phiên QR đã hết hạn hoặc chủ xe đã đổi mã QR mới. Hãy quét lại trên màn hình xe VF5.',
        }),
        { status: 410, headers }
      );
    }

    const requireHost = (): boolean =>
      typeof body.hostSecret === 'string' &&
      body.hostSecret.length >= 16 &&
      timingSafeEqualStr(cfg.hostSecret, body.hostSecret);

    // =========================================================================
    // 2. HOST ACTIONS (poll / ack / updateSettings / approveDevice / blockDevice / revoke)
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

    if (action === 'ack') {
      if (!requireHost()) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized host' }), {
          status: 403,
          headers,
        });
      }
      const cmdRec = (await kvGetJson<GuestCmdRecord>(cmdKey(sessionId), env)) || emptyCmd();
      let changed = false;
      if (typeof body.cmdId === 'string' && body.cmdId) {
        const before = cmdRec.cmdQueue.length;
        cmdRec.cmdQueue = cmdRec.cmdQueue.filter((c: any) => c?.id !== body.cmdId);
        if (cmdRec.cmdQueue.length !== before) changed = true;
      }
      if (typeof body.navId === 'string' && body.navId && cmdRec.pendingNav?.id === body.navId) {
        cmdRec.pendingNav = null;
        changed = true;
      }
      if (changed) {
        await kvPutJson(cmdKey(sessionId), cmdRec, remainingTtlSec(cfg), env);
      }
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
        // Nếu chủ xe mở khóa thủ công -> giải phóng luôn cờ pinLocked & bộ đếm sai PIN
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

      const ttl = remainingTtlSec(cfg);
      let reqDirty = false;
      if (reqRec.pendingDevices[devId]) {
        delete reqRec.pendingDevices[devId];
        reqDirty = true;
      }
      if (reqRec.autoApprovedDevices[devId]) {
        delete reqRec.autoApprovedDevices[devId];
        reqDirty = true;
      }

      if (action === 'approveDevice') {
        delete cfg.blockedDevices[devId];
        cfg.approvedDevices[devId] = foundEntry;
      } else {
        delete cfg.approvedDevices[devId];
        cfg.blockedDevices[devId] = foundEntry;
      }

      await kvPutJson(cfgKey(sessionId), cfg, ttl, env);
      if (reqDirty) {
        await kvPutJson(reqKey(sessionId), reqRec, ttl, env);
      }

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
    // 3. GUEST PHONE ACTIONS (status / join / sendCmd / sendNav)
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

    if (action === 'status') {
      return new Response(
        JSON.stringify({
          success: true,
          status: devResolved.status,
          requirePin: cfg.requirePin,
          requireApproval: cfg.requireApproval,
          locked: effectiveLocked,
          queueOnly: cfg.queueOnly,
          expiresAt: cfg.expiresAt,
        }),
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
            locked: effectiveLocked,
            queueOnly: cfg.queueOnly,
            expiresAt: cfg.expiresAt,
          }),
          { headers }
        );
      }

      // Kiểm tra mã PIN 4 số hiển thị trực tiếp trên màn hình xe VF5
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
                error: 'Nhập sai PIN quá 6 lần — phiên đã tự khóa để bảo vệ xe! Chủ xe cần mở khóa trên màn hình VF5.',
              }),
              { status: 423, headers }
            );
          }
          await kvPutJson(reqKey(sessionId), reqRec, ttl, env);
          return new Response(
            JSON.stringify({
              success: false,
              code: 'WRONG_PIN',
              error: 'Sai mã PIN 4 số (nhìn mã PIN hiển thị ngay cạnh mã QR trên màn hình xe VF5).',
            }),
            { status: 401, headers }
          );
        }
      }

      // Giới hạn tối đa 10 thiết bị hoạt động để chống spam KV
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
      if (nextStatus === 'pending') {
        reqRec.pendingDevices[deviceId] = entry;
        delete reqRec.autoApprovedDevices[deviceId];
      } else {
        reqRec.autoApprovedDevices[deviceId] = entry;
        delete reqRec.pendingDevices[deviceId];
      }
      await kvPutJson(reqKey(sessionId), reqRec, remainingTtlSec(cfg), env);

      return new Response(
        JSON.stringify({
          success: true,
          status: nextStatus,
          locked: effectiveLocked,
          queueOnly: cfg.queueOnly,
          expiresAt: cfg.expiresAt,
        }),
        { status: nextStatus === 'pending' ? 202 : 200, headers }
      );
    }

    // Các lệnh điều khiển (sendCmd / sendNav) bắt buộc thiết bị đã được DUYỆT + phiên KHÔNG KHÓA!
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
            error: 'Thiết bị chưa được chủ xe duyệt trên màn hình VF5.',
          }),
          { status: 403, headers }
        );
      }

      const cmdRec = (await kvGetJson<GuestCmdRecord>(cmdKey(sessionId), env)) || emptyCmd();
      const rl = checkAndBumpRateLimit(cmdRec);
      if (!rl.ok) {
        return new Response(JSON.stringify({ success: false, code: 'RATE_LIMIT', error: rl.error }), {
          status: 429,
          headers,
        });
      }

      if (action === 'sendCmd') {
        const cleanCmd = sanitizeRemoteCmd(body.remoteCmd, devResolved.entry.label);
        if (!cleanCmd) {
          return new Response(JSON.stringify({ success: false, error: 'Lệnh điều khiển không hợp lệ.' }), {
            status: 400,
            headers,
          });
        }
        // Thực thi chặt chẽ chế độ "Chỉ xếp hàng đợi" ngay trên máy chủ!
        if (cfg.queueOnly && cleanCmd.action !== 'queueTrack') {
          return new Response(
            JSON.stringify({
              success: false,
              code: 'QUEUE_ONLY',
              error: 'Chủ xe đang bật "Chỉ xếp hàng đợi" — chỉ được bấm nút (+) thêm bài kế tiếp.',
            }),
            { status: 403, headers }
          );
        }

        // Hàng đợi FIFO tối đa 5 lệnh (chống mất lệnh khi người ngồi sau thêm nhiều bài liên tiếp)
        cmdRec.cmdQueue = [...cmdRec.cmdQueue.slice(-4), cleanCmd];
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
        if (cfg.queueOnly) {
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
  } catch (err: any) {
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
