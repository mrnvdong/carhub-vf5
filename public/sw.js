// CarHub VF5 Lightweight Offline App-Shell Service Worker (v3)
// - Cache-first cho /assets/* CHỈ khi đúng Content-Type JS/CSS/font/image (chặn cache nhầm SPA fallback text/html!)
// - Network-first kèm timeout 4s & dự phòng App Shell cho trang điều hướng (/) khi đi qua hầm chui / mất 4G
// - TUYỆT ĐỐI không can thiệp /api/* hay luồng media (HLS / MP4 / Range 206 / YouTube)

const CACHE_NAME = 'carhub-vf5-shell-v3';
const CORE_URLS = ['/', '/index.html', '/manifest.json', '/car-icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_URLS))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isCacheableAssetResponse(res) {
  if (!res || !res.ok) return false;
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  // TUYỆT ĐỐI không cache HTML SPA fallback làm file JS/CSS trong /assets/
  if (ct.includes('text/html')) return false;
  return (
    ct.includes('javascript') ||
    ct.includes('text/css') ||
    ct.includes('font/') ||
    ct.includes('image/') ||
    ct.includes('application/wasm')
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Chỉ xử lý cùng domain và bỏ qua hoàn toàn /api/*
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname === '/sw.js') return;

  // 1) Vite immutable hashed assets -> Cache-first (chống cache poisoning HTML)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached && isCacheableAssetResponse(cached)) return cached;
        return fetch(req).then((res) => {
          if (isCacheableAssetResponse(res)) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        });
      })
    );
    return;
  }

  // 2) Điều hướng trang SPA -> Network-first có timeout 4s, mất sóng rơi về App Shell đã cache
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        try {
          const res = await fetch(req, { signal: controller.signal });
          clearTimeout(timer);
          const ct = (res.headers.get('content-type') || '').toLowerCase();
          if (res && res.ok && ct.includes('text/html') && (url.pathname === '/' || url.pathname === '/index.html')) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put('/', clone)).catch(() => {});
          }
          return res;
        } catch {
          clearTimeout(timer);
          const cachedRoot = await caches.match('/');
          if (cachedRoot) return cachedRoot;
          const cachedIndex = await caches.match('/index.html');
          if (cachedIndex) return cachedIndex;
          return new Response('CarHub VF5 đang ngoại tuyến. Vui lòng thử lại khi có mạng.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }
      })()
    );
  }
});
