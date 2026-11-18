// Tes isi email pengingat yang dikirim server (lib/pengingat.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../lib/pengingat');

test('jadwal kirim: Senin, hari kerja, tanggal 1 dan 15', () => {
  const c = (j) => core.remCfg({ jadwal: j });
  assert.equal(core.remSlot(c('senin'), '2026-11-18'), '2026-11-16');
  assert.equal(core.remSlot(c('harian'), '2026-11-22'), '2026-11-21', 'Minggu ikut Sabtu');
  assert.equal(core.remSlot(c('1-15'), '2026-11-18'), '2026-11-15');
  assert.equal(core.remSlot(c('1-15'), '2026-11-03'), '2026-11-01');
});

test('isi pengingat: kontrak, SP, payroll belum dikunci, PKL, cadangan', () => {
  const data = {
    settings: { cutoff: 21, lastBackup: '2026-09-01T00:00:00Z' },
    emps: { K1: { id: 'K1', nama: 'BUDI', aktif: true, kontrakSelesai: '2026-11-30' }, K2: { id: 'K2', nama: 'SITI', aktif: false, kontrakSelesai: '2026-11-25' } },
    warns: { W1: { empId: 'K1', tingkat: 'SP 1', tanggal: '2026-06-01', sampai: '2026-11-25' } },
    interns: { P1: { nama: 'SISWA', selesai: '2026-11-27' } },
    periods: { '2026-11': { absensi: { K1: { '2026-11-02': 'H' } } } },
  };
  const secs = core.computeSections(data, core.remCfg({ to: ['a@b.co'], on: { pkl: true } }), '2026-11-18');
  const by = Object.fromEntries(secs.map((s) => [s.judul, s.items]));
  assert.deepEqual(by['Kontrak akan berakhir'], ['BUDI · kontrak berakhir 30 Nov 2026 (12 hari lagi)'], 'karyawan nonaktif tidak diingatkan');
  assert.deepEqual(by['Surat peringatan akan berakhir'], ['BUDI · SP 1 berakhir 25 Nov 2026 (7 hari lagi)']);
  assert.equal(by['Payroll belum dikunci'], undefined, 'periode Oktober tidak ada datanya');
  assert.deepEqual(by['PKL akan selesai'], ['SISWA · selesai 27 Nov 2026 (9 hari lagi)']);
  assert.match(by['Cadangan data sudah lama'][0], /78 hari lalu/);
});

test('payroll periode lalu yang belum dikunci', () => {
  const data = { settings: { cutoff: 21, lastBackup: '2026-11-17T00:00:00Z' }, emps: {}, warns: {}, interns: {},
    periods: { '2026-10': { absensi: { K1: { '2026-10-01': 'H' } } } } };
  const c = core.remCfg({ to: ['a@b.co'] });
  assert.deepEqual(core.computeSections(data, c, '2026-11-18').map((s) => s.items[0]), ['Payroll Oktober 2026 belum dikunci (periode ditutup 20 Okt 2026)']);
  data.periods['2026-10'].kunci = { at: '2026-10-25', rows: { K1: {} } };
  assert.equal(core.computeSections(data, c, '2026-11-18').length, 0, 'sudah dikunci');
});

test('jenis yang dimatikan tidak dikirim', () => {
  const data = { settings: { cutoff: 21, lastBackup: '2026-11-17T00:00:00Z' }, emps: { K1: { id: 'K1', nama: 'BUDI', aktif: true, kontrakSelesai: '2026-11-30' } }, warns: {}, interns: {}, periods: {} };
  assert.equal(core.computeSections(data, core.remCfg({ on: { kontrak: false, absen: false } }), '2026-11-18').length, 0);
});
