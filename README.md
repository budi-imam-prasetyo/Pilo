---

# Photo Organizer

Aplikasi web lokal untuk menyortir file (foto, dokumen, media) dengan cepat menggunakan keyboard. Semua proses berjalan lokal di mesin Anda.

---

## Fitur

- Shortcut `1-9` untuk pindah file ke folder tujuan
- `S` untuk skip
- Support perangkat MTP (Android/Kamera)
- Viewer built-in: gambar, PDF, video, audio, teks/kode, ZIP, DOCX, XLSX
- UI editorial cream + coral (tanpa mode gelap/glassmorphism)
- 100% lokal (tidak upload ke internet)

---

## Jalankan

### Opsi 1 - Node.js

Install:

```bash
npm install
```

Run:

```bash
npm start
```

Mode dev (auto-reload):

```bash
npm run dev
```

---

### Opsi 2 - Bun

Install:

```bash
bun install
```

Run:

```bash
bun run dev
```

---

## Akses

http://localhost:3000

---

## Cara Pakai

1. Pilih folder sumber
2. Tambahkan folder tujuan
3. Klik mulai
4. Tekan `1-9` untuk pindah, `S` untuk skip

---

## Catatan

- PDF dirender via PDF.js lokal (tanpa CDN)
- Jika MTP tidak terdeteksi, pastikan perangkat sudah dalam mode transfer file

---