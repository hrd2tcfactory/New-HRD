// Fungsi server Vercel: kirim email ringkasan pengingat HRD lewat Gmail SMTP.
// Hanya akun HRD yang sudah login (token Firebase valid) dan terdaftar di ALLOWED_EMAILS yang boleh memakainya.
// Memakai variabel lingkungan yang sama dengan kirim-slip: GMAIL_USER, GMAIL_APP_PASSWORD, ALLOWED_EMAILS, MAIL_REPLY_TO (opsional).
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

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metode tidak diizinkan.' });
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD || !process.env.ALLOWED_EMAILS)
    return res.status(500).json({ error: 'Server belum diatur (GMAIL_USER, GMAIL_APP_PASSWORD, ALLOWED_EMAILS).' });
  if (!(await verifyHrd(req))) return res.status(401).json({ error: 'Tidak berwenang. Masuk ulang sebagai HRD.' });

  const { to, perusahaan, tanggal, sections, url } = req.body || {};
  if (!Array.isArray(to) || !to.length || to.length > 10 || !to.every((x) => typeof x === 'string' && EMAIL_RE.test(x)))
    return res.status(400).json({ error: 'Daftar penerima tidak valid (1–10 alamat email).' });
  if (!Array.isArray(sections) || !sections.length || sections.length > 12)
    return res.status(400).json({ error: 'Isi pengingat kosong.' });
  const secs = sections.map((s) => ({
    judul: String((s && s.judul) || '').slice(0, 120),
    items: (Array.isArray(s && s.items) ? s.items : []).slice(0, 60).map((x) => String(x).slice(0, 300)),
  })).filter((s) => s.judul && s.items.length);
  if (!secs.length) return res.status(400).json({ error: 'Isi pengingat kosong.' });
  const n = secs.reduce((a, s) => a + s.items.length, 0);
  const link = /^https:\/\/[a-z0-9.-]+$/i.test(url || '') ? url : '';
  const firma = String(perusahaan || 'HRD').replace(/["\r\n]/g, '');

  const html = '<p>Berikut hal yang perlu ditindaklanjuti' + (tanggal ? ' per ' + esc(String(tanggal).slice(0, 60)) : '') + '.</p>' +
    secs.map((s) => '<p style="margin:14px 0 4px"><b>' + esc(s.judul) + '</b></p><ul style="margin:0;padding-left:20px">' + s.items.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>').join('') +
    (link ? '<p style="margin-top:18px"><a href="' + esc(link) + '">Buka aplikasi HRD</a></p>' : '') +
    '<p style="color:#666;font-size:12px">Email otomatis dari aplikasi HRD ' + esc(firma) + '. Atur di Pengaturan → Pengingat email.</p>';
  const mail = { from: '"' + firma + '" <' + process.env.GMAIL_USER + '>', to: to.join(', '), subject: 'Pengingat HRD: ' + n + ' hal perlu perhatian', html };
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
