// CarHub VF5 Lightweight Offline App-Shell Service Worker
// - Cache-first cho /assets/* (Vite hashed immutable bundles)
// - Network-first kèm dự phòng cache cho trang điều hướng (/) khi đi qua hầm chui / mất 4G
// - TUYỆT ĐỐI không can thiệp /api/* hay luồng media (HLS / MP4 / Range 206 / YouTube)

const CACHE_NAME = 'carhub-vf5-shell-v2';
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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Chỉ xử lý cùng domain và bỏ qua hoàn toàn /api/*
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname === '/sw.js') return;

  // 1) Vite immutable hashed assets -> Cache-first
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        });
      })
    );
    return;
  }

  // 2) Điều hướng trang SPA -> Network-first, mất sóng rơi về App Shell đã cache
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put('/', clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match('/') || caches.match('/index.html'))
    );
  }
});
