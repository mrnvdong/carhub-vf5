import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { PendingNavTarget, RemoteControlCommand } from '../types';
import {
  RemoteDeviceInfo,
  RemoteHostCredentials,
  RemoteSessionState,
  ackRemoteHostSession,
  clearHostCredentials,
  createRemoteHostSession,
  loadSavedHostCredentials,
  pollRemoteHostSession,
  revokeRemoteHostSession,
  setRemoteHostDeviceDecision,
  updateRemoteHostSettings,
} from '../services/remoteSession';

export interface RemoteHostController {
  creds: RemoteHostCredentials | null;
  state: RemoteSessionState | null;
  isBusy: boolean;
  sessionError: string | null;
  pendingDevices: RemoteDeviceInfo[];
  approvedDevices: RemoteDeviceInfo[];
  ensureSession: () => Promise<void>;
  rotateSession: () => Promise<void>;
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
  boostPolling: () => void;
}

export function useRemoteHostSession(options: {
  disabled?: boolean;
  onRemoteCmd: (cmd: RemoteControlCommand & { senderLabel?: string }) => void;
  onRemoteNav: (nav: PendingNavTarget) => void;
}): RemoteHostController {
  const { disabled = false, onRemoteCmd, onRemoteNav } = options;

  const [creds, setCreds] = useState<RemoteHostCredentials | null>(() =>
    disabled ? null : loadSavedHostCredentials()
  );
  const [state, setState] = useState<RemoteSessionState | null>(null);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const credsRef = useRef(creds);
  credsRef.current = creds;
  const stateRef = useRef(state);
  stateRef.current = state;
  const boostUntilRef = useRef<number>(0);
  const inFlightEnsureRef = useRef<Promise<void> | null>(null);
  const onCmdRef = useRef(onRemoteCmd);
  onCmdRef.current = onRemoteCmd;
  const onNavRef = useRef(onRemoteNav);
  onNavRef.current = onRemoteNav;
  const handledCmdIdsRef = useRef<Set<string>>(new Set());
  const handledNavIdsRef = useRef<Set<string>>(new Set());

  const boostPolling = useCallback(() => {
    boostUntilRef.current = Date.now() + 5 * 60 * 1000;
  }, []);

  const ensureSession = useCallback(async () => {
    if (disabled) return;
    if (inFlightEnsureRef.current) return inFlightEnsureRef.current;

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
          setState(polled.state);
          setSessionError(null);
          return;
        }
        if (!polled.expired) {
          setSessionError('Không kết nối được máy chủ phiên QR (có thể xe đang mất sóng 4G).');
          return;
        }
      }

      setIsBusy(true);
      const created = await createRemoteHostSession({
        ttlSec: 10800,
        requirePin: stateRef.current?.requirePin ?? true,
        requireApproval: stateRef.current?.requireApproval ?? true,
        queueOnly: stateRef.current?.queueOnly ?? false,
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
  }, [disabled]);

  const rotateSession = useCallback(async () => {
    if (disabled) return;
    setIsBusy(true);
    setSessionError(null);
    boostUntilRef.current = Date.now() + 8 * 60 * 1000;
    const created = await createRemoteHostSession({
      ttlSec: 10800,
      requirePin: stateRef.current?.requirePin ?? true,
      requireApproval: stateRef.current?.requireApproval ?? true,
      queueOnly: stateRef.current?.queueOnly ?? false,
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
  }, [disabled]);

  const revokeSession = useCallback(async () => {
    const current = credsRef.current;
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
  }, []);

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

  const blockDevice = useCallback(async (deviceId: string): Promise<boolean> => {
    const current = credsRef.current;
    if (!current) return false;
    const updated = await setRemoteHostDeviceDecision(current, deviceId, 'block');
    if (updated && credsRef.current?.sessionId === current.sessionId) {
      setState(updated);
      return true;
    }
    return false;
  }, []);

  // Poll chủ động khi xe đang có phiên QR bảo mật (tự thức dậy khi quay lại tab)
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
        setCreds(null);
        setState(null);
        return;
      }

      const { expired, state: nextState } = await pollRemoteHostSession(current);
      if (cancelled || credsRef.current?.sessionId !== current.sessionId) return;
      if (expired) {
        setCreds(null);
        setState(null);
        return;
      }
      if (!nextState) return;

      setState(nextState);

      // Xử lý lệnh điều khiển mới (FIFO từ server, chỉ nhận lệnh tươi <= 35 giây & tôn trọng khóa cục bộ!)
      const cmd = nextState.pendingCmd;
      if (cmd && cmd.id && !handledCmdIdsRef.current.has(cmd.id)) {
        handledCmdIdsRef.current.add(cmd.id);
        if (handledCmdIdsRef.current.size > 100) {
          const oldest = handledCmdIdsRef.current.values().next().value;
          if (oldest) handledCmdIdsRef.current.delete(oldest);
        }
        ackRemoteHostSession(current, { cmdId: cmd.id }).catch(() => {});
        const sentMs = Date.parse(cmd.sentAt || '');
        const isFresh = isNaN(sentMs) || Date.now() - sentMs <= 35_000;
        const allowedByMode = !nextState.locked && (!nextState.queueOnly || cmd.action === 'queueTrack');
        if (isFresh && allowedByMode) {
          boostUntilRef.current = Date.now() + 10 * 60 * 1000;
          onCmdRef.current(cmd);
        }
      }

      // Xử lý điểm dẫn đường mới từ hành khách đã được duyệt
      const nav = nextState.pendingNav;
      if (nav && nav.id && !handledNavIdsRef.current.has(nav.id)) {
        handledNavIdsRef.current.add(nav.id);
        ackRemoteHostSession(current, { navId: nav.id }).catch(() => {});
        const sentMs = Date.parse(nav.sentAt || '');
        const isFresh = isNaN(sentMs) || Date.now() - sentMs <= 60_000;
        if (isFresh && !nextState.locked && !nextState.queueOnly) {
          boostUntilRef.current = Date.now() + 10 * 60 * 1000;
          onNavRef.current(nav);
        }
      }
    };

    const schedule = () => {
      if (cancelled) return;
      if (timer !== null) window.clearTimeout(timer);
      const st = stateRef.current;
      const hasActiveOrPending = Boolean(
        st?.devices?.some((d) => d.status === 'approved' || d.status === 'pending')
      );
      const isFast = hasActiveOrPending || Date.now() < boostUntilRef.current;
      timer = window.setTimeout(async () => {
        await tick();
        schedule();
      }, isFast ? 3000 : 10000);
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
  }, [disabled, creds]);

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
      pendingDevices,
      approvedDevices,
      ensureSession,
      rotateSession,
      revokeSession,
      updateSettings,
      approveDevice,
      blockDevice,
      boostPolling,
    }),
    [
      creds,
      state,
      isBusy,
      sessionError,
      pendingDevices,
      approvedDevices,
      ensureSession,
      rotateSession,
      revokeSession,
      updateSettings,
      approveDevice,
      blockDevice,
      boostPolling,
    ]
  );
}
