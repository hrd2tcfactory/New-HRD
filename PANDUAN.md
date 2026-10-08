# Deploy HRD Sopandi ke Vercel

Isi paket:

| File / folder | Fungsi |
|---|---|
| `hrd-sopandi-vercel/` | Folder aplikasi yang di-deploy ke Vercel |
| `hrd-sopandi-vercel/firebase-config.js` | **Wajib diisi** dengan konfigurasi Firebase Anda |
| `hrd-sopandi-vercel/firestore.rules` | Aturan keamanan: siapa saja yang boleh membuka data |
| `data-awal.json` | Seluruh data dari aplikasi lama (53 karyawan, absensi & lembur Oktober, kasbon, PKL, pengaturan). **Rahasia — jangan diunggah ke GitHub/Vercel.** |

Biaya: Vercel (paket Hobby) dan Firebase (paket Spark) gratis untuk pemakaian sebesar ini.

---

## Langkah 1 — Buat database di Firebase (±10 menit)

1. Buka https://console.firebase.google.com → **Create a project** → beri nama, misalnya `hrd-sopandi`. Google Analytics boleh dimatikan.
2. Menu kiri **Build → Firestore Database → Create database**
   - Lokasi: **asia-southeast2 (Jakarta)**
   - Mode: **Production mode**
3. Masih di Firestore, buka tab **Rules**, hapus semua isinya, tempel isi file `firestore.rules`, lalu **Publish**.
   - Email yang boleh masuk sudah terisi `hrd2tcfactory@gmail.com`. Untuk rekan HRD lain, tambahkan emailnya di daftar itu, contoh: `'hrd2tcfactory@gmail.com', 'rekan@gmail.com'`.
4. Menu **Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save**.
5. Tab **Users → Add user**: isi email `hrd2tcfactory@gmail.com` dan buat kata sandi. Lakukan juga untuk rekan HRD lain.
6. Klik ikon gerigi ⚙ → **Project settings → General** → bagian *Your apps* → klik ikon **`</>`** (Web) → beri nama app → **Register app**. Akan muncul kode berisi `firebaseConfig = { apiKey: ..., authDomain: ..., ... }`.
7. Buka `hrd-sopandi-vercel/firebase-config.js` dengan Notepad, ganti setiap nilai `ISI_...` dengan nilai dari langkah 6, lalu simpan.

## Langkah 2 — Unggah ke GitHub (±5 menit)

1. Buat akun di https://github.com bila belum punya.
2. Klik **+ → New repository** → nama `hrd-sopandi` → pilih **Private** → **Create repository**.
3. Klik **uploading an existing file** → seret **isi** folder `hrd-sopandi-vercel` (5 file: `index.html`, `backend.js`, `firebase-config.js`, `firestore.rules`, `vercel.json`) → **Commit changes**.
   - Jangan ikut mengunggah `data-awal.json`.

## Langkah 3 — Deploy di Vercel (±3 menit)

1. Buka https://vercel.com → **Sign up with GitHub**.
2. **Add New → Project** → pilih repository `hrd-sopandi` → **Import**.
3. Framework Preset: **Other**. Biarkan pengaturan lain apa adanya → **Deploy**.
4. Setelah selesai Anda mendapat alamat seperti `https://hrd-sopandi.vercel.app`.

## Langkah 4 — Izinkan domain Vercel di Firebase

Firebase → **Authentication → Settings → Authorized domains → Add domain** → isi `hrd-sopandi.vercel.app` (sesuai alamat dari langkah 3, tanpa `https://`).

## Langkah 5 — Masuk dan impor data (sekali saja)

1. Buka alamat Vercel Anda → masuk dengan email & kata sandi dari Langkah 1.5.
2. Karena database masih kosong, muncul layar **"Database masih kosong"**. Pilih file `data-awal.json` → **Impor data awal**.
3. Selesai. Total gaji Oktober seharusnya **Rp 237.631.011** — sama dengan versi lama.

---

## Penting setelah pindah

- **Pakai satu aplikasi saja.** Data versi Vercel dan versi di Claude terpisah dan tidak saling sinkron. Setelah impor, isi absensi dan payroll hanya di versi Vercel.
- **Perubahan tampilan dari Claude**: kalau nanti minta Claude mengubah aplikasi, minta file `index.html` yang baru, lalu ganti file itu di GitHub (Add file → Upload files). Vercel otomatis memperbarui situs dalam ±1 menit. Data di Firebase tidak terpengaruh.
- **Menambah akses HRD baru**: tambahkan user di Firebase Authentication **dan** emailnya di Firestore Rules.
- **Cadangan**: tetap unduh Excel payroll setiap bulan setelah payroll dikunci.

## Kalau ada masalah

| Tampilan | Penyebab & solusi |
|---|---|
| "Firebase belum diatur" | `firebase-config.js` belum diisi atau salah ketik. Periksa lagi, unggah ulang ke GitHub. |
| Tidak bisa masuk, "auth/unauthorized-domain" | Domain Vercel belum ditambahkan (Langkah 4). |
| "Akun ini belum diberi akses" | Email belum ada di Firestore Rules (Langkah 1.3). |
| "Email atau kata sandi salah" | Cek user di Firebase Authentication, atau tekan **Lupa kata sandi**. |
