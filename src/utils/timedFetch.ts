// iOS Safari 15 / CarPlay WKWebView compatible timeout AbortSignal helper
// (Replaces AbortSignal.timeout which only shipped in Safari 16.0+)

export function createTimedSignal(
  timeoutMs: number,
  externalSignal?: AbortSignal
): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      window.clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    },
  };
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 8000
): Promise<Response> {
  const { signal, cleanup } = createTimedSignal(timeoutMs, init.signal ?? undefined);
  try {
    return await fetch(input, { ...init, signal });
  } finally {
    cleanup();
  }
}
