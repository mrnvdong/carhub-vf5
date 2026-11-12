// Cloudflare Pages Function: /api/popular
export async function onRequestGet(context: any) {
  const { request } = context;
  const url = new URL(request.url);
  const category = url.searchParams.get('category') || 'remix';

  const categoryQueries: Record<string, string> = {
    remix: 'nhạc trẻ remix bass cực căng lái xe',
    driving: 'nhạc lái xe đường dài hay nhất',
    bolero: 'bolero trữ tình hay nhất trên ô tô',
    chill: 'nhạc lofi chill cà phê thư giãn lái xe',
    podcast: 'podcast viet cetacean hieu tv',
    kids: 'bài hát thiếu nhi vui nhộn',
  };

  const query = categoryQueries[category] || 'nhạc hay nghe trên ô tô';
  const redirectUrl = new URL('/api/search', request.url);
  redirectUrl.searchParams.set('q', query);

  return fetch(redirectUrl.toString(), {
    headers: request.headers,
  });
}
