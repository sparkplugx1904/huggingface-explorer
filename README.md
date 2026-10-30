# 🤗 HuggingStudio

> Web file manager untuk repositori Hugging Face (Model, Dataset, Space) dengan pengalaman ala Google Drive dipadu penjelajah berkas GitHub. Sepenuhnya serverless, berjalan langsung di browser tanpa backend perantara.

---

## 🚀 Fitur Tahap (a): Kerangka, Autentikasi & Daftar Repositori

- **Autentikasi Aman (OAuth PKCE)**: Login resmi via Hugging Face tanpa rahasia klien (*public app*). Token disimpan secara aman di memori JS (`sessionStorage` hanya sebagai fallback sesi agar refresh tidak logout).
- **Dukungan Tamu (Guest Mode)**: Pengunjung tanpa login tetap dapat menjelajahi repositori publik melalui URL `/:owner`.
- **Daftar Repo Lengkap**:
  - Pengalihan akun (*Account switcher*) antara profil pribadi dan organisasi.
  - Filter tipe (*All*, *Model*, *Dataset*, *Space*).
  - Pencarian instan sisi klien dengan *debounce*.
  - Tampilan fleksibel: *Grid* kartu modern atau *List* ringkas.
  - Indikator visibilitas: Lencana *Private* untuk repositori privat.
  - Paginasi terkontrol (30 item per batch dengan tombol *Muat lebih banyak*).
- **Desain Khusus Ponsel & Layar Sentuh**:
  - Target sentuh minimal 44px.
  - Drawer navigasi samping di perangkat seluler dengan penutup backdrop/Escape.
  - Skala fluida (`clamp()`, `min()`, `max()`, `rem`) tanpa ukuran piksel kaku.
  - Mode Gelap & Terang adaptif mengikuti preferensi sistem atau tombol pengalih manual.
- **Dukungan Multi-bahasa (i18n)**: Bahasa Indonesia dan English (otomatis mendeteksi bahasa peramban).

---

## 🛠️ Panduan Pengaturan Hugging Face OAuth App

1. Kunjungi [huggingface.co/settings/applications/new](https://huggingface.co/settings/applications/new).
2. Isi informasi aplikasi:
   - **Application name**: `HuggingStudio`
   - **Homepage URL**: `https://huggingstudio.pages.dev`
3. **Penting**: Centang pilihan **Public app** (tanpa client secret).
4. Tambahkan **Redirect URIs**:
   - Pengembangan lokal: `http://localhost:5173/callback`
   - Produksi: `https://huggingstudio.pages.dev/callback`
5. Pilih **Scopes**:
   - `openid`
   - `profile`
   - `write-repos` (mencakup hak baca dan tulis)
6. Klik **Create application**, lalu salin **Client ID** yang dihasilkan.

---

## ⚙️ Menjalankan Secara Lokal

1. Salin berkas lingkungan:
   ```bash
   cp .env.example .env
   ```
2. Buka berkas `.env` dan masukkan Client ID Hugging Face Anda:
   ```env
   VITE_HF_CLIENT_ID=client_id_anda_di_sini
   ```
3. Pasang dependensi dan jalankan server pengembangan:
   ```bash
   npm install
   npm run dev
   ```
4. Buka peramban di `http://localhost:5173`.

---

## 📦 Build dan Deploy ke Cloudflare Pages

### Build Produksi
```bash
npm run build
```
Hasil build statis akan berada di folder `dist/`.

### Deploy Manual via Wrangler
```bash
npx wrangler pages deploy dist --project-name huggingstudio
```

---

## ⚠️ Batasan yang Diketahui

1. **Konfirmasi Tutup Tab / Refresh (`beforeunload`)**:
   - Browser modern membatasi pesan kustom pada *event* `beforeunload`. Dialog peringatan kustom hanya dapat ditampilkan untuk navigasi internal (SPA); saat menutup tab atau melakukan *refresh*, peramban akan memunculkan dialog konfirmasi bawaan sistem.
2. **Kapasitas Ukuran File**:
   - File besar di atas 10 MB pada Hugging Face Hub memerlukan alur Git LFS / Xet dengan perhitungan hash SHA-256 dan upload langsung ke bucket S3 presigned URL Hugging Face. Browser dibatasi oleh memori perangkat saat memproses berkas multi-gigabyte.

---

## 🗺️ Roadmap & Fitur yang Ditunda

Sesuai urutan pengembangan bertahap:
- [x] **Tahap (a)**: Kerangka dasar, OAuth PKCE, Token Store, State Store, App Shell, Halaman Login, Halaman Daftar Repo + Filter + Switcher Organisasi.
- [ ] **Tahap (b)**: File manager (tree API, upload folder/drag-drop, operasi file/folder, sistem perubahan tertunda *staged*, commit gabungan dengan pesan otomatis & diff, modal dialog kustom).
- [ ] **Tahap (c)**: Pratinjau berkas kaya multi-format (lazy-loaded viewers: kode/syntax highlight, Markdown, virtual CSV/Excel table, PDF, Media streaming Range, 3D, Safetensors).
- [ ] **Tahap (d)**: Riwayat commit repo/berkas, *revert* commit baru, daftar "Baru Dihapus".
- [ ] **Tahap (e)**: Polesan animasi, shortcut keyboard lanjutan, audit aksesibilitas (WCAG 2.1 AA).

---

## ⚖️ Penafian

HuggingStudio adalah proyek independen dan bukan produk resmi dari Hugging Face Inc.
