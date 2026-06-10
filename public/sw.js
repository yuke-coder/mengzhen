const CACHE_VERSION = 'v9';
const STATIC_CACHE = 'mengzhen-static-' + CACHE_VERSION;
const AUDIO_CACHE = 'mengzhen-audio-' + CACHE_VERSION;
const API_CACHE = 'mengzhen-api-' + CACHE_VERSION;
const IMAGE_CACHE = 'mengzhen-images-' + CACHE_VERSION;

const CRITICAL_ASSETS = [
  '/',
  '/settings',
  '/manifest.json',
  '/favicon.png',
  '/logo.png',
];

const PREFETCH_ASSETS = [
  '/templates',
];

const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000;
const HTML_MAX_AGE = 24 * 60 * 60 * 1000;
const API_MAX_AGE = 5 * 60 * 1000;
const IMAGE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

const SUPABASE_HOSTNAMES = ['supabase', 'supabase2', 'aidap-global'];

const MAX_API_CACHE_ENTRIES = 50;
const MAX_IMAGE_CACHE_ENTRIES = 100;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      for (const url of CRITICAL_ASSETS) {
        try {
          await cache.add(new Request(url, { cache: 'reload' }));
        } catch (e) {
          console.warn('[SW] 预缓存失败:', url, e);
        }
      }
      self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => !name.includes(CACHE_VERSION))
          .map((name) => {
            console.log('[SW] 删除旧缓存:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      if (self.registration.navigationPreload) {
        return self.registration.navigationPreload.enable();
      }
    }).then(() => {
      return self.clients.claim();
    })
  );
});

function isCacheFresh(cached, maxAge) {
  if (!cached) return false;
  const dateHeader = cached.headers.get('date');
  if (!dateHeader) return true;
  const cacheTime = new Date(dateHeader).getTime();
  return (Date.now() - cacheTime) < (maxAge || MAX_CACHE_AGE);
}

function isSupabaseRequest(url) {
  return SUPABASE_HOSTNAMES.some(h => url.hostname.includes(h));
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    const deleteCount = keys.length - maxEntries;
    await Promise.all(keys.slice(0, deleteCount).map(key => cache.delete(key)));
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;

  if (isSupabaseRequest(url)) return;

  if (url.pathname.startsWith('/api/')) {
    // 认证相关 API 永远不缓存
    if (url.pathname.startsWith('/api/auth/')) {
      return;
    }

    if (url.pathname.includes('/storage/') || url.pathname.includes('/audio/proxy')) {
      return;
    }

    event.respondWith(
      (async () => {
        const cached = await caches.match(event.request);
        if (cached && isCacheFresh(cached, API_MAX_AGE)) return cached;

        try {
          const preloadResponse = await event.preloadResponse;
          if (preloadResponse) return preloadResponse;

          const response = await fetch(event.request, { signal: AbortSignal.timeout(8000) });
          if (response.ok && response.status < 300) {
            const clone = response.clone();
            caches.open(API_CACHE).then(async (cache) => {
              await cache.put(event.request, clone);
              await trimCache(API_CACHE, MAX_API_CACHE_ENTRIES);
            });
          }
          return response;
        } catch () {
          if (cached) return cached;
          return new Response(JSON.stringify({ offline: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      })()
    );
    return;
  }

  if (event.request.url.match(/\.(mp3|wav|flac|ogg|m4a|aac)$/i) && url.origin === location.origin) {
    event.respondWith(
      caches.open(AUDIO_CACHE).then((cache) => {
        return cache.match(event.request).then((cached) => {
          if (cached && isCacheFresh(cached)) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(() => cached || new Response('', { status: 503 }));
        });
      })
    );
    return;
  }

  if (url.origin !== location.origin) {
    if (event.request.url.match(/\.(png|jpg|jpeg|gif|svg|webp|avif|woff2?|ttf|eot)$/i)) {
      event.respondWith(
        caches.open(IMAGE_CACHE).then(async (cache) => {
          const cached = await cache.match(event.request);
          if (cached && isCacheFresh(cached, IMAGE_MAX_AGE)) return cached;

          try {
            const response = await fetch(event.request, { signal: AbortSignal.timeout(8000) });
            if (response.ok) {
              await cache.put(event.request, response.clone());
              await trimCache(IMAGE_CACHE, MAX_IMAGE_CACHE_ENTRIES);
            }
            return response;
          } catch () {
            if (cached) return cached;
            return new Response('', { status: 200 });
          }
        })
      );
      return;
    }

    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached && isCacheFresh(cached)) return cached;
        return fetch(event.request, { signal: AbortSignal.timeout(5000) }).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        }).catch(() => {
          if (cached) return cached;
          return new Response('', { status: 200 });
        });
      })
    );
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const preloadResponse = await event.preloadResponse;
          if (preloadResponse && preloadResponse.ok) {
            const clone = preloadResponse.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(event.request, clone);
            });
            return preloadResponse;
          }

          const response = await fetch(event.request, { signal: AbortSignal.timeout(6000) });
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        } catch () {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const homePage = await caches.match('/');
          if (homePage) return homePage;
          return new Response('Offline', {
            status: 503,
            headers: { 'Content-Type': 'text/html' }
          });
        }
      })()
    );
    return;
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        }).catch(() => {
          return new Response('', { status: 200 });
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        if (event.request.url.match(/\.(js|css|png|jpg|jpeg|gif|svg|woff2?|ttf|eot)$/i)) {
          fetch(event.request).then((response) => {
            if (response.ok) {
              caches.open(STATIC_CACHE).then((cache) => {
                cache.put(event.request, response);
              });
            }
          }).catch(() => {});
        }
        return cached;
      }

      return fetch(event.request).then((response) => {
        if (response.ok && event.request.url.match(/\.(js|css|png|jpg|jpeg|gif|svg|woff2?|ttf|eot)$/i)) {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(() => {
        return new Response('', { status: 200 });
      });
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CACHE_URLS') {
    caches.open(STATIC_CACHE).then((cache) => {
      Promise.all(
        event.data.urls.map((url) =>
          cache.add(url).catch(() => null)
        )
      );
    });
  }

  if (event.data && event.data.type === 'PREFETCH') {
    caches.open(STATIC_CACHE).then(async (cache) => {
      for (const url of PREFETCH_ASSETS) {
        try {
          await cache.add(new Request(url, { cache: 'reload' }));
        } catch (e) {
          console.warn('[SW] 预获取失败:', url, e);
        }
      }
    });
  }

  if (event.data && event.data.type === 'CLEAR_OLD_CACHES') {
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => !name.includes(CACHE_VERSION))
          .map((name) => caches.delete(name))
      );
    });
  }

  if (event.data && event.data.type === 'TRIM_CACHES') {
    Promise.all([
      trimCache(API_CACHE, MAX_API_CACHE_ENTRIES),
      trimCache(IMAGE_CACHE, MAX_IMAGE_CACHE_ENTRIES),
    ]);
  }
});
