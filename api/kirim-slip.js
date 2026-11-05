// Fungsi server Vercel: kirim slip gaji (PDF) ke email karyawan lewat Gmail SMTP.
// Hanya akun HRD yang sudah login (token Firebase valid) dan terdaftar di ALLOWED_EMAILS yang boleh memakainya.
// Variabel lingkungan (Vercel → Settings → Environment Variables):
//   GMAIL_USER          wajib   alamat Gmail pengirim
//   GMAIL_APP_PASSWORD  wajib   Sandi Aplikasi 16 huruf dari akun Google (bukan sandi login)
//   ALLOWED_EMAILS      wajib   email HRD yang boleh mengirim, pisahkan dengan koma
//   MAIL_REPLY_TO       opsional
const nodemailer = require('nodemailer');
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDqhQJU69-ORsBwqbS78rTWbvObo0xXsyA';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function verifyHrd(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return null;
  const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_API_KEY, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: m[1] }),
  });
  if (!r.ok) return null;
  const u = ((await r.json()).users || [])[0];
  const allowed = (process.env.ALLOWED_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  return u && u.email && allowed.includes(u.email.toLowerCase()) ? u.email : null;
}

function revisiHtml(nama, periode, firma) {
  return '<p>Halo ' + esc(nama) + ',</p>' +
    '<p>Mohon abaikan slip gaji periode <b>' + esc(periode) + '</b> yang kami kirim sebelumnya. Terjadi kendala pada sistem sehingga isi slip tersebut belum sesuai.</p>' +
    '<p>Slip gaji yang sudah dikoreksi terlampir pada email ini (PDF) dan menggantikan slip yang lama.</p>' +
    '<p>Mohon maaf atas ketidaknyamanannya. Jika masih ada yang tidak sesuai, silakan hubungi HRD.</p>' +
    '<p>Terima kasih atas kerja sama dan kontribusi Anda selama ini.</p><p>Salam,<br>' + firma + '</p>';
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metode tidak diizinkan.' });
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD || !process.env.ALLOWED_EMAILS)
    return res.status(500).json({ error: 'Server belum diatur (GMAIL_USER, GMAIL_APP_PASSWORD, ALLOWED_EMAILS).' });
  if (!(await verifyHrd(req))) return res.status(401).json({ error: 'Tidak berwenang. Masuk ulang sebagai HRD.' });

  const { to, nama, periode, rentang, filename, pdfBase64, perusahaan, revisi } = req.body || {};
  if (!EMAIL_RE.test(to || '')) return res.status(400).json({ error: 'Alamat email tidak valid.' });
  if (!pdfBase64 || typeof pdfBase64 !== 'string' || pdfBase64.length > 3_000_000)
    return res.status(400).json({ error: 'Lampiran PDF tidak valid.' });

  const firma = esc(perusahaan || 'HRD');
  const mail = {
    from: '"' + String(perusahaan || 'HRD').replace(/["\r\n]/g, '') + '" <' + process.env.GMAIL_USER + '>',
    to,
    subject: (revisi ? '[REVISI] ' : '') + 'Slip Gaji ' + periode + ' - ' + nama,
    html: revisi ? revisiHtml(nama, periode, firma) : '<p>Halo ' + esc(nama) + ',</p><p>Berikut slip gaji Anda periode <b>' + esc(periode) + '</b>' +
      (rentang ? ' (' + esc(rentang) + ')' : '') + '. File PDF terlampir.</p>' +
      '<p>Dokumen ini bersifat rahasia. Jika ada yang tidak sesuai, hubungi HRD.</p><p>Terima kasih,<br>' + firma + '</p>',
    attachments: [{ filename: String(filename || 'Slip Gaji.pdf'), content: pdfBase64, encoding: 'base64', contentType: 'application/pdf' }],
  };
  if (process.env.MAIL_REPLY_TO) mail.replyTo = process.env.MAIL_REPLY_TO;

  try {
    const t = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
    const info = await t.sendMail(mail);
    return res.status(200).json({ ok: true, id: info.messageId });
  } catch (e) {
    const msg = e && e.responseCode === 535 ? 'Gmail menolak login. Periksa GMAIL_USER dan Sandi Aplikasi.' : 'Gagal mengirim lewat Gmail' + (e && e.code ? ' (' + e.code + ')' : '') + '.';
    return res.status(502).json({ error: msg });
  }
};
