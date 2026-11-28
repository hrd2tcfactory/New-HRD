// Telat & shift: jadwal grup bergilir tiap Senin, telat dari mesin dibandingkan dengan jam shift grup.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app');
const app = loadApp();
const S = app.S;
const NOV = '2026-11'; // 21 Okt – 20 Nov 2026
const REF = { senin: '2026-11-16', A: '00:00', B: '16:00', C: '08:00' };
function setup(emps, per, settings) {
  S.settings = Object.assign({ cutoff: 21, telatTarif: 10000, telatToleransi: 15, jamMasuk: '08:00', telatBebasJab: ['PROGRAMMER'], shiftJam: ['00:00', '08:00', '16:00'], shiftRef: REF }, settings);
  S.emps = {}; emps.forEach((e) => { S.emps[e.id] = Object.assign({ status: 'KONTRAK', metode: 'BULANAN', pembagi: 24, aktif: true, tglBergabung: '2020-01-01' }, e); });
  S.periods = { [NOV]: Object.assign({ key: NOV, absensi: {}, telat: {} }, per) }; S.periodKey = NOV; S.loans = {}; S.warns = {};
}
const plain = (x) => JSON.parse(JSON.stringify(x));
const scans = (list) => list.map(([d, hm]) => app.absMin(d, +hm.slice(0, 2) * 60 + +hm.slice(3)));

test('jadwal grup bergilir tiap Senin: 00.00 → 08.00 → 16.00', () => {
  setup([], {});
  assert.deepEqual(plain(['A', 'B', 'C'].map((g) => app.shiftOf(g, '2026-11-18'))), ['00:00', '16:00', '08:00']);
  assert.deepEqual(['A', 'B', 'C'].map((g) => app.shiftOf(g, '2026-11-23')), ['08:00', '00:00', '16:00']);
  assert.deepEqual(['A', 'B', 'C'].map((g) => app.shiftOf(g, '2026-11-09')), ['16:00', '08:00', '00:00']);
  assert.equal(app.jadwalMasuk({ grupShift: '' }, '2026-11-18'), '08:00');
});

test('telat hari Minggu dan yang diberi keterangan tidak dipotong', () => {
  setup([{ id: 'K1', nama: 'A', jabatan: 'OPERATOR CNC' }], { telat: { K1: { '2026-11-02': 30, '2026-11-08': 40, '2026-11-03': 70 } }, telatKet: { K1: { '2026-11-03': true } } });
  assert.deepEqual(plain(app.telatHitung('K1', NOV)), { jam: 1, hari: 1, menit: 30 });
});

test('mesin: karyawan shift dibandingkan dengan jam shift grup, longshift dan scan pulang tidak terbaca telat', () => {
  const H = { '2026-11-17': 'H', '2026-11-18': 'H', '2026-11-19': 'H', '2026-11-16': 'H' };
  setup([{ id: 'K1', nama: 'OP A', jabatan: 'OPERATOR CNC', grupShift: 'A' }, { id: 'K2', nama: 'KANTOR', jabatan: 'ADMIN' }], { absensi: { K1: H, K2: { '2026-11-17': 'H', '2026-11-18': 'H' } } });
  S.mesin = { from: '2026-11-15', to: '2026-11-20', map: { 1: { id: 'K1' }, 2: { id: 'K2' } }, scans: {
    // Grup A minggu 16 Nov = shift 00.00. Senin: masuk Minggu 23.40 (tepat waktu). Selasa: masuk 00.49 (telat 49).
    // Rabu: hanya scan pulang 08.03 dan masuk malam 23.43 → lupa scan masuk. Kamis: longshift 23.50 → pulang Jumat 16.00.
    1: scans([['2026-11-15', '23:40'], ['2026-11-16', '08:01'], ['2026-11-17', '00:49'], ['2026-11-17', '08:02'], ['2026-11-18', '08:03'], ['2026-11-18', '23:50'], ['2026-11-19', '16:00']]),
    2: scans([['2026-11-17', '08:20'], ['2026-11-17', '17:00'], ['2026-11-18', '07:55']]) } };
  const D = { key: NOV, dates: ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19'] };
  const { late, cek } = app.mesinTelatAll(D);
  assert.deepEqual(plain(late.map((r) => [r.e.id, r.d, r.m, r.j])), [['K1', '2026-11-17', 49, '00:00'], ['K2', '2026-11-17', 20, '08:00']]);
  assert.deepEqual(plain(cek.map((r) => [r.e.id, r.d, r.k])), [['K1', '2026-11-18', 'lupa']]);
});

test('jam kerja sendiri (OB 07.00–16.00) dipakai sebagai jam masuk non-shift', () => {
  const a = require('./app').loadApp();
  a.S.settings = { jamMasuk: '08:00' };
  assert.strictEqual(a.jadwalMasuk({ id: 'X', jamMasuk: '07:00' }, '2026-12-01'), '07:00');
  assert.strictEqual(a.jadwalMasuk({ id: 'Y' }, '2026-12-01'), '08:00');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(a.jamKerjaBaca('7.00 - 16.00'))), { jamMasuk: '07:00', jamPulang: '16:00' });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(a.jamKerjaBaca(''))), { jamMasuk: '', jamPulang: '' });
});
