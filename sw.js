// Service worker: מאפשר עבודה אופליין. קבצי האפליקציה נשמרים בטעינה הראשונה.
// כשיש רשת תמיד מביאים את הגרסה העדכנית מהשרת, וה-cache משמש רק כגיבוי אופליין.
const CACHE = "comboard-v5";
const ASSETS = [
  "./",
  "index.html",
  "styles.css",
  "storage.js",
  "speech.js",
  "app.js",
  "default-board.json",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  // cache: "reload" עוקף את ה-cache של הדפדפן, אחרת נשמרות גרסאות ישנות של הקבצים
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS.map((url) => new Request(url, { cache: "reload" }))))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // השרת המקומי: הקראה ובדיקת חיים לא נשמרים במטמון
  const path = new URL(e.request.url).pathname;
  if (path.endsWith("/tts") || path.endsWith("/health")) return;
  e.respondWith(
    fetch(e.request, { cache: "no-cache" })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() =>
        caches
          .match(e.request)
          .then((cached) => cached || (e.request.mode === "navigate" ? caches.match("index.html") : Response.error()))
      )
  );
});
