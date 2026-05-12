/**
 * IndexedDB-backed store for sandbox session thumbnails.
 *
 * Why this exists: thumbnails are 50–80 KB JPEG screenshots of the
 * 3D sandbox. Stuffing them inline in the `sketchbot.sessions.v1.*`
 * localStorage array means every save reserializes the *whole* list
 * and bumps total payload toward localStorage's ~5 MB origin cap. 60
 * sessions × 70 KB ≈ 4 MB just in thumbnails. IDB stores Blobs natively
 * (no base64 overhead), supports per-key writes (no whole-array
 * rewrite), and gives us multi-hundred-MB quota.
 *
 * Why not migrate the whole SavedSession out: metadata (name, chat,
 * scene objects, program) is small, hot-read on every home screen
 * render, and benefits from localStorage's synchronous reads. Only the
 * binary asset belongs in IDB.
 *
 * Keying: sessionId → Blob. One object store, no indexes (we never
 * need to query by anything other than id).
 *
 * Cleanup: `deleteSession` in session-storage.ts calls deleteThumbnail
 * so we don't accumulate orphans. A defensive `purgeOrphans` is
 * exported but not currently scheduled — the per-delete path is enough
 * for normal use.
 */

const DB_NAME = 'sketchbot';
const DB_VERSION = 1;
const STORE = 'thumbnails';

let _dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    // SSR or a browser without IDB — return a rejected promise so callers
    // fall through to the synchronous fallbacks (svg / data url inline).
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'));
  });
  return _dbPromise;
}

/** Convert a `data:image/...;base64,...` URL into a Blob without using
 *  `fetch()`, which doesn't work for `data:` URLs in some environments
 *  (Electron renderer with strict CSP). Pure decoder, synchronous. */
function dataUrlToBlob(dataUrl: string): Blob | null {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!m) return null;
  const mime = m[1];
  const b64  = m[2];
  try {
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; ++i) buf[i] = bin.charCodeAt(i);
    return new Blob([buf], { type: mime });
  } catch {
    return null;
  }
}

/** Store a thumbnail. Accepts either a Blob (preferred) or a data URL
 *  (converted in-place — kept for ergonomic callsites that already
 *  produced a data URL via canvas.toDataURL). Idempotent. */
export async function setThumbnail(sessionId: string, source: Blob | string): Promise<void> {
  const blob = typeof source === 'string' ? dataUrlToBlob(source) : source;
  if (!blob) return;
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return; // IDB not available; caller still has the data URL inline
  }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, sessionId);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error ?? new Error('IDB write failed'));
    tx.onabort    = () => reject(tx.error ?? new Error('IDB tx aborted'));
  });
}

/** Read a thumbnail. Returns null when the session has no captured
 *  screenshot yet, when IDB is unavailable, or on any error — callers
 *  fall back to the `thumbnailSvg` (legacy 2D) field on SavedSession. */
export async function getThumbnail(sessionId: string): Promise<Blob | null> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return null;
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(sessionId);
    req.onsuccess = () => {
      const v = req.result;
      resolve(v instanceof Blob ? v : null);
    };
    req.onerror = () => resolve(null);
  });
}

/** Best-effort delete. Called by session-storage.deleteSession so
 *  removing a session also frees its thumbnail. Silent on failure. */
export async function deleteThumbnail(sessionId: string): Promise<void> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return;
  }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(sessionId);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => resolve();
    tx.onabort    = () => resolve();
  });
}

/** Sweep IDB and remove thumbnails whose sessionId is no longer present
 *  in the provided live-id set. Not on a schedule — call this from a
 *  startup or "low priority" path if you want belt-and-braces cleanup.
 *  Safe to no-op if IDB unavailable. */
export async function purgeOrphans(liveSessionIds: ReadonlySet<string>): Promise<void> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return;
  }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      const key = String(cursor.key);
      if (!liveSessionIds.has(key)) cursor.delete();
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror    = () => resolve();
    tx.onabort    = () => resolve();
  });
}
