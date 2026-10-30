# HuggingStudio 2.0 — Spesifikasi Redesign ("Obsidian")

> Reimagination, bukan iterasi. Redesign ini dieksekusi langsung sebagai kode produksi di `src/styles/*` + `src/ui/components/command-palette.ts`, dengan strategi **semantic-token-first** dan **bridge alias** agar seluruh markup TS yang sudah hidup tidak disentuh — semua permukaan langsung berpindah ke bahasa visual baru.

**Satu kalimat**: *Warp terminal bertemu Figma, dibangun di atas Hugging Face Hub* — alat profesional kelas satu yang kebetulan berjalan di browser.

---

## 0. Filosofi Redesign

| Prinsip | Implementasi |
|---|---|
| **Density adalah layanan** | Body 13px, row 32–40px, header 48px. Informasi per-viewport naik ~30% tanpa terasa sempit. |
| **Permukaan berlayer, bukan berbayang** | Canvas → surface → raised → overlay (4 tingkat lukisan); separasi via border 1px + elevation hanya pada elemen mengambang. |
| **Amber hanya aksen** | Marker aktif, badge count, CTA commit, node timeline — tidak pernah jadi background dominan. |
| **Zero emoji, zero pill** | Ikon SVG inline 15–20px; radius per-tipe komponen (4/6/8/10), `9999px` hanya avatar/dot. |
| **Motion fungsional** | 120ms micro (hover/fokus), 180ms standar, 260ms ease-out untuk panel transform. Trade: nol animasi dekoratif. |

### Strategi migrasi aman
- `tokens.css` menulis token semantik baru (`--surface`, `--surface-raised`, `--surface-overlay`, `--border`, `--border-focus`, `--ring`, `--text`, `--text-muted`, `--accent`, `--success`, `--warning`, `--error`, `--c1`..`--c6`) lalu **memetakan seluruh alias legacy `--hs-*`** ke token itu. Hasilnya: CSS halaman yang tidak direwrite (mis. viewers.css) ikut reskin otomatis, sementara CSS baru bebas pakai nama murni.
- Dark-mode menjadi default produk (bukan `prefers-color-scheme`): theme.ts kini `stored ?? 'dark'`; `index.html` menyinkronkan `data-theme` pra-paint (anti-flash) + preboot obsidian + font **Inter**.

---

## 1. Design System Spec

### 1.1 Token Warna (Obsidian Dark / Light secondary)

| Token | Dark | Light | Peran |
|---|---|---|---|
| `--canvas` | `#05070d` | `#f7f8fb` | Latar aplikasi paling dalam |
| `--surface` | `#0a0f19` | `#ffffff` | Panel: rail, header, kartu, baris |
| `--surface-raised` | `#101725` | `#f3f5f9` | Input, hover row, segmented |
| `--surface-overlay` | `#151d30` | `#ffffff` | Modal, palette, dropdown |
| `--surface-hover` | `#121b2c` | `#f1f4f9` | State hover |
| `--border` | `rgba(148,158,184,.11)` | `#e4e8f0` | Border 1px bawaan |
| `--border-strong` | `rgba(148,158,184,.22)` | `#d2d8e4` | Dropdown/modal, hover input |
| `--border-focus` | `rgba(245,158,11,.55)` | `rgba(180,83,9,.6)` | Border input aktif |
| `--ring` | `0 0 0 3px rgba(245,158,11,.22)` | …9% | Ring fokus standar |
| `--text` / `--text-muted` / `--text-subtle` | `#e7ecf5` / `#98a1b5` / `#626b7d` | `#101726` / `#5a6478` / `#8b94a8` | Teks 3 tingkat |
| `--accent` / `--accent-hover` / `--accent-on` | `#f59e0b` / `#fbbf24` / `#180e03` | `#b45309` / `#92400e` / `#fff` | Amber hanya aksen; light memakai amber-700 demi kontras AA |
| `--accent-dim` / `--accent-glow` | 14% / 35% alpha | 12% / 35% | Tint ringan & glow CTA |
| `--success` / `--warning` / `--error` (+`-dim`,`-border`) | `#34d399` / `#fbbf24` / `#f87171` | `#059669` / `#b45309` / `#dc2626` | Status semantik |
| `--c1`…`--c6` | `#60a5fa` `#34d399` `#a78bfa` `#f472b6` `#fbbf24` `#7dd3fc` | versi gelap AA | Kategorikal: c1 model · c2 dataset · c3 space · c4 media · c5 LFS/arsip · c6 data. Dipakai badge, ikon tipe berkas, node diff, distribusi |

### 1.2 Tipografi (Inter + mono)

| Level | Ukuran | Bobot | Penggunaan |
|---|---|---|---|
| Label mikro | 11px (`--fs-11`) | 600, uppercase, tracking .06–.07em | Seksi rail, header kolom tabel, badge |
| Meta / mono | 12px | 400 | Path, SHA, ukuran, waktu (`--font-mono`, `tabular-nums`) |
| Body | 13px (`--fs-13`) | 400/500 | **Default seluruh UI** |
| Body-large / input | 14px | 400/500 | Input, judul kartu |
| Heading kecil | 16px | 600 | Judul modal, repo title |
| Heading halaman | 22px | 700, -0.02em | Page title |

Prinsip: **13px default** (bukan 16px web umum) karena target user tinggal di IDE. Semua angka meta mono `tabular-nums` agar kolom sejajar.

### 1.3 Spacing, Radius, Elevation, Motion

- **Spacing**: skala 4px (`--space-1..10` = 4…40px). Panel: 12–16px; row: 8–10px vertical; gap list: 1–2px (separasi via border, bukan margin).
- **Radius**: `--radius-sm` 4 (badge/chip/checkbox) · `--radius` 6 (tombol/input/menu item) · `--radius-lg` 8 (dropdown/palette item) · `--radius-xl` 10 (kartu/panel/modal/dock) · `--radius-full` hanya avatar & dot status. *Pill button = dihapus total.*
- **Elevation**: `--shadow-sm` (1px hairline, segmented active) · `--shadow-md` (hover kartu) · `--shadow-lg` (dropdown/panel float, + inset top 1px highlight `rgba(255,255,255,.04)`) · `--shadow-xl` (modal/palette/dock staged). Light mode memakai bayangan slate lembut, bukan hitam murni.
- **Motion**: `--dur-fast` 120ms (hover/fokus/slide micro) · `--dur-base` 180ms (toast/pop) · `--dur-slow` 260ms + `--ease-out cubic-bezier(.16,1,.3,1)` (drawer, dock, palette). `prefers-reduced-motion` mematikan semuanya.

### 1.4 Metrik Layout

```
Header   48px  (flat, border-bottom 1px, sticky)
Rail     256px desktop ≥768px · drawer 280px <768px (backdrop blur 3px)
Row file 32px (tree) · 40px (list file)
Canvas   full-bleed; halaman kontainer (repo-list/history) padding sendiri
```
Perubahan dari lama: header 52→48, sidebar 240→256, breakpoint drawer 900→**768** (mandate), `.app-main` padding 0 + fallback padding otomatis untuk halaman tanpa kontainer (`#hs-main > :not(.fm-layout):not(.repo-page):not(.history-container)`).

---

## 2. Komponen Inti

> CSS penuh ada di file terkait; di sini dicetak **inti CSS tiap komponen** + rationale. Semua markup memakai class yang sudah hidup di TS (kompatibilitas 100%).

### 2.1 App Shell (Header 48px)

**Rationale** — Header lama 52px dengan shadow, breadcrumb, dan tombol search yang "berpura-pura" input. Redesign: header jadi **strip tipis flat** (tanpa shadow — Linear-style), search diganti **Command Palette trigger** satu-satunya pintu navigasi global, breadcrumb dipindah ke konteks halaman. Header kompak memberi rasa "chrome aplikasi", bukan "website".

**HTML** (inti, dari `shell.ts`):
```html
<header class="app-header">
  <div class="header-inner">
    <div class="header-left">
      <button class="header-menu-btn">…</button>
      <a class="header-logo">Hugging<span class="header-logo-badge">Studio</span></a>
      <div class="header-breadcrumb">…</div>
    </div>
    <div class="header-center">
      <button class="header-search-indicator">
        [icon] <span class="header-search-text">Cari atau jalankan perintah…</span>
        <kbd class="header-search-kbd">Ctrl K</kbd>
      </button>
    </div>
    <div class="header-actions">[theme][help?][user]</div>
  </div>
</header>
```

**CSS** (inti):
```css
.app-header {
  position: sticky; height: var(--header-h);
  background-color: var(--surface);
  border-bottom: 1px solid var(--border); /* tanpa shadow */
}
.header-search-indicator {
  height: 32px; border-radius: var(--radius-lg);
  background: var(--surface-raised); border: 1px solid var(--border);
  color: var(--text-subtle);          /* terlihat marginal, bukan input */
}
.header-search-indicator:hover { border-color: var(--border-strong); color: var(--text-muted); }
```

**Interaksi** — Trigger klik atau ⌘K/Ctrl+K membuka palette; kbd chip menyesuaikan platform (⌘K/Ctrl K); hover tidak pernah mengubah tinggi header (no layout shift); fokus selalu pakai `--ring`.

**Apa yang dihapus vs lama** — (1) `box-shadow` header; (2) perilaku search lama (redirect `/explore` + fokus input halaman) — diganti palette; (3) tombol search dupleks di toolbar halaman; (4) tinggi 52px.

---

### 2.2 Repository Rail (Sidebar)

**Rationale** — Sidebar lama "daftar nama tanpa konteks". Rail baru membaca seperti **project navigator IDE**: seksi berheader (DATASETS/MODELS pemisah kuat — mandate), count badge tabular, **marker amber 2px** sebagai identitas posisi aktif (satu-satunya warna hangat di rail), lock kecil untuk private, org chip di bawah. Navigasi = skimming, bukan membaca.

**HTML**:
```html
<nav class="sidebar-nav">
  <a class="sidebar-section-header">Datasets <span class="sidebar-badge-count">12</span></a>
  <div class="sidebar-repo-list">
    <a class="sidebar-repo-item active">
      [icon][name <span class="sidebar-repo-lock">🔒→iconLock</span>]
    </a>…
  </div>
</nav>
```

**CSS** (inti):
```css
.sidebar-repo-item { min-height: 30px; border-radius: var(--radius); color: var(--text-muted); }
.sidebar-repo-item.active { background: var(--surface-hover); color: var(--text); }
.sidebar-repo-item.active::before {           /* signature amber marker */
  content: ''; position: absolute; left: 0; top: 5px; bottom: 5px;
  width: 2px; border-radius: var(--radius-full); background: var(--accent);
}
.sidebar-section-header {
  font-size: var(--fs-11); text-transform: uppercase;
  letter-spacing: .07em; color: var(--text-subtle);
}
```

**Interaksi** — Hover: bg `--surface-hover` saja (tanpa transform); aktif: marker + text terang; badge count = link seksi langsung ke filtered list; drawer <768px dengan backdrop blur.

**Apa yang dihapus vs lama** — (1) hover beranimasi ganda (bg+color sekaligus lambat) → satu property 120ms; (2) item tinggi 40px → 30px; (3) tanpa marker aktif lama (border left biru) → amber 2px; (4) sticky sidebar shadow → border 1px murni.

---

### 2.3 Repo List (segmented + card + dense table)

**Rationale** — Filter lama = pill chip lepas. Redesign: **segmented control** satu blok raised (3px padding, active = overlay surface + shadow-sm) — IBM Carbon / Linear pattern; tabel dibuat **dense 40px** dengan th uppercase 11px; kartu hover hanya border+1px translateY. Nama repo hover → amber (satu-satunya kolom interaktif berwarna).

**HTML**:
```html
<div class="repo-segmented-control" role="tablist">
  <button class="repo-tab-pill active">[icon] Dataset <span class="repo-tab-count">12</span></button>…
</div>
```

**CSS** (inti):
```css
.repo-segmented-control { background: var(--surface-raised); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: 3px; gap: 2px; }
.repo-tab-pill.active { background: var(--surface-overlay); box-shadow: var(--shadow-sm);
  color: var(--text); font-weight: var(--fw-semibold); }
.repo-tab-count { font-variant-numeric: tabular-nums; border-radius: var(--radius-sm); }
```

**Interaksi** — Segmented: klik/keyboard; count badge selalu ada (orientasi cepat); table row: hover = surface-hover, seluruh row klik; sarang skeleton shimmer saat loading.

**Apa yang dihapus vs lama** — (1) pill-radius tab (9999px) → radius-lg; (2) kartu dengan beberapa warna badge calo visual → badge 4 berkaterori `--c1..c3` + private; (3) table padding 16px → 9px 12px; (4) gradient bg halaman → canvas flat.

---

### 2.4 File Manager Surface (toolbar, breadcrumb, grid/list, selection)

**Rationale** — FM lama ramai: judul repo besar di atas, breadcrumb & toolbar terpisah, kartu glassmorphism blur. Redesign: **header repo kompak 2-row** (row 1: back + `owner/name` 16px + badges; row 2: breadcrumb + toolbar), list berubah jadi **tabel virtual dense**: grid 6 kolom, selection bar menggantikan toolbar saat selection aktif (bukan menumpuk). Status per-file: warna ikon tipe (`--c1..c6`), badge staged (add/move/delete ring). Checkbox custom 15px amber muncul saat hover/selected (desktop), selalu tampil di touch.

**HTML**:
```html
<div class="fm-layout">
  <div class="fm-header">
    <div class="fm-header-top">← owner/name [badge TYPE][PRIVATE]</div>
    <nav class="fm-breadcrumb" id="fm-breadcrumb-bar">
      <div class="fm-crumb active">[home] <span>Akar</span></div>
      <span class="fm-crumb-sep">›</span> <div class="fm-crumb">[folder] data</div>
      <button class="fm-breadcrumb-edit" aria-label="Edit jalur folder">[pencil 13px]</button>
    </nav>
    <div class="fm-toolbar">…</div>
  </div>
  <div class="fm-workspace">
    <aside class="fm-tree-panel">…</aside>
    <div class="fm-content-panel">
      <div class="fm-grid"> <div class="fm-card">[checkbox][thumb][name][meta][menu]</div>… </div>
      <!-- atau -->
      <div class="fm-list"> <div class="fm-list-header">…</div> <div class="fm-list-row">…</div> </div>
    </div>
  </div>
</div>
```

**CSS** (inti — selection & status):
```css
.fm-list-row { display: grid; grid-template-columns: 44px minmax(180px,1fr) 96px 132px 44px;
  min-height: 40px; border-radius: 0; border-bottom: 1px solid var(--border); }
.fm-list-row.selected { background: var(--accent-dim); box-shadow: inset 2px 0 0 var(--accent); }
.fm-list-row input[type="checkbox"]:checked {
  background: var(--accent); border-color: var(--accent);
  /* checkmark SVG inline; check-dark ink di atas amber */
}
.fm-card.selected { background: var(--accent-dim); border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
```

**Interaksi**:
- **Breadcrumb editable**: bar baru dikerjakan — hover menampilkan pensil di ujung trail; klik → `.fm-breadcrumb.editing` + input mono (path penuh); **Enter** navigasi ke path baru, **Esc** batal, blur batal.
- **Selection modes**: klik = single; Ctrl/Cmd+click = toggle individual; Shift+click = range; checkbox mengubah selection tanpa anchor. Selection bar muncul menggantikan baris filter.
- **Drag**: dari OS (dragenter aktif `.fm-drop-overlay`, border dashed amber+outline offset) dan antar entri (drop → stage move); target valid diberi outline dashed amber saat drag-over; mobile tetap pakai "Pindahkan ke…" bottom sheet.
- **Keyboard**: tab order natural tiap row/checkbox/menu; list-header tidak dalam tab.

**Apa yang dihapus vs lama** — (1) glassmorphism blur pada header FM (`backdrop blur 24px` + backgrounds layer hijau/kuning) → flat, border; (2) judul repo `fs-18 bold` + margin besar → 16px medium kompak; (3) row height 52 → 40 dengan padding 0.3rem; (4) kartu grid bg `surface-2` blur → flat `--surface` + hover translateY(-1px); (5) tombol "Unggah" default → tetap tampil tapi dipadatkan btn-sm dan dropdown sekitar teks; (6) selection bar gaya banner full → bar raised inline radius-xl.

---

### 2.5 Staged Changes Dock (reimagined total)

**Rationale** — Dock lama hanya strip count + tiga tombol: **momen review** (kritis menurut mandate) tidak bertemu di dock. Dock baru = **floating glass card bottom-center** dengan tiga zona: (1) Head — badge count amber glow + judul; (2) **daftar operasi mono** (maks 5, sisanya "+N lainnya") dengan op-badge berkode warna `add`=hijau, `delete`=merah, `move/rename`=amber, `dir`=hijau dan path → apabila rename/move; (3) Action row: Tinjau · Buang · **Commit (amber CTA)**. Review sekarang bisa dilakukan tanpa buka dialog.

**HTML**:
```html
<div class="fm-staged-bar visible">
  <div class="fm-staged-dock-head">
    <span class="fm-staged-badge">3</span>
    <span class="fm-staged-title">Perubahan belum disimpan</span>
  </div>
  <div class="fm-staged-list">
    <div class="fm-staged-list-item">
      <span class="fm-staged-op add">add</span>
      <span class="fm-staged-path">samples/01.png</span>
    </div>
    <div class="fm-staged-list-item">
      <span class="fm-staged-op move">move</span>
      <span class="fm-staged-path">a/x.txt</span>
      <span class="fm-staged-sep">→</span><span class="fm-staged-path-dest">b/x.txt</span>
    </div>…
    <div class="fm-staged-list-more">+2 perubahan lainnya</div>
  </div>
  <div class="fm-staged-dock-actions">
    <button class="fm-staged-btn-review">[eye] Tinjau</button>
    <button class="fm-staged-btn-discard">[trash] Buang</button>
    <span class="fm-staged-spacer"></span>
    <button class="fm-staged-btn-commit">[check] Commit</button>
  </div>
</div>
```

**CSS** (inti):
```css
.fm-staged-bar {
  position: fixed; bottom: calc(1.25rem + env(safe-area-inset-bottom));
  left: 50%; max-width: min(100vw-2rem, 620px);
  background: var(--surface-overlay);            /* fallback */
  background: color-mix(in srgb, var(--surface-overlay) 92%, transparent);
  backdrop-filter: blur(16px) saturate(1.2);      /* glass yang sengaja, sekali ini */
  border: 1px solid var(--border-strong); border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xl);
  transition: transform var(--dur-slow) var(--ease-out), opacity var(--dur-base);
}
.fm-staged-bar:not(.visible) { transform: translateX(-50%) translateY(calc(100% + 2.5rem)); opacity: 0; pointer-events:none; }
.fm-staged-badge { background: var(--accent); color: var(--accent-on);
  box-shadow: 0 0 0 3px var(--accent-dim); border-radius: var(--radius-sm); }
.fm-staged-list-item { font-family: var(--font-mono); font-size: var(--fs-11); }
.fm-staged-op { font-size: 10px; font-weight: 700; text-transform: uppercase;
  border: 1px solid transparent; border-radius: 4px; padding: 0 5px; }
.fm-staged-btn-commit { background: var(--accent); color: var(--accent-on); }
.fm-staged-btn-commit:hover { background: var(--accent-hover); box-shadow: 0 0 0 3px var(--accent-dim); }
```

**Interaksi** — Muncul: slide-up + fade; item hover: baris highlight; "Tinjau" tetap membuka dialog review penuh (Pesan commit editabel); **Commit** sekarang langsung buka dialog review (bukan refleks langsung push) supaya tetap ada gerbang konfirmasi; mobile: dock full-width `bottom 0.75rem+safe-area`, tombol Tinjau disembunyikan (jarang dipakai di layar kecil).

**Apa yang dihapus vs lama** — (1) dock horizontal single-row; (2) Review jadi hanya cara menihat diff → dock kini punya mini-list inline; (3) teks tombol "Commit & Push" menakutkan → "Commit (hub HF di dialog review)"; (4) glass blur `24px` saturate no; (5) warna hijau/merah/amber badge sebelumnya tidak bermakna → kini kode op.

---

### 2.6 Command Palette (⌘K / Ctrl+K) — komponen BARU

**Rationale** — Power-user ML punya ratusan repo; kini satu pintu navigasi global: **palette** (Linear/Raycast style) di atas semua layer, dengan grup `Konteks halaman` (Buka riwayat commit repo aktif, muncul kondisional), `Perintah` (Beranda, Jelajahi, Ganti tema, Pintasan keyboard), dan `Datasets/Models/Spaces` quick-switch dari repoStore. Filter debounce-free di lokal (client data), keyboard-first.

**HTML**:
```html
<div class="palette-overlay">
  <div class="palette" role="dialog" aria-modal="true">
    <div class="palette-input-row">
      [icon search]
      <input class="palette-input" role="combobox" aria-expanded="true"
             aria-controls="palette-listbox" aria-autocomplete="list" placeholder="Ketik perintah atau nama repo…">
      <kbd class="palette-esc kbd">esc</kbd>
    </div>
    <div class="palette-list" role="listbox" aria-activedescendant="palette-item-0">
      <div class="palette-group">Datasets</div>
      <button class="palette-item active" role="option" aria-selected="true">
        <span class="palette-item-icon palette-icon-c2">[icon]</span>
        <span class="palette-item-main">
          <span class="palette-item-label">wikitext-id-clean</span>
          <span class="palette-item-hint">me · private</span>
        </span>
      </button>…
    </div>
    <div class="palette-footer"><span><kbd>↑</kbd><kbd>↓</kbd> navigasi</span><span><kbd>↵</kbd> terapkan</span></div>
  </div>
</div>
```

**CSS** (inti):
```css
.palette-overlay { position: fixed; inset: 0; background: rgb(2 4 8 / .5);
  backdrop-filter: blur(4px); padding-top: max(11vh, var(--header-h) + 16px);
  z-index: calc(var(--z-modal) + 20); }
.palette { width: 100%; max-width: 600px; background: var(--surface-overlay);
  border: 1px solid var(--border-strong); border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xl); animation: palette-pop .18s var(--ease-out); }
.palette-item.active { background: var(--surface-hover); }
.palette-item.active::before { content:''; position:absolute; left:0; top:6px; bottom:6px;
  width:2px; background:var(--accent); border-radius:var(--radius-full); }
.palette-icon-c2 { color: var(--c2); } /* dst: warna kategorikal di ikon */
```

**Interaksi** —グル grup sticky; ArrowUp/Down circular; Enter menjalankan item & close; Esc close (+ restore focus ke elemen pemicu); klik di luar panel close; `body.palette-open { overflow: hidden }` untuk scroll-lock; aksesibilitas: role dialog/combo/listbox + aria-selected + label Indonesia.

**Apa yang dihapus vs lama** — List global search + tombol header yang lama → semua diganti satu surface palette (fitur "fokus search box halaman" hilang, diganti fokus keyboard-first).

---

### 2.7 Shortcut Legend (`?`) — komponen BARU

**Rationale** — Mandate: shortcut legend discoverable tapi tidak mengganggu. Implementasi: sheet panel `shortcut-overlay` berisi grid `1fr 1fr` (mobile 1 kolom) pasangan aksi + kbd. Hanya berisi shortcut yang **benar-benar ada** (Ctrl K, ↑↓, ↵, Esc) — tidak mengarang.

**CSS/HTML** — lihat `palette.css` (`.shortcut-overlay`, `.shortcut-sheet`, `.shortcut-grid`, `.shortcut-row`).

---

### 2.8 Commit History Timeline

**Rationale** — Mandate: git log dense ala Warp. Implementasi: garis vertikal 1px + node kecil 10px per commit (hover: fill amber + glow ring `0 0 0 5px --accent-dim`), kartu `radius-xl` di sisi kanan; SHA badge mono hover overlay; diff panel dengan `+N −N` mono dan badge op merged (added/deleted/modified). Baris riwayat tidak lagi jadi kolom-card besar dengan avatar round besar.

**CSS** (inti):
```css
.history-timeline::before { content:''; position:absolute; top:18px; bottom:18px;
  left:19px; width:1px; background: var(--border-strong); }
.commit-node-dot { width:10px; height:10px; border-radius:var(--radius-full);
  background:var(--surface-raised); border:2px solid var(--border-strong);
  box-shadow: 0 0 0 3px var(--canvas); }
.commit-row:hover .commit-node-dot { background:var(--accent); border-color:var(--accent);
  box-shadow: 0 0 0 3px var(--canvas), 0 0 0 5px var(--accent-dim); }
```

**Apa yang dihapus vs lama** — Kartu bersudut besar bertumpuk tanpa floor time; avatar besar; `hash` tidak jadi tombol copy → kini badge mono interaktif; line yang terputus antar kartu → garis kontinu.

---

### 2.9 Dialog / Modal & Toast

**Rationale** — Modal lama sudah baik; redesign menjaga kontrak API sambil reskin: overlay `rgb(2 4 8/.68)` + blur 6px, modal `radius-xl + border-strong + shadow-xl`, header/body/footer tegas 1px; **struktur footer bg `--surface`** memberikan zona aksi visual-tebal. Toast pindah **bottom-left** (konvensi dev-tool; staged dock menguasai bottom-center — kedua surface float seperti ini tidak berebut zona). Border 3px `--success/--error/--warning` memberi identitas instan.

**Apa yang dihapus vs lama** — Toast top-center (bertabrakan dengan header saat scroll) → bottom-left; modal radius 16px (web-ish) → 10px; focus ring default browser → `--ring` bila visible.

---

### 2.10 Empty States

**Rationale** — `empty-state` icon 56px dalam medali dibungkus dashed border `--border-strong`; judul 16 semibold, deskripsi 13 muted `max-width 28rem`, aksi primary ink. Teks tanpa emoji. Untuk FM: pencarian kosong menampilkan empty-state berisi "Tidak ada hasil untuk 'xyz'" + hint kbd. Belum ditempatkan sebagai state sendi dalam FM (next wave).

---

## 3. Interaksi Terdefinisi (Ringkas)

| Aksi | Perilaku | Durasi |
|---|---|---|
| Hover item repo/file | bg `surface-hover`; tidak pernah antre transform di row | 120ms |
| Hover kartu grid | translateY(-1px) + shadow-md | 120ms |
| Selection bar | Mengganti tools row (bukan menumpuk) | 120ms |
| Dock staged | translateY 100%+2.5rem → 0 | 260ms ease-out |
| Palette open | fade overlay 140ms + scale .98→1 180ms | 140/180ms |
| Drawer mobile | translateX(-100%) → 0 | 260ms ease-out |
| Toast | translateY(12px)+scale(.97) → masuk | 240ms ease-out |
| Node timeline hover | fill amber + glow | 120ms |

**Keyboard** — Tab natural; Enter open; `Ctrl/⌘+K` palette; `Esc` menutup layered overlay teratas (palette → dialog → drawer); shortcut lain halaman-FM tetap (Del hapus, dsb. dari TS lama).

---

## 4. Komponen Baru Teridentifikasi (Status)

| Komponen | Status | Catatan |
|---|---|---|
| **Command Palette ⌘K** | ✅ Terimplementasi | `command-palette.ts`, grup kontekstual + perintah + quick-switch |
| **Shortcut legend** | ✅ Terimplementasi | `openShortcutLegend()`, dari command palette |
| **Staged dock mini-review list** | ✅ Terimplementasi | File-manager staging dock read-only list |
| **Breadcrumb inline edit** | ✅ Terimplementasi | Pensil di ujung trail → input path |
| **Amber status marker** | ✅ Terimplementasi | Rail aktif, node timeline, badge count |
| Repo type distribution bar | ⏭ Next wave | Butuh per-repo filecounts (tree summary API); desain siap di token `c1..c6` |
| File-row LFS chip & health dot | ⏭ Next wave | Butuh metadata per-entry dari tree API |
| Upload progress tray non-blocking | ⏭ Next wave | Butuh plumbing commit API onProgress per-file rework |
| Inspector/preview panel kanan | ⏭ Next wave | Viewer tetap modal penuh (sudah matang); panel preview akan共享 state via repoStore |
| Folder treemap | ⏭ Ide disimpan | hanya kapan data ukuran folder tersedia |

---

## 5. File yang Diubah / Ditambah

```
src/styles/tokens.css          REWRITE — token semantik + bridge --hs-*
src/styles/layout.css          REWRITE — shell 48/256, drawer 768, scrollbar thin
src/styles/components.css      REWRITE — btn/badge/card/input/dropdown/toast/modal
src/styles/repo-list.css       REWRITE — segmented, kartu, dense table
src/styles/file-manager.css    REWRITE — FM surface + staged dock + breadcrumb edit
src/styles/history.css         REWRITE — timeline git-log padat
src/styles/palette.css         NEW     — palette + shortcut legend
src/styles/main.css            +import palette.css
src/ui/components/command-palette.ts   NEW — palette & legend (a11y, i18n, keybind)
src/ui/shell.ts                +palette wiring (trigger & replace search behavior)
src/ui/components/theme.ts     default dark (mandate: dark 90% waktu)
src/ui/pages/file-manager.ts   staged dock list + breadcrumb edit
src/i18n/id.ts, en.ts          +grup palette & shortcuts
index.html                     preboot obsidian, font Inter, tema pra-paint sync
```

Nilai produksi build: Gzip CSS 16.9 kB (dari bundle sebelumnya — tanpa penambahan runtime dependency).
