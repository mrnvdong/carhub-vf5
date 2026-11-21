// Cloudflare Pages Function: /api/health
// Tổng hợp tình trạng sức khỏe hệ thống CarHub VF5 (KV, TTS, các nguồn Phim/TV/Báo) — Edge Cache 60s thực.

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function pingUpstream(name: string, url: string, timeoutMs = 4500) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'application/json, text/html, */*' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    try {
      await res.body?.cancel();
    } catch {}
    return {
      name,
      ok: res.ok,
      status: res.status,
      latencyMs: Date.now() - t0,
    };
  } catch (err: any) {
    return {
      name,
      ok: false,
      status: 0,
      latencyMs: Date.now() - t0,
      error: err?.name === 'TimeoutError' ? 'timeout' : 'network_error',
    };
  }
}

export async function onRequestGet(context: any) {
  const { env } = context;

  const cache = (caches as any).default;
  const cacheKey = new Request('https://carhub-health.internal/v2');
  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) {
        return new Response(hit.body, {
          status: hit.status,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=60, s-maxage=60',
            'X-Content-Type-Options': 'nosniff',
            'X-Cache': 'HIT',
          },
        });
      }
    } catch {}
  }

  const checks = await Promise.all([
    pingUpstream('kkphim', 'https://phimapi.com/danh-sach/phim-moi-cap-nhat-v3?page=1'),
    pingUpstream('vsmov', 'https://vsmov.com/api/danh-sach/phim-moi-cap-nhat?page=1'),
    pingUpstream('cobephim', 'https://egluy2hhb21vaw5ndw9pbmhl.darkbytes.xyz/api/v1/movies/hot'),
    pingUpstream('k20', 'https://sc.k-20.xyz/manifest.json'),
    pingUpstream('baomoi', 'https://baomoi.com/'),
  ]);

  const healthyCount = checks.filter((c) => c.ok).length;
  const ttsProvider = env?.AZURE_SPEECH_KEY
    ? 'azure-neural'
    : env?.FPT_TTS_API_KEY
    ? 'fpt-neural'
    : env?.VIENEU_API_URL
    ? 'vieneu-neural'
    : 'google-fallback';

  const body = {
    status: healthyCount >= 4 ? 'ok' : healthyCount >= 2 ? 'degraded' : 'down',
    timestamp: new Date().toISOString(),
    kvBound: Boolean(env?.CARHUB_KV),
    ttsProvider,
    upstreams: checks,
  };

  const serialized = JSON.stringify(body);
  const status = body.status === 'down' ? 503 : 200;

  if (cache && status === 200) {
    context.waitUntil(
      cache.put(
        cacheKey,
        new Response(serialized, {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=60, s-maxage=60',
          },
        })
      )
    );
  }

  return new Response(serialized, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': status === 200 ? 'public, max-age=60, s-maxage=60' : 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Cache': 'MISS',
    },
  });
}
