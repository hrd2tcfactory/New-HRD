// Tes rumus gaji. Jalankan: npm test  (atau: node --test tests/)
// Bila sebuah tes gagal setelah mengubah index.html, berarti hitungan gaji ikut berubah.
// Periksa dulu apakah perubahan itu memang disengaja sebelum memperbarui angka di sini.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, baseSettings, fill } = require('./app');

const app = loadApp();
const { S } = app;
const OKT = '2026-10'; // periode Oktober 2026: 21 Sep – 20 Okt 2026, 26 hari kerja (Senin–Sabtu)

function setup({ emps, periods, loans, settings }) {
  S.settings = baseSettings(settings);
  S.emps = {}; (emps || []).forEach((e) => { S.emps[e.id] = e; });
  S.periods = periods || {}; S.loans = loans || {}; S.warns = {}; S.periodKey = OKT;
}
const emp = (o) => Object.assign({ id: 'K1', nama: 'A', status: 'KONTRAK', metode: 'BULANAN', pembagi: 24, kaliLTM: 1, aktif: true, tglBergabung: '2020-01-01' }, o);
const per = (o) => Object.assign({ key: OKT, absensi: {}, lembur: {}, reimburse: {}, potonganLain: {} }, o);
const workDates = (from, to) => { const out = []; for (let d = app.parse(from); app.iso(d) <= to; d.setDate(d.getDate() + 1)) if (d.getDay() !== 0) out.push(app.iso(d)); return out; };

test('periode dan hari kerja', () => {
  const { start, end } = app.periodRange(OKT);
  assert.equal(app.iso(start), '2026-09-21');
  assert.equal(app.iso(end), '2026-10-20');
  assert.equal(app.workDays('2026-09-21', '2026-10-20'), 26);
  S.settings = baseSettings({ libur: ['2026-10-01'] });
  assert.equal(app.workDays('2026-09-21', '2026-10-20'), 25, 'tanggal merah tidak dihitung hari kerja');
  assert.equal(app.keyFor(new Date(2026, 9, 20)), '2026-10');
  assert.equal(app.keyFor(new Date(2026, 9, 21)), '2026-11');
});

test('bulanan: gaji pokok penuh, tidak bergantung absensi', () => {
  setup({ emps: [emp({ gajiPokok: 4800000 })], periods: { [OKT]: per({ absensi: { K1: fill(workDates('2026-09-21', '2026-10-05'), 'H') } }) } });
  const r = app.liveCalc(S.emps.K1, OKT);
  assert.equal(r.base, 4800000);
  assert.equal(r.pro, null);
  assert.equal(r.thp, 4800000);
});

test('harian: (gaji pokok ÷ pembagi) × (H + SH + C), SH dipotong kecuali TETAP', () => {
  const ab = Object.assign(fill(workDates('2026-09-21', '2026-10-13'), 'H'), { '2026-10-14': 'SH', '2026-10-15': 'C', '2026-10-16': 'C', '2026-10-17': 'A' });
  setup({ emps: [emp({ metode: 'HARIAN', gajiPokok: 3120000, pembagi: 26 })], periods: { [OKT]: per({ absensi: { K1: ab } }) } });
  const r = app.liveCalc(S.emps.K1, OKT);
  const H = Object.values(ab).filter((v) => v === 'H').length;
  assert.equal(r.harian, 120000);
  assert.equal(r.base, 120000 * (H + 1 + 2));
  assert.equal(r.potSH, 50000, 'gaji/hari >= 100.000 → potong 50.000 per SH');
  assert.equal(r.thp, Math.round(r.base - 50000));
  S.emps.K1.status = 'TETAP';
  assert.equal(app.liveCalc(S.emps.K1, OKT).potSH, 0, 'karyawan TETAP tidak dipotong SH');
  S.emps.K1.status = 'KONTRAK'; S.emps.K1.gajiPokok = 2340000; // 90.000/hari
  assert.equal(app.liveCalc(S.emps.K1, OKT).potSH, 30000, 'gaji/hari < 100.000 → potong 30.000 per SH');
});

test('bulanan: potongan absen hanya untuk kode yang dicentang di Pengaturan', () => {
  const ab = { '2026-10-01': 'A', '2026-10-02': 'A', '2026-10-03': 'I' };
  setup({ emps: [emp({ gajiPokok: 4800000 })], periods: { [OKT]: per({ absensi: { K1: ab } }) } });
  assert.equal(app.liveCalc(S.emps.K1, OKT).potAbsen, 0, 'tanpa centang: tidak dipotong');
  S.settings.potongBulanan = ['A'];
  const r = app.liveCalc(S.emps.K1, OKT);
  assert.equal(r.potAbsen, 400000, '2 × (4.800.000 ÷ 24)');
  assert.equal(r.thp, 4400000);
});

test('lembur: Minggu ×2, tanggal merah × pengali, per jam × tarif, uang makan bila >= 4 jam', () => {
  const ab = { '2026-09-27': 'LM', '2026-10-04': 'LM', '2026-10-01': 'LTM' };
  const lembur = { '2026-10-05': 3, '2026-10-06': 4, '2026-10-07': 5 };
  setup({ emps: [emp({ gajiPokok: 4800000, kaliLTM: 2 })], periods: { [OKT]: per({ absensi: { K1: ab }, lembur: { K1: lembur } }) } });
  const r = app.liveCalc(S.emps.K1, OKT);
  assert.equal(r.lm, 200000 * 2 * 2, '2 hari LM × gaji/hari × 2');
  assert.equal(r.ltm, 200000 * 2, '1 hari LTM × gaji/hari × pengali 2');
  assert.equal(r.jam, 12);
  assert.equal(r.lj, 12 * 20000);
  assert.equal(r.hariUM, 2, 'hanya hari dengan lembur >= 4 jam');
  assert.equal(r.um, 40000);
  assert.equal(r.thp, 4800000 + 800000 + 400000 + 240000 + 40000);
});

test('tarif lembur per karyawan: gaji/hari ÷ 8 dan nominal khusus', () => {
  setup({ emps: [emp({ gajiPokok: 4800000, lemburMode: 'harian8', lemburKali: 2 })] });
  assert.equal(app.otRate(S.emps.K1), (4800000 / 24 / 8) * 2);
  S.emps.K1.lemburMode = 'khusus'; S.emps.K1.lemburTarif = 35000;
  assert.equal(app.otRate(S.emps.K1), 35000);
});

test('reimburse dan bonus ditambah terpisah, potongan lain dikurangi', () => {
  setup({ emps: [emp({ gajiPokok: 4800000 })], periods: { [OKT]: per({ reimburse: { K1: 150000 }, bonus: { K1: 300000 }, potonganLain: { K1: 50000 } }) } });
  const r = app.liveCalc(S.emps.K1, OKT);
  assert.equal(r.reimb, 150000);
  assert.equal(r.bonus, 300000);
  assert.equal(r.thp, 4800000 + 150000 + 300000 - 50000);
  S.periods[OKT].bonus = {};
  assert.equal(app.liveCalc(S.emps.K1, OKT).bonus, 0, 'periode tanpa bonus');
});

test('kasbon: cicilan dipotong, tidak melebihi sisa, dan berhenti setelah lunas', () => {
  const loan = { empId: 'K1', tanggal: '2026-08-01', jumlah: 1000000, cicilan: 300000, potongan: {} };
  setup({ emps: [emp({ gajiPokok: 4800000 })], loans: { L1: loan } });
  assert.equal(app.kasbonFor('K1', OKT), 300000);
  loan.potongan = { '2026-08': 300000, '2026-09': 300000, '2026-07': 300000 };
  assert.equal(app.kasbonFor('K1', OKT), 100000, 'sisa 100.000 < cicilan');
  loan.potongan['2026-10'] = 100000;
  assert.equal(app.kasbonFor('K1', OKT), 100000, 'potongan yang sudah tercatat dipakai apa adanya');
  assert.equal(app.kasbonFor('K1', '2026-11'), 0, 'lunas');
  assert.equal(app.liveCalc(S.emps.K1, OKT).thp, 4800000 - 100000);
  const baru = { empId: 'K1', tanggal: '2026-10-25', jumlah: 500000, cicilan: 500000, potongan: {} };
  S.loans = { L2: baru };
  assert.equal(app.kasbonFor('K1', OKT), 0, 'kasbon setelah periode berakhir belum dipotong');
});

test('prorata: keluar di tengah periode', () => {
  setup({ emps: [emp({ gajiPokok: 6000000, aktif: false, tglKeluar: '2026-10-10' })] });
  const r = app.liveCalc(S.emps.K1, OKT);
  assert.deepEqual([r.pro.dj, r.pro.wd], [18, 26]);
  assert.equal(r.base, Math.round(6000000 * 18 / 26));
  assert.equal(r.base, 4153846);
});

test('prorata: masuk di tengah periode', () => {
  setup({ emps: [emp({ gajiPokok: 6000000, tglBergabung: '2026-10-12' })] });
  const r = app.liveCalc(S.emps.K1, OKT);
  assert.deepEqual([r.pro.dj, r.pro.wd], [8, 26], '12–20 Okt = 8 hari kerja (18 Okt Minggu)');
  assert.equal(r.base, Math.round(6000000 * 8 / 26));
});

test('prorata: masuk dan keluar di periode yang sama', () => {
  setup({ emps: [emp({ gajiPokok: 5200000, tglBergabung: '2026-09-28', aktif: false, tglKeluar: '2026-10-03' })] });
  const r = app.liveCalc(S.emps.K1, OKT);
  assert.deepEqual([r.pro.dj, r.pro.wd], [6, 26]);
  assert.equal(r.base, 1200000);
});

test('prorata: tidak berlaku untuk yang bekerja penuh, untuk karyawan harian, dan bila keluar di hari terakhir', () => {
  setup({ emps: [emp({ gajiPokok: 6000000, tglBergabung: '2026-09-21' })] });
  assert.equal(app.liveCalc(S.emps.K1, OKT).pro, null, 'bergabung tepat di awal periode');
  S.emps.K1 = emp({ gajiPokok: 6000000, aktif: false, tglKeluar: '2026-10-20' });
  assert.equal(app.liveCalc(S.emps.K1, OKT).pro, null, 'keluar di hari terakhir periode');
  S.emps.K1 = emp({ metode: 'HARIAN', gajiPokok: 3120000, pembagi: 26, tglBergabung: '2026-10-12' });
  assert.equal(app.liveCalc(S.emps.K1, OKT).pro, null, 'karyawan harian dibayar per hari hadir');
});

test('prorata: memakai hari kerja, tanggal merah tidak dihitung', () => {
  setup({ emps: [emp({ gajiPokok: 5000000, aktif: false, tglKeluar: '2026-10-10' })], settings: { libur: ['2026-10-01'] } });
  const r = app.liveCalc(S.emps.K1, OKT);
  assert.deepEqual([r.pro.dj, r.pro.wd], [17, 25]);
});

test('payroll yang sudah dikunci tidak dihitung ulang', () => {
  const snapshot = { thp: 1234567, base: 1234567 };
  setup({ emps: [emp({ gajiPokok: 9000000 })], periods: { [OKT]: per({ kunci: { at: '2026-10-25T00:00:00Z', rows: { K1: { e: {}, r: snapshot } } } }) } });
  assert.equal(app.calc(S.emps.K1, OKT).thp, 1234567);
  assert.equal(app.liveCalc(S.emps.K1, OKT).thp, 9000000);
});

test('cuti: kuota − terpakai sebelum sistem − kode C, dan atur ulang', () => {
  const ab = { '2026-10-01': 'C', '2026-10-02': 'C' };
  setup({ emps: [emp({ gajiPokok: 4800000, kuotaCuti: 12, cutiTerpakaiAwal: 3 })], periods: { [OKT]: per({ absensi: { K1: ab } }) }, settings: { cutiAwalTahun: 2026, cutiMulaiBulan: 4 } });
  assert.equal(app.cutiSisa(S.emps.K1, 2026), 7);
  S.emps.K1.cutiTerpakaiAwal = 0; S.emps.K1.cutiReset = '2026-10-02';
  assert.equal(app.cutiSisa(S.emps.K1, 2026), 11, 'kode C sebelum tanggal atur ulang tidak dihitung');
});

test('slip gaji periode yang dikunci tetap memakai kuota cuti karyawan', () => {
  // Salinan karyawan di payroll yang dikunci tidak menyimpan kuota cuti; slip harus tetap membaca kuota 12.
  const ab = { '2026-10-01': 'C', '2026-10-02': 'C' };
  setup({ emps: [emp({ kuotaCuti: 12, cutiTerpakaiAwal: 8 })], settings: { cutiAwalTahun: 2026, cutiMulaiBulan: 4 },
    periods: { [OKT]: per({ absensi: { K1: ab }, kunci: { at: '2026-10-25T00:00:00Z', rows: { K1: { e: { id: 'K1', nama: 'A' }, r: { thp: 1 } } } } }) } });
  S.periodKey = OKT;
  const html = app.slipCutiHtml(app.payEmp('K1', OKT));
  const nums = [...html.matchAll(/<b[^>]*>(-?\d+) <small>/g)].map((m) => +m[1]);
  assert.deepEqual(nums, [12, 10, 2]);
});

test('slip gaji ikut tanggal atur ulang cuti, sama dengan halaman Cuti', () => {
  setup({ emps: [emp({ kuotaCuti: 12, cutiReset: '2026-10-10' })], settings: { cutiAwalTahun: 2026, cutiMulaiBulan: 4 },
    periods: { [OKT]: per({ absensi: { K1: { '2026-10-01': 'C', '2026-10-12': 'C' } } }) } });
  S.periodKey = OKT;
  const nums = [...app.slipCutiHtml(S.emps.K1).matchAll(/<b[^>]*>(-?\d+) <small>/g)].map((m) => +m[1]);
  assert.deepEqual(nums, [12, 1, 11]);
  assert.equal(nums[2], app.cutiSisa(S.emps.K1, 2026));
});

test('cek payroll: kasbon dobel dan rekening sama ditandai Salah, bisa ditandai benar', () => {
  const loans = { L1: { empId: 'K1', tanggal: '2026-10-05', jumlah: 500000, cicilan: 100000, potongan: {} }, L2: { empId: 'K1', tanggal: '2026-10-06', jumlah: 500000, cicilan: 100000, potongan: {} } };
  setup({ emps: [emp({ gajiPokok: 4800000, rekening: '1234567890' }), emp({ id: 'K2', nama: 'B', gajiPokok: 4800000, rekening: '1234567890' })], loans, periods: { [OKT]: per({}) } });
  const bad = app.payChecks(OKT).filter((c) => c.lvl === 'bad').map((c) => c.s);
  assert.equal(bad.length, 2);
  assert.ok(bad.some((s) => /DOBEL/.test(s)) && bad.some((s) => /rekening/i.test(s)));
  const kas = app.payChecks(OKT).find((c) => /DOBEL/.test(c.s)).k;
  S.periods[OKT].cekOk = { [kas]: { at: 'x' } };
  assert.equal(app.payChecks(OKT).filter((c) => c.lvl === 'bad').length, 1, 'yang ditandai benar tidak lagi memblokir');
});

test('cek payroll: lembur di hari alpha jadi peringatan', () => {
  setup({ emps: [emp({ gajiPokok: 4800000 })], periods: { [OKT]: per({ absensi: { K1: { '2026-10-05': 'A' } }, lembur: { K1: { '2026-10-05': 3 } } }) } });
  assert.ok(app.payChecks(OKT).some((c) => c.lvl === 'warn' && /absensinya A/.test(c.s)));
});

test('telat tanpa keterangan: per jam yang dimulai × Rp 10.000', () => {
  const telat = { '2026-10-01': 5, '2026-10-02': 60, '2026-10-05': 61, '2026-10-06': 0, '2026-09-01': 30 };
  setup({ emps: [emp({ gajiPokok: 4800000, jabatan: 'OPERATOR CNC' })], periods: { [OKT]: per({ telat: { K1: telat } }) } });
  const r = app.liveCalc(S.emps.K1, OKT);
  assert.equal(r.telatJam, 1 + 1 + 2, '5 mnt = 1 jam, 60 mnt = 1 jam, 61 mnt = 2 jam; di luar periode tidak dihitung');
  assert.equal(r.potTelat, 40000);
  assert.equal(r.thp, 4800000 - 40000);
  S.settings.telatToleransi = 10;
  assert.equal(app.liveCalc(S.emps.K1, OKT).telatJam, 3, 'telat 5 menit masuk toleransi');
  S.settings.telatTarif = 15000;
  assert.equal(app.liveCalc(S.emps.K1, OKT).potTelat, 45000, 'tarif dari Pengaturan');
});

test('telat: tidak dipotong untuk jabatan Programmer dan karyawan yang ditandai', () => {
  const telat = { '2026-10-01': 90 };
  setup({ emps: [emp({ gajiPokok: 4800000, jabatan: 'PROGRAMMER' })], periods: { [OKT]: per({ telat: { K1: telat } }) } });
  assert.equal(app.liveCalc(S.emps.K1, OKT).potTelat, 0, 'jabatan Programmer (bawaan Pengaturan)');
  S.emps.K1.jabatan = 'GENERAL MANAGER'; S.emps.K1.bebasTelat = true;
  assert.equal(app.liveCalc(S.emps.K1, OKT).potTelat, 0, 'ditandai tidak dipotong di data karyawan');
  S.emps.K1.bebasTelat = false;
  assert.equal(app.liveCalc(S.emps.K1, OKT).potTelat, 20000);
  S.settings.telatBebasJab = [];
  S.emps.K1.jabatan = 'PROGRAMMER';
  assert.equal(app.liveCalc(S.emps.K1, OKT).potTelat, 20000, 'daftar jabatan dikosongkan: Programmer ikut dipotong');
});
