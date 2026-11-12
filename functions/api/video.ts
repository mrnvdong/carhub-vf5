// Cloudflare Pages Function: /api/video
export async function onRequestGet(context: any) {
  const { request } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id || id.length !== 11) {
    return new Response(
      JSON.stringify({
        success: false,
        playbackType: 'unplayable',
        error: 'ID video không hợp lệ',
      }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    );
  }

  // 1. Check cache: Only use cache if it contains valid streams
  const cache = (caches as any).default;
  const cacheKey = new Request(url.toString(), request);
  if (cache) {
    try {
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        const cachedData = await cachedResponse.clone().json();
        // Only return cached response if it has valid direct or HLS streams
        if (
          cachedData &&
          cachedData.success &&
          (cachedData.playbackType === 'direct' || cachedData.playbackType === 'hls') &&
          ((cachedData.videoStreams && cachedData.videoStreams.length > 0) ||
            (cachedData.audioStreams && cachedData.audioStreams.length > 0) ||
            cachedData.hlsUrl)
        ) {
          return cachedResponse;
        }
      }
    } catch {
      // Ignore cache read errors
    }
  }

  // Fetch SponsorBlock segments concurrently
  const sponsorPromise = fetch(
    `https://sponsor.ajay.app/api/skipSegments?videoID=${id}&categories=["sponsor","selfpromo","interaction","intro","outro"]`,
    { signal: AbortSignal.timeout(2500) }
  )
    .then(async (r) => (r.ok ? await r.json() : []))
    .catch(() => []);

  // 2. Phương án B: Direct Cloudflare Edge to YouTube InnerTube ANDROID_VR
  try {
    const directResult = await fetchViaInnerTube(id);
    if (
      directResult &&
      (directResult.videoStreams.length > 0 ||
        directResult.audioStreams.length > 0 ||
        directResult.hlsUrl)
    ) {
      const sponsors = await sponsorPromise;
      const playbackType = directResult.hlsUrl && directResult.videoStreams.length === 0
        ? 'hls'
        : 'direct';

      const responseData = {
        success: true,
        playbackType,
        source: 'edge-innertube-android-vr',
        id,
        ...directResult,
        sponsorSegments: sponsors.map((s: any) => ({
          category: s.category,
          start: s.segment[0],
          end: s.segment[1],
        })),
      };

      // Shorter TTL (180s) to prevent expired googlevideo tokens
      const resp = new Response(JSON.stringify(responseData), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=180',
          'Access-Control-Allow-Origin': '*',
        },
      });
      if (cache) context.waitUntil(cache.put(cacheKey, resp.clone()));
      return resp;
    }
  } catch (err) {
    console.warn('InnerTube extraction error:', err);
  }

  // 3. Phương án A: Fallback to high-reliability Piped Instances
  const pipedInstances = [
    'https://api.piped.private.coffee',
    'https://pipedapi.ducks.party',
    'https://pipedapi.kavin.rocks',
  ];

  for (const instance of pipedInstances) {
    try {
      const pipedUrl = `${instance}/streams/${id}`;
      const res = await fetch(pipedUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
        signal: AbortSignal.timeout(3500),
      });

      if (res.ok) {
        const data: any = await res.json();
        const videoStreams = (data.videoStreams || [])
          .filter((v: any) => v.url && (v.format === 'mp4' || v.mimeType?.includes('video/mp4')))
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

        if (videoStreams.length > 0 || audioStreams.length > 0 || data.hls) {
          const sponsors = await sponsorPromise;
          const playbackType = data.hls && videoStreams.length === 0 ? 'hls' : 'direct';

          const responseData = {
            success: true,
            playbackType,
            source: 'piped-api',
            id,
            title: data.title || '',
            uploader: data.uploader || '',
            uploaderAvatar: data.uploaderAvatar || null,
            thumbnailUrl: data.thumbnailUrl || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            duration: data.duration || 0,
            views: data.views || 0,
            hlsUrl: data.hls || null,
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
              'Cache-Control': 'public, max-age=180',
              'Access-Control-Allow-Origin': '*',
            },
          });
          if (cache) context.waitUntil(cache.put(cacheKey, resp.clone()));
          return resp;
        }
      }
    } catch {
      continue;
    }
  }

  // 4. Fallback: YouTube Embed
  // Clearly tagged as 'embed'. DO NOT cache embed fallback in edge cache so subsequent tries can grab streams!
  const embedData = {
    success: true,
    playbackType: 'embed',
    source: 'embed-fallback',
    id,
    title: 'Phát qua YouTube Embed (Dự phòng)',
    uploader: 'YouTube',
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    duration: 0,
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`,
    videoStreams: [],
    audioStreams: [],
    sponsorSegments: [],
  };

  return new Response(JSON.stringify(embedData), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}

// InnerTube ANDROID_VR client
async function fetchViaInnerTube(videoId: string) {
  const payload = {
    context: {
      client: {
        clientName: 'ANDROID_VR',
        clientVersion: '1.60.19',
        deviceMake: 'Oculus',
        deviceModel: 'Quest 3',
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
      'User-Agent': 'Mozilla/5.0 (Linux; Android 12; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(4500),
  });

  if (!res.ok) return null;
  const data: any = await res.json();
  if (data.playabilityStatus?.status !== 'OK') return null;

  const videoDetails = data.videoDetails || {};
  const streamingData = data.streamingData || {};

  const formats = (streamingData.formats || []).concat(streamingData.adaptiveFormats || []);
  const videoStreams: any[] = [];
  const audioStreams: any[] = [];

  for (const fmt of formats) {
    if (!fmt.url) continue;
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
