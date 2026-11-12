// Cloudflare Pages Function: /api/video
export async function onRequestGet(context: any) {
  const { request } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id || id.length !== 11) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid video ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const cache = (caches as any).default;
  const cacheKey = new Request(url.toString(), request);
  if (cache) {
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }
  }

  // Fetch SponsorBlock segments concurrently
  const sponsorPromise = fetch(
    `https://sponsor.ajay.app/api/skipSegments?videoID=${id}&categories=["sponsor","selfpromo","interaction","intro","outro"]`,
    { signal: AbortSignal.timeout(3000) }
  )
    .then(async (r) => (r.ok ? await r.json() : []))
    .catch(() => []);

  // Phương án B: Direct Cloudflare Worker -> InnerTube Android client (Returns unthrottled direct stream URLs without ads)
  try {
    const directResult = await fetchViaInnerTube(id);
    if (directResult && (directResult.videoStreams.length > 0 || directResult.audioStreams.length > 0 || directResult.hlsUrl)) {
      const sponsors = await sponsorPromise;
      const responseData = {
        success: true,
        source: 'edge-innertube',
        ...directResult,
        sponsorSegments: sponsors.map((s: any) => ({
          category: s.category,
          start: s.segment[0],
          end: s.segment[1],
        })),
      };

      const resp = new Response(JSON.stringify(responseData), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=1800', // Cache stream info for 30 mins
          'Access-Control-Allow-Origin': '*',
        },
      });
      if (cache) context.waitUntil(cache.put(cacheKey, resp.clone()));
      return resp;
    }
  } catch (err) {
    console.warn('Direct InnerTube stream extraction failed, switching to Piped:', err);
  }

  // Phương án A: Fallback to Piped Instances
  const pipedInstances = [
    'https://pipedapi.kavin.rocks',
    'https://api.piped.private.coffee',
    'https://piped-api.lunar.icu',
    'https://pipedapi.leptons.xyz',
  ];

  for (const instance of pipedInstances) {
    try {
      const pipedUrl = `${instance}/streams/${id}`;
      const res = await fetch(pipedUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
        signal: AbortSignal.timeout(4500),
      });

      if (res.ok) {
        const data: any = await res.json();
        const videoStreams = (data.videoStreams || [])
          .filter((v: any) => v.url && v.format === 'mp4')
          .map((v: any) => ({
            url: v.url,
            quality: v.quality,
            resolution: v.resolution,
            mimeType: v.mimeType,
            fps: v.fps,
          }));

        const audioStreams = (data.audioStreams || [])
          .filter((a: any) => a.url)
          .map((a: any) => ({
            url: a.url,
            quality: a.quality,
            mimeType: a.mimeType,
            bitrate: a.bitrate,
          }));

        const sponsors = await sponsorPromise;

        const responseData = {
          success: true,
          source: 'piped-api',
          title: data.title,
          uploader: data.uploader,
          uploaderAvatar: data.uploaderAvatar,
          thumbnailUrl: data.thumbnailUrl || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
          duration: data.duration,
          views: data.views,
          hlsUrl: data.hls,
          videoStreams,
          audioStreams,
          relatedStreams: (data.relatedStreams || []).slice(0, 15).map((r: any) => ({
            id: (r.url || '').replace('/watch?v=', '') || r.id,
            title: r.title,
            uploaderName: r.uploaderName,
            thumbnail: r.thumbnail,
            duration: r.duration,
          })),
          sponsorSegments: sponsors.map((s: any) => ({
            category: s.category,
            start: s.segment[0],
            end: s.segment[1],
          })),
        };

        const resp = new Response(JSON.stringify(responseData), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=1800',
            'Access-Control-Allow-Origin': '*',
          },
        });
        if (cache) context.waitUntil(cache.put(cacheKey, resp.clone()));
        return resp;
      }
    } catch {
      continue;
    }
  }

  return new Response(JSON.stringify({ success: false, error: 'Could not extract stream. Please try another video.' }), {
    status: 502,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

// InnerTube Android client extraction
async function fetchViaInnerTube(videoId: string) {
  const payload = {
    context: {
      client: {
        clientName: 'ANDROID',
        clientVersion: '19.29.35',
        androidSdkVersion: 34,
        hl: 'vi',
        gl: 'VN',
      },
    },
    videoId,
  };

  const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'com.google.android.youtube/19.29.35 (Linux; U; Android 14; vi_VN; Pixel 8 Pro Build/AP2A.240705.005) gzip',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) return null;
  const data: any = await res.json();
  const playability = data.playabilityStatus;
  if (!playability || playability.status !== 'OK') return null;

  const videoDetails = data.videoDetails || {};
  const streamingData = data.streamingData || {};

  const formats = (streamingData.formats || []).concat(streamingData.adaptiveFormats || []);
  const videoStreams: any[] = [];
  const audioStreams: any[] = [];

  for (const fmt of formats) {
    if (!fmt.url) continue; // Direct unthrottled url exists on Android client
    const mime = fmt.mimeType || '';

    if (mime.includes('video/mp4')) {
      videoStreams.push({
        url: fmt.url,
        quality: fmt.qualityLabel || `${fmt.height}p`,
        resolution: `${fmt.width}x${fmt.height}`,
        mimeType: mime,
        fps: fmt.fps || 30,
      });
    } else if (mime.includes('audio/')) {
      audioStreams.push({
        url: fmt.url,
        quality: fmt.audioQuality || 'AUDIO_QUALITY_MEDIUM',
        mimeType: mime,
        bitrate: fmt.bitrate || 128000,
      });
    }
  }

  return {
    title: videoDetails.title || '',
    uploader: videoDetails.author || '',
    uploaderAvatar: null,
    thumbnailUrl: (videoDetails.thumbnail?.thumbnails?.slice(-1)[0]?.url) || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    duration: parseInt(videoDetails.lengthSeconds || '0', 10),
    views: parseInt(videoDetails.viewCount || '0', 10),
    hlsUrl: streamingData.hlsManifestUrl || null,
    videoStreams,
    audioStreams,
    relatedStreams: [],
  };
}
