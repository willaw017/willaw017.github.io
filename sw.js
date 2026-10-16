const CACHE_NAME = "PRIVATE_ALMANAC_V8";
const CACHE_PREFIX = "PRIVATE_ALMANAC_";
const PRECACHE = [
  "./",
  "./index.html",
  "./styles.css",
  "./runtime-config.js",
  "./app.js",
  "./modules/api.js",
  "./modules/data.js",
  "./modules/realtime-state.js",
  "./modules/realtime-views.js",
  "./modules/router.js",
  "./modules/state.js",
  "./modules/views.js",
  "./data/profile-summary.json",
  "./manifest.webmanifest",
  "./icons/icon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

async function offlineFirstVisit() {
  return new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>首次打开需要联网</title><style>body{margin:0;padding:40px 24px;background:#f4eedf;color:#29231f;font:16px/1.7 system-ui}main{max-width:32rem;margin:auto}h1{font-family:serif}</style><main><h1>首次打开需要联网</h1><p>连接网络并成功打开一次后，已访问的私人摘要可以离线阅读。</p></main></html>`, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

async function runtimeConfigNetworkFirst(request, cache) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) ?? new Response(
      'globalThis.__JIANSHI_CONFIG__ = Object.freeze({\n  apiBase: ""\n});\n',
      { headers: { "Content-Type": "text/javascript; charset=utf-8" } }
    );
  }
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    if (url.pathname.endsWith("/runtime-config.js")) {
      return runtimeConfigNetworkFirst(request, cache);
    }
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;

    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch {
      if (request.mode === "navigate") {
        return (await cache.match("./index.html")) ?? offlineFirstVisit();
      }
      return new Response("离线状态下无法读取此资源", { status: 503 });
    }
  })());
});
