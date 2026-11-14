// Fungsi server Vercel: data identitas karyawan dari Google Form (NIK, NPWP, alamat, link KTP, WA, rekening).
// Data TIDAK disimpan di kode/GitHub. Data ada di variabel lingkungan rahasia IDENTITAS_JSON (Vercel → Settings → Environment Variables).
// GET  → kirim data ke aplikasi (hanya akun HRD yang login & terdaftar di ALLOWED_EMAILS).
// POST → aplikasi melaporkan hasil penerapan (hanya angka & ID karyawan, tanpa data pribadi) ke log Vercel.
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDqhQJU69-ORsBwqbS78rTWbvObo0xXsyA';

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
  if (!(await verifyHrd(req))) { console.log('[identitas] ditolak: token tidak valid / bukan HRD'); return res.status(401).json({ error: 'Tidak berwenang.' }); }
  if (req.method === 'POST') {
    const b = req.body || {};
    const clean = (v) => String(v == null ? '' : v).slice(0, 2000).replace(/[^\w\s:,.;=()\-|>+]/g, '');
    console.log('[identitas] laporan: ' + clean(JSON.stringify(b)));
    return res.status(200).json({ ok: true });
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metode tidak diizinkan.' });
  const src = (req.query && req.query.src) === 'email' ? 'IDENTITAS_EMAIL_JSON' : 'IDENTITAS_JSON';
  let rows = [];
  try { rows = JSON.parse(process.env[src] || '[]'); } catch (e) { console.log('[identitas] IDENTITAS_JSON rusak'); }
  console.log('[identitas] data dikirim (' + src + '): ' + (Array.isArray(rows) ? rows.length : Object.keys(rows).length));
  return res.status(200).json({ rows });
};
