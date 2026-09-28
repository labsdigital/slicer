# SLICER — Pembagi Gambar Seragam

Webapp statis (HTML/CSS/JS murni, tanpa dependensi) untuk memotong gambar menjadi
bagian-bagian seragam berdasarkan jumlah **baris** dan **kolom**.

## Cara pakai

1. Buka `index.html` di browser (klik dua kali), atau jalankan `python -m http.server` di folder ini lalu akses `http://localhost:8000`.
2. Muat gambar: klik area unggah, seret file, atau tempel dari clipboard (Ctrl+V). Bisa juga klik "Coba gambar contoh".
3. Atur jumlah **Baris** (potongan ke bawah) dan **Kolom** (potongan ke samping), masing-masing 1–10. Potongan diperbarui otomatis.
4. Unduh tiap potongan lewat tombol unduh di kartunya, atau semuanya sekaligus lewat "Unduh semua".

## Catatan teknis

- 100% lokal: Canvas API + Blob, tidak ada unggahan ke server mana pun.
- Potongan dibuat ukuran seragam (`floor(lebar/kolom)` × `floor(tinggi/baris)`);
  sisa piksel di kanan/bawah tidak ikut dipotong dan ditandai area arsir oranye di pratinjau.
- Nama file hasil: `{nama}_r{baris}c{kolom}.png`.
- Format: PNG (mendukung transparansi).
