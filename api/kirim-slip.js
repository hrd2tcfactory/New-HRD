// Fungsi server Vercel: kirim slip gaji (PDF) ke email karyawan lewat Resend.
// Hanya akun HRD yang sudah login (token Firebase valid) dan terdaftar di ALLOWED_EMAILS yang boleh memakainya.
// Variabel lingkungan (Vercel → Settings → Environment Variables):
//   RESEND_API_KEY  wajib   kunci API dari resend.com
//   MAIL_FROM       wajib   mis. "HRD 2TC <hrd@domain-anda.com>" (atau onboarding@resend.dev untuk uji coba)
//   ALLOWED_EMAILS  wajib   email HRD yang boleh mengirim, pisahkan dengan koma
//   MAIL_REPLY_TO   opsional
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
  if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM || !process.env.ALLOWED_EMAILS)
    return res.status(500).json({ error: 'Server belum diatur (RESEND_API_KEY, MAIL_FROM, ALLOWED_EMAILS).' });
  if (!(await verifyHrd(req))) return res.status(401).json({ error: 'Tidak berwenang. Masuk ulang sebagai HRD.' });

  const { to, nama, periode, rentang, filename, pdfBase64, perusahaan } = req.body || {};
  if (!EMAIL_RE.test(to || '')) return res.status(400).json({ error: 'Alamat email tidak valid.' });
  if (!pdfBase64 || typeof pdfBase64 !== 'string' || pdfBase64.length > 3_000_000)
    return res.status(400).json({ error: 'Lampiran PDF tidak valid.' });

  const firma = esc(perusahaan || 'HRD');
  const body = {
    from: process.env.MAIL_FROM,
    to: [to],
    subject: 'Slip Gaji ' + periode + ' - ' + nama,
    html: '<p>Halo ' + esc(nama) + ',</p><p>Berikut slip gaji Anda periode <b>' + esc(periode) + '</b>' +
      (rentang ? ' (' + esc(rentang) + ')' : '') + '. File PDF terlampir.</p>' +
      '<p>Dokumen ini bersifat rahasia. Jika ada yang tidak sesuai, hubungi HRD.</p><p>Terima kasih,<br>' + firma + '</p>',
    attachments: [{ filename: String(filename || 'Slip Gaji.pdf'), content: pdfBase64 }],
  };
  if (process.env.MAIL_REPLY_TO) body.reply_to = process.env.MAIL_REPLY_TO;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: j.message || 'Resend menolak (' + r.status + ').' });
    return res.status(200).json({ ok: true, id: j.id });
  } catch (e) {
    return res.status(502).json({ error: 'Gagal menghubungi layanan email.' });
  }
};
