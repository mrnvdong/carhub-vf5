// Cloudflare Pages Function: /api/suggest
export async function onRequestGet(context: any) {
  const { request } = context;
  const url = new URL(request.url);
  const q = url.searchParams.get('q');

  if (!q || !q.trim()) {
    return new Response(JSON.stringify({ suggestions: [] }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  try {
    const suggestUrl = `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&hl=vi&gl=VN&q=${encodeURIComponent(
      q.trim()
    )}`;
    const res = await fetch(suggestUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(3000),
    });

    if (res.ok) {
      const text = await res.text();
      const match = text.match(/window\.google\.ac\.h\((.*)\)/);
      if (match) {
        const json = JSON.parse(match[1]);
        const suggestions = (json[1] || []).map((item: any) => item[0]).slice(0, 8);
        return new Response(JSON.stringify({ suggestions }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=600',
          },
        });
      }
    }
  } catch (err) {
    console.warn('Suggest query failed:', err);
  }

  return new Response(JSON.stringify({ suggestions: [] }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
