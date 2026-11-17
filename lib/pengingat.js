// Perhitungan isi email pengingat HRD di server (dipakai /api/cron-pengingat).
// Rumusnya sama dengan remSections() di index.html; ubah keduanya bersamaan.
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const MS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const REM_LIST = [['kontrak', 'Kontrak akan berakhir', 30], ['sp', 'Surat peringatan akan berakhir', 14], ['payroll', 'Payroll belum dikunci', 0],
  ['absen', 'Absensi belum lengkap', 0], ['pkl', 'PKL akan selesai', 14], ['cadangan', 'Cadangan data sudah lama', 0]];

const pad = (n) => String(n).padStart(2, '0');
// Semua tanggal dihitung sebagai tengah malam UTC supaya tidak terpengaruh zona waktu server.
const parse = (s) => { if (!s) return null; const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const iso = (d) => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
const fmtD = (s) => { const d = parse(s); return d ? d.getUTCDate() + ' ' + MS[d.getUTCMonth()] + ' ' + d.getUTCFullYear() : '—'; };
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
const todayWIB = (now) => iso(new Date((now || Date.now()) + 7 * 3600e3));
const lagi = (d) => (d < 0 ? 'sudah lewat ' + -d + ' hari' : d === 0 ? 'hari ini' : d + ' hari lagi');

function keyFor(t, c) { const d = parse(t); let y = d.getUTCFullYear(), m = d.getUTCMonth() + 1; if (d.getUTCDate() >= c) { m++; if (m > 12) { m = 1; y++; } } return y + '-' + pad(m); }
function shiftKey(key, n) { let [y, m] = key.split('-').map(Number); m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return y + '-' + pad(m); }
function periodRange(key, c) { const [y, m] = key.split('-').map(Number); return { start: iso(new Date(Date.UTC(y, m - 2, c))), end: iso(new Date(Date.UTC(y, m - 1, c - 1))) }; }
function periodLabel(key) { const [y, m] = key.split('-').map(Number); return MONTHS[m - 1] + ' ' + y; }
function warnStatus(w, t) {
  const d = daysBetween(t, w.sampai);
  if (w.tanggal && w.tanggal > t) return { k: 'next', d };
  if (d < 0) return { k: 'end', d };
  return { k: d <= 30 ? 'soon' : 'on', d };
}
function remCfg(c) {
  c = c || {}; const on = {}, hari = {};
  REM_LIST.forEach(([k, , h]) => { on[k] = c.on && c.on[k] != null ? !!c.on[k] : k !== 'pkl'; if (h) hari[k] = (c.hari && +c.hari[k]) || h; });
  return { to: (c.to || []).slice(), jadwal: c.jadwal || 'senin', on, hari, last: c.last || '' };
}
function remSlot(c, t) {
  const d = parse(t); let s = new Date(d);
  if (c.jadwal === 'harian') { if (s.getUTCDay() === 0) s.setUTCDate(s.getUTCDate() - 1); }
  else if (c.jadwal === '1-15') s = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() >= 15 ? 15 : 1));
  else s.setUTCDate(s.getUTCDate() - ((s.getUTCDay() + 6) % 7));
  return iso(s);
}

// data: { settings, emps:{id:doc}, warns:{id:doc}, periods:{key:doc}, interns:{id:doc} }
function computeSections(data, c, t) {
  const st = data.settings || {}; const cut = +st.cutoff || 21; const hol = new Set(st.libur || []);
  const emps = data.emps || {}; const nama = (id) => (emps[id] || {}).nama || id;
  const aktif = Object.values(emps).filter((e) => e.aktif !== false);
  const out = []; const add = (k, items) => { if (c.on[k] && items.length) out.push({ judul: REM_LIST.find((r) => r[0] === k)[1], items }); };

  add('kontrak', aktif.filter((e) => e.kontrakSelesai && daysBetween(t, e.kontrakSelesai) <= c.hari.kontrak)
    .sort((a, b) => a.kontrakSelesai.localeCompare(b.kontrakSelesai))
    .map((e) => e.nama + ' · kontrak berakhir ' + fmtD(e.kontrakSelesai) + ' (' + lagi(daysBetween(t, e.kontrakSelesai)) + ')'));
  add('sp', Object.values(data.warns || {}).filter((w) => { const s = warnStatus(w, t); return (s.k === 'on' || s.k === 'soon') && s.d <= c.hari.sp; })
    .map((w) => nama(w.empId) + ' · ' + w.tingkat + ' berakhir ' + fmtD(w.sampai) + ' (' + lagi(daysBetween(t, w.sampai)) + ')'));
  {
    const pk = shiftKey(keyFor(t, cut), -1); const pp = (data.periods || {})[pk];
    if (pp && Object.keys(pp.absensi || {}).length && !(pp.kunci && pp.kunci.rows))
      add('payroll', ['Payroll ' + periodLabel(pk) + ' belum dikunci (periode ditutup ' + fmtD(periodRange(pk, cut).end) + ')']);
  }
  {
    const ck = keyFor(t, cut); const per = (data.periods || {})[ck] || {}; const A = per.absensi || {}, L = per.lembur || {};
    const { start, end } = periodRange(ck, cut); const dates = [];
    for (let d = parse(start); iso(d) <= end && iso(d) <= t; d.setUTCDate(d.getUTCDate() + 1)) dates.push(iso(d));
    const has = (id) => Object.values(A[id] || {}).some((v) => v) || Object.values(L[id] || {}).some((v) => +v);
    const n = Object.values(emps).filter((e) => e.aktif !== false || has(e.id) || (e.tglKeluar && e.tglKeluar >= start)).filter((e) => {
      const r = A[e.id] || {};
      return dates.some((d) => parse(d).getUTCDay() !== 0 && !hol.has(d) && !r[d] && !(e.tglBergabung && d < e.tglBergabung) && !(e.tglKeluar && d > e.tglKeluar));
    }).length;
    if (n) add('absen', [n + ' karyawan punya hari kerja kosong di periode ' + periodLabel(ck)]);
  }
  add('pkl', Object.values(data.interns || {}).filter((p) => p.selesai && daysBetween(t, p.selesai) >= 0 && daysBetween(t, p.selesai) <= c.hari.pkl)
    .map((p) => p.nama + ' · selesai ' + fmtD(p.selesai) + ' (' + lagi(daysBetween(t, p.selesai)) + ')'));
  {
    const lb = st.lastBackup; const d = lb ? daysBetween(lb.slice(0, 10), t) : null;
    if (d == null || d > 30) add('cadangan', [d == null ? 'Data belum pernah dicadangkan' : 'Cadangan terakhir ' + fmtD(lb.slice(0, 10)) + ' (' + d + ' hari lalu)']);
  }
  return out;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
function buildHtml(secs, opts) {
  const firma = String((opts && opts.perusahaan) || 'HRD').replace(/["\r\n]/g, '');
  const link = /^https:\/\/[a-z0-9.-]+$/i.test((opts && opts.url) || '') ? opts.url : '';
  return '<p>Berikut hal yang perlu ditindaklanjuti' + (opts && opts.tanggal ? ' per ' + esc(String(opts.tanggal).slice(0, 60)) : '') + '.</p>' +
    secs.map((s) => '<p style="margin:14px 0 4px"><b>' + esc(s.judul) + '</b></p><ul style="margin:0;padding-left:20px">' + s.items.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>').join('') +
    (link ? '<p style="margin-top:18px"><a href="' + esc(link) + '">Buka aplikasi HRD</a></p>' : '') +
    '<p style="color:#666;font-size:12px">Email otomatis dari aplikasi HRD ' + esc(firma) + '. Atur di Pengaturan → Pengingat email.</p>';
}
const tanggalPanjang = (t) => HARI[parse(t).getUTCDay()] + ', ' + fmtD(t);

module.exports = { computeSections, remCfg, remSlot, todayWIB, keyFor, shiftKey, buildHtml, tanggalPanjang };
