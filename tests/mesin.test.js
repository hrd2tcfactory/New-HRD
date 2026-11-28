// Log USB mesin absen (.txt): sandi XOR, pasangan jam masuk–pulang, shift malam dan longshift.
const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app');

const app = loadApp();
const J = (o) => JSON.parse(JSON.stringify(o));
function logFile(rows, key) {
  const head = 'UDISKLOG\tversion=4\r\nNo\tMchn\tEnNo\t\tName\t\t\tMode\tIOMd\tDateTime\r\n';
  const body = rows.map((r, i) => [String(i + 1).padStart(6, '0'), 'MESIN', r[0], (r[1] + '                ').slice(0, 16), '268435456', r[2], r[3]].join('\t')).join('\r\n');
  const txt = head + body + '\r\n';
  return Uint8Array.from(txt, (ch) => ch.charCodeAt(0) ^ (key || 0));
}

test('membaca log USB yang disandikan dan memasangkan jam masuk–pulang', () => {
  const f = logFile([
    ['7', 'BUDI', '001', '2026/05/04  07:58:10'], ['7', 'BUDI', '002', '2026/05/04  17:02:00'],
    ['9', 'ANI', '001', '2026/05/04  23:47:00'], ['9', 'ANI', '002', '2026/05/05  08:15:00'],
  ], 0xd7);
  const M = app.mesinTxt(f);
  assert.deepStrictEqual(Object.keys(M.people).sort(), ['7', '9']);
  assert.strictEqual(M.people['7'].nama, 'BUDI');
  assert.deepStrictEqual(J(M.jam['7']['2026-05-04']), [478, 1022]);
  // masuk 23.47 = shift 00.00 tanggal 5 Mei; jam masuk negatif (malam sebelumnya)
  assert.deepStrictEqual(J(M.jam['9']['2026-05-05']), [-13, 495]);
  assert.strictEqual(M.jam['9']['2026-05-04'], undefined);
  assert.strictEqual(M.from, '2026-05-04');
  assert.strictEqual(M.to, '2026-05-05');
});

test('file tanpa sandi juga terbaca', () => {
  const M = app.mesinTxt(logFile([['3', 'C', '001', '2026/05/06  08:00:00'], ['3', 'C', '002', '2026/05/06  16:00:00']], 0));
  assert.deepStrictEqual(J(M.jam['3']['2026-05-06']), [480, 960]);
});

test('longshift: pulang lalu lembur masuk disambung sampai lembur pulang', () => {
  const a = (d, m) => app.absMin(d, m);
  const dd = app.mesinJam([[a('2026-05-02', 946), 1, '2026-05-02', 946], [a('2026-05-03', 13), 2, '2026-05-03', 13], [a('2026-05-03', 15), 5, '2026-05-03', 15], [a('2026-05-03', 492), 6, '2026-05-03', 492]]);
  assert.deepStrictEqual(J(dd), { '2026-05-02': [946, 1440 + 492] });
});

test('dua kali scan pulang tanpa masuk: hari berikutnya ditandai tidak scan masuk', () => {
  const a = (d, m) => app.absMin(d, m);
  const dd = app.mesinJam([[a('2026-05-06', 1414), 1, '2026-05-06', 1414], [a('2026-05-07', 495), 2, '2026-05-07', 495], [a('2026-05-08', 494), 2, '2026-05-08', 494]]);
  assert.deepStrictEqual(J(dd['2026-05-07']), [-26, 495]);
  assert.deepStrictEqual(J(dd['2026-05-08']), [null, 494]);
});

test('scan pulang yang tertekan dua kali dalam beberapa menit diabaikan', () => {
  const a = (d, m) => app.absMin(d, m);
  const dd = app.mesinJam([[a('2026-05-09', 448), 1, '2026-05-09', 448], [a('2026-05-09', 450), 2, '2026-05-09', 450], [a('2026-05-09', 1020), 2, '2026-05-09', 1020]]);
  assert.deepStrictEqual(J(dd['2026-05-09']), [448, 1020]);
});
