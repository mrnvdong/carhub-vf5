import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { PendingNavTarget, RemoteControlCommand, RemoteLiveSnapshot } from '../types';
import {
  RemoteDeviceInfo,
  RemoteHostCredentials,
  RemoteSessionState,
  clearHostCredentials,
  createRemoteHostSession,
  loadSavedHostCredentials,
  pollRemoteHostSession,
  revokeRemoteHostSession,
  sendHostRtcAnswer,
  setRemoteHostDeviceDecision,
  updateRemoteHostSettings,
} from '../services/remoteSession';
import { createHostRtcPeerForOffer, HostRtcPeer } from '../services/webrtcRemote';

const STANDARD_GUEST_ACTIONS = new Set([
  'playTrack',
  'queueTrack',
  'openMovie',
  'openTv',
  'openNews',
  'playPause',
  'next',
  'prev',
]);

export interface RemoteHostController {
  creds: RemoteHostCredentials | null;
  state: RemoteSessionState | null;
  isBusy: boolean;
  sessionError: string | null;
  isP2pConnected: boolean;
  p2pCount: number;
  pendingDevices: RemoteDeviceInfo[];
  approvedDevices: RemoteDeviceInfo[];
  ensureSession: (opts?: { forceNoTouch?: boolean }) => Promise<void>;
  rotateSession: (opts?: { forceNoTouch?: boolean }) => Promise<void>;
  revokeSession: () => Promise<void>;
  updateSettings: (patch: {
    locked?: boolean;
    queueOnly?: boolean;
    requirePin?: boolean;
    requireApproval?: boolean;
    rotatePin?: boolean;
  }) => Promise<boolean>;
  approveDevice: (deviceId: string) => Promise<boolean>;
  blockDevice: (deviceId: string) => Promise<boolean>;
  broadcastStateSnapshot: (snapshot: RemoteLiveSnapshot) => void;
  boostPolling: () => void;
}

export function useRemoteHostSession(options: {
  disabled?: boolean;
  noTouchMode?: boolean;
  onRemoteCmd: (cmd: RemoteControlCommand & { senderLabel?: string }) => void;
  onRemoteNav: (nav: PendingNavTarget) => void;
}): RemoteHostController {
  const { disabled = false, noTouchMode = false, onRemoteCmd, onRemoteNav } = options;

  const [creds, setCreds] = useState<RemoteHostCredentials | null>(() =>
    disabled ? null : loadSavedHostCredentials()
  );
  const [state, setState] = useState<RemoteSessionState | null>(null);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [p2pCount, setP2pCount] = useState<number>(0);

  const credsRef = useRef(creds);
  credsRef.current = creds;
  const stateRef = useRef(state);
  stateRef.current = state;
  const noTouchModeRef = useRef(noTouchMode);
  noTouchModeRef.current = noTouchMode;
  const boostUntilRef = useRef<number>(0);
  const inFlightEnsureRef = useRef<Promise<void> | null>(null);
  const onCmdRef = useRef(onRemoteCmd);
  onCmdRef.current = onRemoteCmd;
  const onNavRef = useRef(onRemoteNav);
  onNavRef.current = onRemoteNav;

  const handledCmdIdsRef = useRef<Set<string>>(new Set());
  const handledNavIdsRef = useRef<Set<string>>(new Set());
  const rtcPeersRef = useRef<Map<string, HostRtcPeer>>(new Map());
  const answeredOfferTsRef = useRef<Map<string, number>>(new Map());
  const lastSnapshotRef = useRef<RemoteLiveSnapshot | null>(null);

  const syncP2pCount = useCallback(() => {
    let open = 0;
    for (const peer of rtcPeersRef.current.values()) {
      if (peer.isOpen()) open += 1;
    }
    setP2pCount(open);
  }, []);

  const closeAllRtcPeers = useCallback(() => {
    for (const peer of rtcPeersRef.current.values()) {
      peer.close();
    }
    rtcPeersRef.current.clear();
    answeredOfferTsRef.current.clear();
    setP2pCount(0);
  }, []);

  const boostPolling = useCallback(() => {
    boostUntilRef.current = Date.now() + 5 * 60 * 1000;
  }, []);

  const dispatchAuthorizedCommand = useCallback(
    (cmd: RemoteControlCommand & { senderLabel?: string }, senderDeviceId?: string) => {
      if (!cmd?.id || !cmd?.action) return;
      if (handledCmdIdsRef.current.has(cmd.id)) return;
      handledCmdIdsRef.current.add(cmd.id);
      if (handledCmdIdsRef.current.size > 150) {
        const oldest = handledCmdIdsRef.current.values().next().value;
        if (oldest) handledCmdIdsRef.current.delete(oldest);
      }

      const st = stateRef.current;
      if (!st || st.locked) return;

      const dev = senderDeviceId ? st.devices.find((d) => d.id === senderDeviceId) : null;
      if (senderDeviceId && (!dev || dev.status !== 'approved')) return;
      const isOwner = Boolean(st.noTouchMode && dev?.role === 'owner');

      // Kiểm tra quyền ở cả phía Host (áp dụng chung cho cả P2P WebRTC & HTTP!)
      if (st.queueOnly && !isOwner && cmd.action !== 'queueTrack') return;
      if (senderDeviceId && !STANDARD_GUEST_ACTIONS.has(cmd.action) && !isOwner) return;

      boostUntilRef.current = Date.now() + 10 * 60 * 1000;
      onCmdRef.current(cmd);
    },
    []
  );

  const broadcastStateSnapshot = useCallback((snapshot: RemoteLiveSnapshot) => {
    lastSnapshotRef.current = snapshot;
    for (const peer of rtcPeersRef.current.values()) {
      if (peer.isOpen()) {
        peer.sendPacket({ type: 'state', snapshot });
      }
    }
  }, []);

  const handleIncomingRtcOffer = useCallback(
    async (deviceId: string, sdp: string, ts: number) => {
      const current = credsRef.current;
      if (!current) return;
      if (answeredOfferTsRef.current.get(deviceId) === ts) return;
      answeredOfferTsRef.current.set(deviceId, ts);

      // Đóng peer cũ của cùng thiết bị nếu đang tồn tại
      const prevPeer = rtcPeersRef.current.get(deviceId);
      if (prevPeer) {
        prevPeer.close();
        rtcPeersRef.current.delete(deviceId);
        syncP2pCount();
      }

      const peer = await createHostRtcPeerForOffer(deviceId, sdp, {
        onOpen: () => {
          syncP2pCount();
          if (lastSnapshotRef.current) {
            peer?.sendPacket({ type: 'state', snapshot: lastSnapshotRef.current });
          }
        },
        onClose: () => {
          if (rtcPeersRef.current.get(deviceId) === peer) {
            rtcPeersRef.current.delete(deviceId);
          }
          syncP2pCount();
        },
        onCommand: (cmd) => {
          dispatchAuthorizedCommand(cmd, deviceId);
        },
        onNav: (nav) => {
          const st = stateRef.current;
          const dev = st?.devices.find((d) => d.id === deviceId);
          if (!st || st.locked || !dev || dev.status !== 'approved') return;
          if (st.queueOnly && dev.role !== 'owner') return;
          if (!nav?.id || handledNavIdsRef.current.has(nav.id)) return;
          handledNavIdsRef.current.add(nav.id);
          onNavRef.current(nav);
        },
      });

      if (!peer || credsRef.current?.sessionId !== current.sessionId) {
        peer?.close();
        return;
      }

      rtcPeersRef.current.set(deviceId, peer);
      await sendHostRtcAnswer(current, deviceId, peer.answerSdp);
    },
    [dispatchAuthorizedCommand, syncP2pCount]
  );

  const ensureSession = useCallback(
    async (opts?: { forceNoTouch?: boolean }) => {
      if (disabled) return;
      if (inFlightEnsureRef.current) return inFlightEnsureRef.current;

      const wantNoTouch = opts?.forceNoTouch ?? noTouchModeRef.current;

      const run = (async () => {
        boostUntilRef.current = Date.now() + 8 * 60 * 1000;
        setSessionError(null);
        const current = credsRef.current;

        if (current && Date.now() < current.expiresAt - 60_000) {
          setIsBusy(true);
          const polled = await pollRemoteHostSession(current);
          setIsBusy(false);
          if (credsRef.current?.sessionId !== current.sessionId) return;
          if (polled.state) {
            // Nếu đang chuyển sang chế độ Màn không cảm ứng nhưng phiên cũ là chế độ thường -> đổi phiên mới đúng mode!
            if (Boolean(polled.state.noTouchMode) === wantNoTouch) {
              setState(polled.state);
              setSessionError(null);
              return;
            }
          } else if (!polled.expired) {
            setSessionError('Không kết nối được máy chủ phiên QR (có thể xe đang mất sóng 4G).');
            return;
          }
        }

        closeAllRtcPeers();
        setIsBusy(true);
        const created = await createRemoteHostSession({
          ttlSec: 10800,
          noTouchMode: wantNoTouch,
          requirePin: wantNoTouch ? true : stateRef.current?.requirePin ?? true,
          requireApproval: wantNoTouch ? false : stateRef.current?.requireApproval ?? true,
          queueOnly: wantNoTouch ? false : stateRef.current?.queueOnly ?? false,
          replaceCreds: current,
        });
        setIsBusy(false);
        if (created) {
          setCreds(created.creds);
          setState(created.state);
          setSessionError(null);
        } else {
          setSessionError('Không thể khởi tạo phiên QR bảo mật. Kiểm tra mạng 4G và bấm thử lại.');
        }
      })();

      inFlightEnsureRef.current = run;
      try {
        await run;
      } finally {
        inFlightEnsureRef.current = null;
      }
    },
    [disabled, closeAllRtcPeers]
  );

  const rotateSession = useCallback(
    async (opts?: { forceNoTouch?: boolean }) => {
      if (disabled) return;
      const wantNoTouch = opts?.forceNoTouch ?? noTouchModeRef.current;
      closeAllRtcPeers();
      setIsBusy(true);
      setSessionError(null);
      boostUntilRef.current = Date.now() + 8 * 60 * 1000;
      const created = await createRemoteHostSession({
        ttlSec: 10800,
        noTouchMode: wantNoTouch,
        requirePin: wantNoTouch ? true : stateRef.current?.requirePin ?? true,
        requireApproval: wantNoTouch ? false : stateRef.current?.requireApproval ?? true,
        queueOnly: wantNoTouch ? false : stateRef.current?.queueOnly ?? false,
        replaceCreds: credsRef.current,
      });
      setIsBusy(false);
      if (created) {
        setCreds(created.creds);
        setState(created.state);
        setSessionError(null);
      } else {
        setSessionError('Không thể đổi mã QR mới lúc này — hãy kiểm tra kết nối mạng.');
      }
    },
    [disabled, closeAllRtcPeers]
  );

  const revokeSession = useCallback(async () => {
    const current = credsRef.current;
    closeAllRtcPeers();
    credsRef.current = null;
    setCreds(null);
    setState(null);
    setSessionError(null);
    if (!current) {
      clearHostCredentials();
      return;
    }
    setIsBusy(true);
    await revokeRemoteHostSession(current);
    setIsBusy(false);
  }, [closeAllRtcPeers]);

  const updateSettings = useCallback(
    async (patch: {
      locked?: boolean;
      queueOnly?: boolean;
      requirePin?: boolean;
      requireApproval?: boolean;
      rotatePin?: boolean;
    }): Promise<boolean> => {
      const current = credsRef.current;
      if (!current) return false;
      setIsBusy(true);
      const updated = await updateRemoteHostSettings(current, patch);
      setIsBusy(false);
      if (updated && credsRef.current?.sessionId === current.sessionId) {
        setState(updated);
        setSessionError(null);
        return true;
      }
      return false;
    },
    []
  );

  const approveDevice = useCallback(async (deviceId: string): Promise<boolean> => {
    const current = credsRef.current;
    if (!current) return false;
    boostUntilRef.current = Date.now() + 10 * 60 * 1000;
    const updated = await setRemoteHostDeviceDecision(current, deviceId, 'approve');
    if (updated && credsRef.current?.sessionId === current.sessionId) {
      setState(updated);
      return true;
    }
    return false;
  }, []);

  const blockDevice = useCallback(
    async (deviceId: string): Promise<boolean> => {
      const current = credsRef.current;
      if (!current) return false;
      // Cắt ngay đường P2P WebRTC của thiết bị bị chặn!
      const peer = rtcPeersRef.current.get(deviceId);
      if (peer) {
        peer.close();
        rtcPeersRef.current.delete(deviceId);
        syncP2pCount();
      }
      const updated = await setRemoteHostDeviceDecision(current, deviceId, 'block');
      if (updated && credsRef.current?.sessionId === current.sessionId) {
        setState(updated);
        return true;
      }
      return false;
    },
    [syncP2pCount]
  );

  // Tự động khởi tạo phiên QR bảo mật ngay khi bật chế độ Màn không cảm ứng (không cần chạm màn xe!)
  useEffect(() => {
    if (disabled || !noTouchMode) return;
    ensureSession({ forceNoTouch: true });
  }, [disabled, noTouchMode, ensureSession]);

  // Dọn WebRTC peers khi unmount
  useEffect(() => {
    return () => {
      closeAllRtcPeers();
    };
  }, [closeAllRtcPeers]);

  // Poll siêu tiết kiệm: 3s khi chờ duyệt/chưa có P2P -> tự giãn thành 35s keepalive ngay khi P2P WebRTC đã thông!
  useEffect(() => {
    if (disabled || !creds) return;
    let cancelled = false;
    let timer: number | null = null;

    const tick = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      const current = credsRef.current;
      if (!current || current.sessionId !== creds.sessionId) return;

      if (Date.now() >= current.expiresAt) {
        clearHostCredentials();
        closeAllRtcPeers();
        setCreds(null);
        setState(null);
        return;
      }

      const { expired, state: nextState } = await pollRemoteHostSession(current);
      if (cancelled || credsRef.current?.sessionId !== current.sessionId) return;
      if (expired) {
        closeAllRtcPeers();
        setCreds(null);
        setState(null);
        return;
      }
      if (!nextState) return;

      setState(nextState);

      // 1. Tự trả lời WebRTC Offer từ các điện thoại đã duyệt để chuyển sang kênh P2P 0-cost!
      if (Array.isArray(nextState.pendingRtcOffers) && nextState.pendingRtcOffers.length > 0) {
        for (const off of nextState.pendingRtcOffers) {
          handleIncomingRtcOffer(off.deviceId, off.sdp, off.ts).catch(() => {});
        }
      }

      // 2. Xử lý tất cả lệnh mới trong vòng đệm trượt (KHÔNG cần gọi ack -> tiết kiệm 50% KV writes!)
      const cmdList = Array.isArray(nextState.recentCmds)
        ? nextState.recentCmds
        : nextState.pendingCmd
        ? [nextState.pendingCmd]
        : [];
      for (const cmd of cmdList) {
        if (!cmd?.id || handledCmdIdsRef.current.has(cmd.id)) continue;
        const sentMs = Date.parse(cmd.sentAt || '');
        const isFresh = isNaN(sentMs) || Date.now() - sentMs <= 45_000;
        if (isFresh) {
          dispatchAuthorizedCommand(cmd);
        } else {
          handledCmdIdsRef.current.add(cmd.id);
        }
      }

      // 3. Xử lý điểm dẫn đường mới từ hành khách/chủ xe
      const nav = nextState.pendingNav;
      if (nav && nav.id && !handledNavIdsRef.current.has(nav.id)) {
        handledNavIdsRef.current.add(nav.id);
        const sentMs = Date.parse(nav.sentAt || '');
        const isFresh = isNaN(sentMs) || Date.now() - sentMs <= 60_000;
        if (isFresh && !nextState.locked && (!nextState.queueOnly || nextState.noTouchMode)) {
          boostUntilRef.current = Date.now() + 10 * 60 * 1000;
          onNavRef.current(nav);
        }
      }
    };

    const schedule = () => {
      if (cancelled) return;
      if (timer !== null) window.clearTimeout(timer);
      const st = stateRef.current;
      const hasPending = Boolean(st?.devices?.some((d) => d.status === 'pending'));
      const hasApproved = Boolean(st?.devices?.some((d) => d.status === 'approved'));
      let openPeers = 0;
      for (const p of rtcPeersRef.current.values()) {
        if (p.isOpen()) openPeers += 1;
      }

      // Nếu đã thông WebRTC P2P và không có máy mới đang chờ -> chỉ poll keepalive 35s (giảm 91% Worker req & KV read!)
      const delayMs =
        openPeers > 0 && !hasPending
          ? 35000
          : hasPending || (hasApproved && openPeers === 0) || Date.now() < boostUntilRef.current
          ? 3000
          : 12000;

      timer = window.setTimeout(async () => {
        await tick();
        schedule();
      }, delayMs);
    };

    const onVisibility = () => {
      if (!cancelled && document.visibilityState === 'visible') {
        tick().then(schedule);
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    tick().then(schedule);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [disabled, creds, closeAllRtcPeers, dispatchAuthorizedCommand, handleIncomingRtcOffer]);

  const pendingDevices = useMemo(
    () => (state?.devices || []).filter((d) => d.status === 'pending'),
    [state?.devices]
  );

  const approvedDevices = useMemo(
    () => (state?.devices || []).filter((d) => d.status === 'approved'),
    [state?.devices]
  );

  return useMemo(
    () => ({
      creds,
      state,
      isBusy,
      sessionError,
      isP2pConnected: p2pCount > 0,
      p2pCount,
      pendingDevices,
      approvedDevices,
      ensureSession,
      rotateSession,
      revokeSession,
      updateSettings,
      approveDevice,
      blockDevice,
      broadcastStateSnapshot,
      boostPolling,
    }),
    [
      creds,
      state,
      isBusy,
      sessionError,
      p2pCount,
      pendingDevices,
      approvedDevices,
      ensureSession,
      rotateSession,
      revokeSession,
      updateSettings,
      approveDevice,
      blockDevice,
      broadcastStateSnapshot,
      boostPolling,
    ]
  );
}
