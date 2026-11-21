// Zero-Server-Cost WebRTC DataChannel P2P Engine for CarHub VF5 Remote & No-Touch Screen Control
// - Uses Vanilla ICE (single SDP Offer + single SDP Answer, max 850ms gather) -> ZERO extra KV writes!
// - Works directly over LAN/iPhone Hotspot (< 15ms latency!) and across 4G via free public STUN.
// - Once DataChannel is OPEN: UNLIMITED commands & live 2-way state sync at 0 Worker reqs / 0 KV writes!
// - If strict CGNAT blocks P2P: caller seamlessly falls back to hardened /api/remote HTTP channel.

import { PendingNavTarget, RemoteControlCommand, RemoteLiveSnapshot } from '../types';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 2,
};

export type RtcPacket =
  | { type: 'cmd'; cmd: RemoteControlCommand }
  | { type: 'nav'; nav: PendingNavTarget }
  | { type: 'state'; snapshot: RemoteLiveSnapshot }
  | { type: 'ping'; ts: number }
  | { type: 'pong'; ts: number };

export function isWebRtcSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.RTCPeerConnection === 'function';
}

function waitForIceGathering(pc: RTCPeerConnection, maxMs = 850): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      pc.removeEventListener('icegatheringstatechange', onState);
      pc.removeEventListener('icecandidate', onCand);
      resolve();
    };
    const onState = () => {
      if (pc.iceGatheringState === 'complete') finish();
    };
    const onCand = (ev: RTCPeerConnectionIceEvent) => {
      if (!ev.candidate) finish();
    };
    const timer = window.setTimeout(finish, maxMs);
    pc.addEventListener('icegatheringstatechange', onState);
    pc.addEventListener('icecandidate', onCand);
  });
}

export interface GuestRtcPeer {
  offerSdp: string;
  applyAnswer: (answerSdp: string) => Promise<boolean>;
  sendPacket: (pkt: RtcPacket) => boolean;
  isOpen: () => boolean;
  close: () => void;
}

export async function createGuestRtcPeer(callbacks: {
  onOpen: () => void;
  onClose: () => void;
  onStateSnapshot: (snap: RemoteLiveSnapshot) => void;
}): Promise<GuestRtcPeer | null> {
  if (!isWebRtcSupported()) return null;
  try {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const dc = pc.createDataChannel('carhub-rc', { ordered: true });
    let closed = false;
    let answerApplied = false;

    const handleClose = () => {
      if (closed) return;
      closed = true;
      try {
        dc.close();
      } catch {}
      try {
        pc.close();
      } catch {}
      callbacks.onClose();
    };

    dc.onopen = () => {
      if (!closed) callbacks.onOpen();
    };
    dc.onclose = handleClose;
    dc.onerror = handleClose;
    dc.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as RtcPacket;
        if (msg.type === 'state' && msg.snapshot) {
          callbacks.onStateSnapshot(msg.snapshot);
        } else if (msg.type === 'ping' && dc.readyState === 'open') {
          dc.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        }
      } catch {}
    };

    pc.onconnectionstatechange = () => {
      if (
        pc.connectionState === 'failed' ||
        pc.connectionState === 'closed' ||
        pc.connectionState === 'disconnected'
      ) {
        handleClose();
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGathering(pc, 850);

    const offerSdp = pc.localDescription?.sdp || '';
    if (!offerSdp) {
      handleClose();
      return null;
    }

    return {
      offerSdp,
      applyAnswer: async (answerSdp: string) => {
        if (closed || answerApplied) return false;
        try {
          answerApplied = true;
          await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
          return true;
        } catch {
          answerApplied = false;
          return false;
        }
      },
      sendPacket: (pkt: RtcPacket) => {
        if (closed || dc.readyState !== 'open') return false;
        try {
          dc.send(JSON.stringify(pkt));
          return true;
        } catch {
          return false;
        }
      },
      isOpen: () => !closed && dc.readyState === 'open',
      close: handleClose,
    };
  } catch {
    return null;
  }
}

export interface HostRtcPeer {
  deviceId: string;
  answerSdp: string;
  sendPacket: (pkt: RtcPacket) => boolean;
  isOpen: () => boolean;
  close: () => void;
}

export async function createHostRtcPeerForOffer(
  deviceId: string,
  offerSdp: string,
  callbacks: {
    onOpen: () => void;
    onClose: () => void;
    onCommand: (cmd: RemoteControlCommand) => void;
    onNav: (nav: PendingNavTarget) => void;
  }
): Promise<HostRtcPeer | null> {
  if (!isWebRtcSupported()) return null;
  try {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    let dc: RTCDataChannel | null = null;
    let closed = false;

    const handleClose = () => {
      if (closed) return;
      closed = true;
      try {
        dc?.close();
      } catch {}
      try {
        pc.close();
      } catch {}
      callbacks.onClose();
    };

    pc.ondatachannel = (ev) => {
      dc = ev.channel;
      dc.onopen = () => {
        if (!closed) callbacks.onOpen();
      };
      dc.onclose = handleClose;
      dc.onerror = handleClose;
      dc.onmessage = (msgEv) => {
        try {
          const pkt = JSON.parse(String(msgEv.data)) as RtcPacket;
          if (pkt.type === 'cmd' && pkt.cmd?.action) {
            callbacks.onCommand(pkt.cmd);
          } else if (pkt.type === 'nav' && pkt.nav?.lat !== undefined) {
            callbacks.onNav(pkt.nav);
          } else if (pkt.type === 'ping' && dc?.readyState === 'open') {
            dc.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
          }
        } catch {}
      };
    };

    pc.onconnectionstatechange = () => {
      if (
        pc.connectionState === 'failed' ||
        pc.connectionState === 'closed' ||
        pc.connectionState === 'disconnected'
      ) {
        handleClose();
      }
    };

    await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIceGathering(pc, 850);

    const answerSdp = pc.localDescription?.sdp || '';
    if (!answerSdp) {
      handleClose();
      return null;
    }

    return {
      deviceId,
      answerSdp,
      sendPacket: (pkt: RtcPacket) => {
        if (closed || !dc || dc.readyState !== 'open') return false;
        try {
          dc.send(JSON.stringify(pkt));
          return true;
        } catch {
          return false;
        }
      },
      isOpen: () => !closed && Boolean(dc && dc.readyState === 'open'),
      close: handleClose,
    };
  } catch {
    return null;
  }
}
