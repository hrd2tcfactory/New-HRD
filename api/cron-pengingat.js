// Fungsi terjadwal Vercel (lihat "crons" di vercel.json): kirim email pengingat HRD tanpa perlu ada yang membuka aplikasi.
// Variabel lingkungan (Vercel → Settings → Environment Variables):
//   FIREBASE_SERVICE_ACCOUNT  wajib  isi file JSON kunci akun layanan Firebase (Project settings → Service accounts → Generate new private key)
//   CRON_SECRET               wajib  teks acak; Vercel mengirimnya otomatis saat menjalankan jadwal
//   GMAIL_USER, GMAIL_APP_PASSWORD   wajib  sama dengan kirim slip
//   APP_URL                   opsional  alamat situs untuk tautan di email, mis. https://newhrdsistem.vercel.app
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const core = require('../lib/pengingat');

function db() {
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  return admin.firestore();
}
const toMap = (snap) => { const o = {}; snap.forEach((d) => { o[d.id] = d.data(); }); return o; };

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.CRON_SECRET || req.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET)
    return res.status(401).json({ error: 'Tidak berwenang.' });
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return res.status(500).json({ error: 'FIREBASE_SERVICE_ACCOUNT belum diatur.' });
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return res.status(500).json({ error: 'GMAIL_USER / GMAIL_APP_PASSWORD belum diatur.' });

  try {
    const fs = db();
    const setSnap = await fs.doc('settings/company').get();
    const settings = setSnap.exists ? setSnap.data() : {};
    const c = core.remCfg(settings.pengingat);
    const t = core.todayWIB();
    const stamp = { 'pengingat.serverCek': new Date().toISOString() };
    let sent = false, alasan = '';

    if (!c.to.length) alasan = 'belum ada penerima';
    else if (c.last >= core.remSlot(c, t)) alasan = 'sudah terkirim untuk jadwal ini';
    else {
      const cut = +settings.cutoff || 21; const ck = core.keyFor(t, cut); const pk = core.shiftKey(ck, -1);
      const [emps, warns, interns, pCur, pPrev] = await Promise.all([
        fs.collection('employees').get().then(toMap), fs.collection('warnings').get().then(toMap), fs.collection('interns').get().then(toMap),
        fs.doc('periods/' + ck).get(), fs.doc('periods/' + pk).get()]);
      const periods = {}; if (pCur.exists) periods[ck] = pCur.data(); if (pPrev.exists) periods[pk] = pPrev.data();
      const secs = core.computeSections({ settings, emps, warns, interns, periods }, c, t);
      if (!secs.length) alasan = 'tidak ada yang perlu diingatkan';
      else {
        const n = secs.reduce((a, s) => a + s.items.length, 0); const firma = String(settings.nama || 'HRD').replace(/["\r\n]/g, '');
        const mail = { from: '"' + firma + '" <' + process.env.GMAIL_USER + '>', to: c.to.join(', '), subject: 'Pengingat HRD: ' + n + ' hal perlu perhatian',
          html: core.buildHtml(secs, { perusahaan: settings.nama, tanggal: core.tanggalPanjang(t), url: process.env.APP_URL }) };
        if (process.env.MAIL_REPLY_TO) mail.replyTo = process.env.MAIL_REPLY_TO;
        await nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } }).sendMail(mail);
        stamp['pengingat.last'] = t; sent = true;
        const at = new Date().toISOString(); const id = at.replace(/\D/g, '').slice(0, 17) + Math.random().toString(36).slice(2, 6);
        await fs.doc('riwayat/' + id).set({ at, oleh: 'server (otomatis)', jenis: 'akses', judul: 'Mengirim email pengingat (otomatis)', ket: 'Ke ' + c.to.join(', ') });
      }
    }
    await fs.doc('settings/company').update(stamp);
    return res.status(200).json({ ok: true, sent, alasan });
  } catch (e) {
    console.error('[cron-pengingat]', e);
    return res.status(500).json({ error: 'Gagal: ' + ((e && e.message) || 'tidak diketahui') });
  }
};
