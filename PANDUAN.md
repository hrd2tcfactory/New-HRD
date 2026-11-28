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

---

## Kirim slip gaji lewat email (otomatis)

Slip PDF dikirim ke email karyawan lewat Gmail SMTP. Di halaman **Payroll** ada tombol **Kirim semua slip via email** (satu klik untuk semua), dan di halaman **Slip gaji** ada tombol **Kirim via email** per orang. Batas Gmail sekitar 500 email per hari.

**Setup satu kali**

1. Akun Google pengirim: aktifkan **Verifikasi 2 Langkah**, lalu buat **Sandi Aplikasi** di https://myaccount.google.com/apppasswords (16 huruf, bukan sandi login).
2. Di Vercel → project → **Settings → Environment Variables**, tambahkan:
   - `GMAIL_USER` = alamat Gmail pengirim
   - `GMAIL_APP_PASSWORD` = Sandi Aplikasi 16 huruf (jenis Secret)
   - `ALLOWED_EMAILS` = email HRD yang boleh mengirim, pisahkan koma (sama seperti di Firestore Rules)
   - `MAIL_REPLY_TO` = (opsional)
3. **Redeploy** di Vercel supaya variabel terbaca.
4. Di halaman **Karyawan** tekan **Impor email dari Excel**, pilih `Daftar_Email_Karyawan_2TC.xlsx` (kolom `ID` dan `Email`). Email bisa diubah per orang lewat tombol Ubah.

**Cara pakai bulanan**: kunci payroll → buka Payroll → **Kirim semua slip via email** → cek ringkasan hasil (yang gagal ditampilkan beserta alasannya).

Kalau email masuk spam, minta karyawan menandainya "bukan spam" sekali saja.

---

## Pengingat email otomatis dari server

Tanpa langkah ini, email pengingat hanya terkirim saat aplikasi dibuka. Dengan langkah ini, Vercel menjalankan `/api/cron-pengingat` setiap hari sekitar pukul 07.00 WIB dan mengirim email sesuai pengaturan di **Pengaturan → Pengingat email**.

1. Firebase → ikon gerigi → **Project settings → Service accounts** → **Generate new private key**. Sebuah file JSON terunduh. Simpan baik-baik dan jangan dikirim ke siapa pun.
2. Vercel → project → **Settings → Environment Variables**, tambahkan:
   - `FIREBASE_SERVICE_ACCOUNT` = seluruh isi file JSON tadi
   - `CRON_SECRET` = teks acak minimal 16 huruf/angka (buat sendiri)
   - `APP_URL` (opsional) = alamat situs, mis. `https://newhrdsistem.vercel.app`
   - `GMAIL_USER` dan `GMAIL_APP_PASSWORD` sudah ada dari fitur kirim slip.
3. Vercel → **Deployments** → titik tiga di deployment teratas → **Redeploy**.
4. Untuk mencoba: Vercel → **Settings → Cron Jobs** → **Run**. Setelah itu halaman Pengingat email menampilkan "Otomatis dari server aktif".

## Untuk HRD baru: mulai dari sini

Panduan lengkap ada di dalam aplikasi: menu **Lainnya → Panduan**. Bacalah bagian 1 (rutinitas bulanan), 4 (telat & shift) dan 6 (kalender HRD) dulu. Di setiap halaman, tombol **?** di samping judul berisi petunjuk singkat.

Ringkasan rutinitas tiap tanggal tutup absen:

1. **Absensi** dan **Lembur** dilengkapi.
2. **Telat & Shift → Unggah file mesin absen** → Catat → selesaikan tab **Perlu dicek** → centang *izin / tugas atasan* di tab Rekap untuk telat yang ada keterangannya.
3. **Payroll**: isi reimburse / bonus / potongan lain, perbaiki semua tanda di panel Cek payroll.
4. Bayar gaji, lalu **Kunci payroll**.
5. **Kirim slip via email…** (pilih semua, yang belum terkirim, atau orang tertentu; yang sudah pernah dikirim otomatis sebagai REVISI).
6. Unduh **Laporan** bulanan dan **cadangan data** (Pengaturan → Cadangan data).

Aturan telat, jam shift, jadwal grup minggu ini, masa berlaku SP, dan nama Direktur diatur di **Pengaturan**. **Jam masuk & pulang dari mesin absen:** colokkan flashdisk dari mesin sidik jari, lalu di **Absensi → Cocokkan mesin absen** pilih file `.txt`-nya (file Excel juga bisa). Periksa pasangan nama, lalu klik **Simpan jam scan**. Hasilnya ada di **Absensi → Jam scan**: jam masuk tebal, jam pulang tipis, garis merah = lupa scan atau kode hadir tanpa scan. Menyimpan jam scan tidak mengubah kode absensi atau gaji, jadi aman juga untuk bulan yang sudah dikunci.

SOP, Peraturan Perusahaan, dan Struktur Organisasi ada di kelompok menu **Dokumen**.

Tanda tangan digital disimpan sekali per orang di **Pengaturan → Daftar tanda tangan** (unggah foto/scan atau gambar langsung di layar). Surat, SOP, dan Peraturan Perusahaan otomatis memakai tanda tangan orang yang namanya tertulis sebagai penanda tangan; slip gaji sementara tidak memakai tanda tangan digital. Kartu berlabel "Gambar belum ada" menunjukkan nama yang sudah dipakai di dokumen tetapi belum punya tanda tangan.
