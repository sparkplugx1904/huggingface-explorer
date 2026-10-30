// ──────────────────────────────────────────────────────────────────────────
// src/api/media-cache.ts — "Media Vault" cache media terunduh (Hemat Kuota)
//
// Filosofi: memori RAM browser itu volatil — begitu tab ditutup, semua Blob di
// memori hilang dan user mengunduh ulang berkas yang sama (boros kuota).
// Vault ini menyimpan salinan berkasa yang SUDAH pernah diunduh ke IndexedDB:
//   • Tahan refresh   : halaman di-refresh → ambil dari vault, bukan jaringan.
//   • Tahan tab close : IndexedDB bertahan di disk browser (bukan RAM).
//   • Kunci SHA-256   : nama kunci = hash alamat berkas (tidak membocorkan
//                       path repo secara harfiah).
//   • Terenkripsi     : isi berkas di-seal AES-GCM-256 (kunci acak 1x per
//                       origin); data tidak tersimpan sebagai berkas polosan.
//   • Usia caduk      : TTL 8 jam + anggaran total 512 MB (LRU, ter-umur
//                       dihapus lebih dulu) → tidak menumpuk sampah di disk.
//
// Heapsampling (tumpabilitas garbage): JS tidak bisa berjalan saat seluruh
// tab ditutup — karenanya pembersihan berlapis:
//   1. purge harian saat get (entri kadaluwarsa langsung dihapus on-read),
//   2. purge + LRU saat aplikasi boot (tab mana pun yang dibuka membongkar),
//   3. interval 30 menit selama ada tab terbuka,
//   4. budget LRU mencegah tumpukan melebihi batas.
// Saat SEMUA tab tutup: tidak ada byte RAM yang tertahan (IndexedDB = disk).
// ──────────────────────────────────────────────────────────────────────────

/** Durasi simpan satu entri vault: 8 jam. */
export const MEDIA_VAULT_TTL_MS = 8 * 60 * 60 * 1000;

/** Anggaran total ruang disk yang boleh dipakai vault: 512 MB (LRU). */
export const MEDIA_VAULT_BUDGET_BYTES = 512 * 1024 * 1024;

/** Ukuran maksimal satu berkas yang layak diunduh utuh ke vault: 48 MB. */
export const MEDIA_VAULT_MAX_CACHEABLE_BYTES = 48 * 1024 * 1024;

const DB_NAME = 'huggingstudio-media-vault';
const DB_VERSION = 1;
const STORE = 'entries';
const STORE_AT_INDEX = 'storedAt';
const LS_KEY_NAME = 'hs:vault:key';

interface VaultRecord {
  id: string;
  /** IV GCM (null → tersimpan polos bila WebCrypto tak tersedia) */
  iv: ArrayBuffer | null;
  /** Isi berkas (bytes hasil enkripsi, atau dapat asli di fallback) */
  data: ArrayBuffer;
  mime: string;
  /** Stempel waktu penyimpanan (ms epoch) */
  storedAt: number;
  /** Ukuran asli (byte, pra-enkripsi) untuk penghitung anggaran */
  bytes: number;
}

// ── Koneksi IndexedDB ──────────────────────────────────────────────────────

let dbPromise: Promise<IDBDatabase> | null = null;

function openVaultDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB tidak tersedia'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex(STORE_AT_INDEX, STORE_AT_INDEX, { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Gagal membuka Media Vault'));
  });
  return dbPromise;
}

async function withVaultStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest
): Promise<T> {
  const db = await openVaultDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    // Resolve lewat req.onsuccess — req.result dipedom di sisi browser bisa
    // terlambat/undefined di beberapa engine bila dibaca pada tx.oncomplete.
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error ?? tx.error ?? new Error('Media Vault gagal'));
    tx.onerror = () => reject(tx.error ?? new Error('Media Vault gagal'));
    tx.onabort = () => reject(tx.error ?? new Error('Media Vault dibatalkan'));
  });
}

// ── Kunci Entri: SHA-256 dari identitas berkas ────────────────────────────

/** Hash identitas → hex (SHA-256; fallback hash deterministik tanpa WebCrypto). */
async function identityDigest(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    const view = new Uint8Array(digest);
    let hex = '';
    for (const b of view) hex += b.toString(16).padStart(2, '0');
    return hex;
  }

  // Fallback deterministik (FNV-1a 64-bit) untuk lingkungan non-secure.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    h1 = (h1 ^ code) >>> 0;
    h1 = (h1 * 0x01000193) >>> 0;
    h2 = (h2 + code * (i + 1)) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/** Bangun kunci vault satu berkas (per bucket + repo + revisi + path). */
export async function mediaVaultKey(
  bucket: 'viewer' | 'thumb',
  repoType: string,
  repoId: string,
  revision: string,
  path: string
): Promise<string> {
  return identityDigest(`${bucket}|${repoType}|${repoId}|${revision}|${path}`);
}

// ── Enkripsi Isi (AES-GCM 256; kunci per-origin persist di localStorage) ──

let vaultKeyPromise: Promise<CryptoKey> | null = null;
let cryptoAvailable = typeof crypto !== 'undefined' && crypto.subtle !== undefined;

function generateRandomBytes(length: number): Uint8Array {
  if (crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint8Array(length));
  }
  const arr = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    arr[i] = Math.floor(Math.random() * 256);
  }
  return arr;
}

async function loadOrCreateVaultKey(): Promise<CryptoKey> {
  try {
    const stored = localStorage.getItem(LS_KEY_NAME);
    if (stored) {
      const raw = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
      return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    }
    const fresh = generateRandomBytes(32);
    localStorage.setItem(LS_KEY_NAME, btoa(String.fromCharCode(...fresh)));
    return await crypto.subtle.importKey(
      'raw',
      fresh.buffer as ArrayBuffer,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
  } catch {
    return Promise.reject(new Error('Vault key gagal dibuat'));
  }
}

async function getVaultKey(): Promise<CryptoKey | null> {
  if (!cryptoAvailable) return null;
  if (!vaultKeyPromise) vaultKeyPromise = loadOrCreateVaultKey();
  try {
    return await vaultKeyPromise;
  } catch {
    cryptoAvailable = false;
    return null;
  }
}

// ── API Utama Vault ────────────────────────────────────────────────────────

/**
 * Ambil isi berkas dari vault. Mengembalikan `null` bila tidak ada / sudah
 * lewat 8 jam (yang kadaluwarsa ikut dihapus on-read).
 */
export async function getFromMediaVault(key: string): Promise<Blob | null> {
  try {
    const rec = (await withVaultStore<VaultRecord | undefined>('readonly', (store) =>
      store.get(key)
    )) as VaultRecord | undefined;

    if (!rec) return null;

    // Garbage collection tepat: entri lebih tua dari TTL dihapus & dianggap tak pernah ada
    if (Date.now() - rec.storedAt > MEDIA_VAULT_TTL_MS) {
      try {
        await withVaultStore('readwrite', (store) => store.delete(key));
      } catch {
        // abaikan kegagalan purge
      }
      return null;
    }

    // Dekripsi bila tersimpan ter-seal
    if (rec.iv) {
      const vaultKey = await getVaultKey();
      if (vaultKey) {
        const plain = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: rec.iv },
          vaultKey,
          rec.data
        );
        return new Blob([plain], { type: rec.mime });
      }
      // Bila kunci hilang, data ter-seal tak lagi terbaca → buang
      await withVaultStore('readwrite', (store) => store.delete(key)).catch(() => undefined);
      return null;
    }

    return new Blob([rec.data], { type: rec.mime });
  } catch {
    return null;
  }
}

/**
 * Simpan blob ke vault (di-seal AES-GCM bila WebCrypto tersedia).
 * Amannya selalu fire-and-forget dari pemanggil; kegagalan tak mengganggu UI.
 */
export async function putToMediaVault(key: string, blob: Blob): Promise<void> {
  try {
    const plain = await blob.arrayBuffer();
    const vaultKey = await getVaultKey();
    let iv: ArrayBuffer | null = null;
    let data: ArrayBuffer = plain;

    if (vaultKey) {
      iv = generateRandomBytes(12).buffer as ArrayBuffer;
      data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, vaultKey, plain);
    }

    const rec: VaultRecord = {
      id: key,
      iv,
      data,
      mime: blob.type,
      storedAt: Date.now(),
      bytes: blob.size,
    };

    try {
      await withVaultStore('readwrite', (store) => store.put(rec));
    } catch (err: unknown) {
      // Kuota penuh → LRU sweep dulu lalu coba sekali lagi
      const isQuota = typeof err === 'object' && err !== null && 'name' in err
        && String((err as { name?: unknown }).name).toLowerCase().includes('quota');
      if (isQuota) {
        await pruneVaultBudget().catch(() => undefined);
        await withVaultStore('readwrite', (store) => store.put(rec));
      } else {
        throw err;
      }
    }
  } catch {
    // Vault bersifat opportunistic; kegagalan simpan diabaikan
  }
}

/**
 * Hapus semua entri yang umurnya lewat TTL. Dipanggil saat boot, interval,
 * dan dicek spaced-out agar tidak berat (cursor + index storedAt).
 */
export async function purgeExpiredMediaVault(): Promise<number> {
  const cutoff = Date.now() - MEDIA_VAULT_TTL_MS;
  let purged = 0;
  try {
    const db = await openVaultDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const index = store.index(STORE_AT_INDEX);
      const cursorReq = index.openCursor(IDBKeyRange.upperBound(cutoff));
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return;
        void cursor.delete();
        purged++;
        void cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('purge gagal'));
    });
  } catch {
    // abaikan
  }
  return purged;
}

/**
 * Anggaran LRU: bila total byte melebihi 512 MB, hapus entri ter-umur
 * (stempel waktu tertua) sampai kembali muat.
 */
export async function pruneVaultBudget(): Promise<number> {
  let pruned = 0;
  try {
    const db = await openVaultDb();
    const rows = await new Promise<VaultRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).index(STORE_AT_INDEX).openCursor();
      const collected: VaultRecord[] = [];
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        collected.push(cursor.value as VaultRecord);
        void cursor.continue();
      };
      tx.oncomplete = () => resolve(collected);
      tx.onerror = () => reject(tx.error ?? new Error('audit gagal'));
    });

    let total = rows.reduce((sum: number, r: VaultRecord) => sum + r.bytes, 0);
    if (total <= MEDIA_VAULT_BUDGET_BYTES) return 0;

    const ids: string[] = [];
    for (const row of rows) {
      if (total <= MEDIA_VAULT_BUDGET_BYTES) break;
      total -= row.bytes;
      ids.push(row.id);
    }

    for (const id of ids) {
      try {
        await withVaultStore('readwrite', (store) => store.delete(id));
        pruned++;
      } catch {
        break;
      }
    }
  } catch {
    // abaikan
  }
  return pruned;
}

/** Total byte yang sedang ditempati vault (untuk telemetri UI bila perlu). */
export async function mediaVaultUsage(): Promise<{ entries: number; bytes: number }> {
  try {
    const all = (await withVaultStore<unknown[]>('readonly', (store) => store.getAll())) as VaultRecord[];
    return { entries: all.length, bytes: all.reduce((sum, r) => sum + r.bytes, 0) };
  } catch {
    return { entries: 0, bytes: 0 };
  }
}

/** Bersihkan seluruh vault (pemanggil manual, mis. menu pengaturan). */
export async function clearMediaVault(): Promise<void> {
  try {
    await withVaultStore('readwrite', (store) => store.clear());
  } catch {
    // abaikan
  }
}

// ── Orkestrator GC ─────────────────────────────────────────────────────────

let gcStarted = false;

/**
 * Nyalakan siklus garbage collection vault:
 *   1. purge + LRU laporan sekali saat app boot (semua tab sama-sama jalan),
 *   2. interval 30 menit selama minimal satu tab terbuka.
 * Saat semua tab ditutup tidak ada RAM yang tertahan — sisa kadaluwarsa di
 * disk dibongkar otomatis oleh boot berikutnya.
 */
export function initMediaVaultGc(): void {
  if (gcStarted) return;
  gcStarted = true;

  const sweep = (): void => {
    void purgeExpiredMediaVault()
      .then(() => pruneVaultBudget())
      .catch(() => undefined);
  };

  setTimeout(sweep, 1500);
  setInterval(sweep, 30 * 60 * 1000);
}
