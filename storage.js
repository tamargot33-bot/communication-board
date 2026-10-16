// אחסון: IndexedDB לנתונים גדולים (לוח, תמונות, קבצי קול), localStorage להגדרות קטנות.
// כל קריאה וכתיבה עטופה כך שכשל באחסון לא יקריס את האפליקציה.

const Store = (() => {
  const DB_NAME = "comboard";
  const STORE = "kv";
  let dbPromise = null;

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  async function run(mode, makeRequest) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = makeRequest(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  return {
    get: (key) => run("readonly", (s) => s.get(key)),
    set: (key, value) => run("readwrite", (s) => s.put(value, key)),
    del: (key) => run("readwrite", (s) => s.delete(key)),
  };
})();

const Prefs = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem("comboard:" + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem("comboard:" + key, JSON.stringify(value));
    } catch {
      /* אחסון חסום – מתעלמים */
    }
  },
};
