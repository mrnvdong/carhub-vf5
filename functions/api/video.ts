// Cloudflare Pages Function: /api/video
export async function onRequestGet(context: any) {
  const { request } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const noCache = url.searchParams.get('nocache') === '1';

  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
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

  // 1. Check cache (versioned v4 for 1080p streams, only used when nocache !== '1')
  const cache = (caches as any).default;
  const cacheKey = new Request(`${url.origin}/api/video?id=${id}&v=4`, request);
  if (cache && !noCache) {
    try {
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        const cachedData = await cachedResponse.clone().json();
        const hasValidDirect =
          cachedData?.playbackType === 'direct' &&
          ((Array.isArray(cachedData.videoStreams) && cachedData.videoStreams.length > 0) ||
            (Array.isArray(cachedData.audioStreams) && cachedData.audioStreams.length > 0));
        const hasValidHls =
          cachedData?.playbackType === 'hls' && Boolean(cachedData.hlsUrl);

        if (cachedData?.success && (hasValidDirect || hasValidHls)) {
          return cachedResponse;
        }
      }
    } catch {
      // Ignore cache read error
    }
  }

  // Fetch SponsorBlock segments concurrently
  const sponsorPromise = fetch(
    `https://sponsor.ajay.app/api/skipSegments?videoID=${id}&categories=["sponsor","selfpromo","interaction","intro","outro"]`,
    { signal: AbortSignal.timeout(2500) }
  )
    .then(async (r) => (r.ok ? await r.json() : []))
    .catch(() => []);

  // 2. Phương án B: Direct Cloudflare Edge to YouTube InnerTube (IOS 20.10.4 + ANDROID 20.10.38)
  try {
    const directResult = await fetchViaInnerTubeMultiClient(id);
    if (
      directResult &&
      (directResult.videoStreams.length > 0 ||
        directResult.audioStreams.length > 0 ||
        directResult.hlsUrl)
    ) {
      const sponsors = await sponsorPromise;
      const playbackType =
        directResult.videoStreams.length > 0 || directResult.audioStreams.length > 0
          ? 'direct'
          : 'hls';

      const responseData = {
        success: true,
        playbackType,
        source: directResult.source,
        id,
        title: directResult.title,
        uploader: directResult.uploader,
        uploaderAvatar: null,
        thumbnailUrl: directResult.thumbnailUrl,
        duration: directResult.duration,
        views: directResult.views,
        hlsUrl: directResult.hlsUrl,
        embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`,
        videoStreams: directResult.videoStreams,
        audioStreams: directResult.audioStreams,
        relatedStreams: [],
        sponsorSegments: Array.isArray(sponsors)
          ? sponsors.map((s: any) => ({
              category: s.category,
              start: s.segment[0],
              end: s.segment[1],
            }))
          : [],
      };

      const resp = new Response(JSON.stringify(responseData), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=120',
          'Access-Control-Allow-Origin': '*',
        },
      });
      if (cache && !noCache) {
        context.waitUntil(cache.put(cacheKey, resp.clone()));
      }
      return resp;
    }
  } catch (err) {
    console.warn('InnerTube extraction error:', err);
  }

  // 3. Phương án A: Fallback to Piped Instances
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
        signal: AbortSignal.timeout(1800),
      });

      if (res.ok) {
        const data: any = await res.json();
        const videoStreams = (data.videoStreams || [])
          .filter(
            (v: any) =>
              v.url &&
              (v.format === 'MPEG_4' ||
                v.format === 'MP4' ||
                v.format === 'mp4' ||
                v.mimeType?.includes('video/mp4'))
          )
          .map((v: any) => ({
            url: v.url,
            quality: v.quality || '720p',
            resolution: v.resolution || '1280x720',
            mimeType: v.mimeType || 'video/mp4',
            fps: v.fps || 30,
            needsAudioSync: Boolean(v.videoOnly),
          }))
          .sort((a: any, b: any) => {
            const getRes = (q: string) => parseInt(q.replace(/\D/g, '') || '0', 10);
            return getRes(b.quality) - getRes(a.quality);
          });

        const audioStreams = (data.audioStreams || [])
          .filter((a: any) => a.url)
          .sort((a: any, b: any) => {
            const aMp4 = (a.mimeType || '').includes('mp4') ? 0 : 1;
            const bMp4 = (b.mimeType || '').includes('mp4') ? 0 : 1;
            return aMp4 - bMp4;
          })
          .map((a: any) => ({
            url: a.url,
            quality: a.quality || '128kbps',
            mimeType: a.mimeType || 'audio/mp4',
            bitrate: a.bitrate || 128000,
          }));

        const hlsUrl = data.hls || null;

        if (videoStreams.length > 0 || audioStreams.length > 0 || hlsUrl) {
          const sponsors = await sponsorPromise;
          const playbackType =
            videoStreams.length > 0 || audioStreams.length > 0 ? 'direct' : 'hls';

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
            hlsUrl,
            embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`,
            videoStreams,
            audioStreams,
            relatedStreams: (data.relatedStreams || []).slice(0, 15).map((r: any) => ({
              id: (r.url || '').replace('/watch?v=', '') || r.id,
              title: r.title,
              uploaderName: r.uploaderName,
              thumbnail: r.thumbnail,
              duration: r.duration,
            })),
            sponsorSegments: Array.isArray(sponsors)
              ? sponsors.map((s: any) => ({
                  category: s.category,
                  start: s.segment[0],
                  end: s.segment[1],
                }))
              : [],
          };

          const resp = new Response(JSON.stringify(responseData), {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=120',
              'Access-Control-Allow-Origin': '*',
            },
          });
          if (cache && !noCache) {
            context.waitUntil(cache.put(cacheKey, resp.clone()));
          }
          return resp;
        }
      }
    } catch {
      continue;
    }
  }

  // 4. Verify via YouTube oEmbed before returning 'embed'
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${id}`
    )}&format=json`;
    const oembedRes = await fetch(oembedUrl, { signal: AbortSignal.timeout(3000) });

    if (oembedRes.ok) {
      const oembedData: any = await oembedRes.json();
      const embedData = {
        success: true,
        playbackType: 'embed',
        source: 'embed-fallback',
        id,
        title: oembedData.title || 'Phát qua YouTube Embed (Dự phòng)',
        uploader: oembedData.author_name || 'YouTube',
        thumbnailUrl: oembedData.thumbnail_url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        duration: 0,
        hlsUrl: null,
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
  } catch {
    // oEmbed failed
  }

  // 5. Unplayable fallback
  return new Response(
    JSON.stringify({
      success: false,
      playbackType: 'unplayable',
      id,
      error: 'Video này không tồn tại, đang ở chế độ riêng tư hoặc chủ kênh đã chặn phát.',
      videoStreams: [],
      audioStreams: [],
    }),
    {
      status: 422,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    }
  );
}

// Multi-client InnerTube extractor prioritizing Full HD 1080p and 720p streams
async function fetchViaInnerTubeMultiClient(videoId: string) {
  // 1. Primary: IOS client (Most reliable from edge datacenters, does not trigger bot check)
  const iosClient = {
    name: 'edge-innertube-ios',
    context: {
      client: {
        clientName: 'IOS',
        clientVersion: '20.10.4',
        deviceMake: 'Apple',
        deviceModel: 'iPhone16,2',
        osName: 'iPhone',
        osVersion: '18.2.1.22C161',
        hl: 'vi',
        gl: 'VN',
      },
    },
    userAgent: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_2_1 like Mac OS X;)',
  };

  const iosData = await queryInnerTubeClient(videoId, iosClient);
  if (
    iosData &&
    (iosData.videoStreams.length > 0 || iosData.audioStreams.length > 0 || iosData.hlsUrl)
  ) {
    return iosData;
  }

  // 2. Secondary fallback: ANDROID client
  const androidClient = {
    name: 'edge-innertube-android',
    context: {
      client: {
        clientName: 'ANDROID',
        clientVersion: '20.10.38',
        androidSdkVersion: 34,
        hl: 'vi',
        gl: 'VN',
      },
    },
    userAgent: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip',
  };

  const androidData = await queryInnerTubeClient(videoId, androidClient);
  if (
    androidData &&
    (androidData.videoStreams.length > 0 || androidData.audioStreams.length > 0 || androidData.hlsUrl)
  ) {
    return androidData;
  }

  return null;
}

async function queryInnerTubeClient(
  videoId: string,
  clientConfig: { name: string; context: any; userAgent: string }
) {
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': clientConfig.userAgent,
      },
      body: JSON.stringify({
        context: clientConfig.context,
        videoId,
      }),
      signal: AbortSignal.timeout(7000),
    });

    if (!res.ok) return null;
    const data: any = await res.json();
    if (data.playabilityStatus?.status !== 'OK') return null;

    const videoDetails = data.videoDetails || {};
    const streamingData = data.streamingData || {};

    const muxedFormats = streamingData.formats || [];
    const adaptiveFormats = streamingData.adaptiveFormats || [];
    const allFormats = [...muxedFormats, ...adaptiveFormats];

    const videoStreams: any[] = [];
    const audioStreams: any[] = [];

    for (const fmt of allFormats) {
      if (!fmt.url) continue;
      const mime = fmt.mimeType || '';

      // Extract High Definition MP4 video streams (1080p, 720p, 480p, 360p)
      if (mime.includes('video/mp4')) {
        const isMuxed = Boolean(fmt.audioQuality || mime.includes('mp4a'));
        videoStreams.push({
          url: fmt.url,
          quality: fmt.qualityLabel || `${fmt.height || 360}p`,
          resolution: `${fmt.width || 640}x${fmt.height || 360}`,
          mimeType: mime,
          fps: fmt.fps || 30,
          needsAudioSync: !isMuxed,
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

    // Sort videoStreams: 1080p first, then 720p, then 480p, then 360p (prefer avc1 / H.264 for hardware decoding)
    videoStreams.sort((a, b) => {
      const getRes = (str: string) => parseInt(str.replace(/\D/g, '') || '0', 10);
      const diff = getRes(b.quality) - getRes(a.quality);
      if (diff !== 0) return diff;
      const aIsAvc = (a.mimeType || '').includes('avc1') ? 0 : 1;
      const bIsAvc = (b.mimeType || '').includes('avc1') ? 0 : 1;
      return aIsAvc - bIsAvc;
    });

    // De-duplicate videoStreams by resolution/quality
    const qualityMap = new Map<string, any>();
    for (const v of videoStreams) {
      const qKey = v.quality;
      const isAvc = (v.mimeType || '').includes('avc1');
      if (!qualityMap.has(qKey)) {
        qualityMap.set(qKey, v);
      } else if (isAvc && !(qualityMap.get(qKey).mimeType || '').includes('avc1')) {
        qualityMap.set(qKey, v);
      }
    }
    const uniqueVideoStreams = Array.from(qualityMap.values());

    // Sort audioStreams: prioritize audio/mp4 (AAC/M4A) first
    audioStreams.sort((a, b) => {
      const aIsMp4 = a.mimeType.includes('audio/mp4') ? 0 : 1;
      const bIsMp4 = b.mimeType.includes('audio/mp4') ? 0 : 1;
      if (aIsMp4 !== bIsMp4) return aIsMp4 - bIsMp4;
      return (b.bitrate || 0) - (a.bitrate || 0);
    });

    return {
      source: clientConfig.name,
      title: videoDetails.title || '',
      uploader: videoDetails.author || '',
      thumbnailUrl:
        videoDetails.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration: parseInt(videoDetails.lengthSeconds || '0', 10),
      views: parseInt(videoDetails.viewCount || '0', 10),
      hlsUrl: streamingData.hlsManifestUrl || null,
      videoStreams: uniqueVideoStreams,
      audioStreams,
    };
  } catch {
    return null;
  }
}
