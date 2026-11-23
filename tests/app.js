// Memuat kode aplikasi dari index.html ke dalam sandbox Node, tanpa browser dan tanpa Firebase,
// supaya rumus gaji yang diuji adalah rumus yang benar-benar dipakai situs.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Elemen palsu: semua properti dan pemanggilan mengembalikan dirinya sendiri.
function fakeEl() {
  const f = function () {};
  const p = new Proxy(f, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => '';
      if (k === 'then') return undefined;
      if (k === 'length') return 0;
      if (k === 'style' || k === 'dataset' || k === 'classList') return p;
      return p;
    },
    set() { return true; },
    apply() { return p; },
  });
  return p;
}

const EXPORTS = ['S', 'liveCalc', 'calc', 'proRange', 'workDays', 'periodRange', 'periodDates', 'keyFor', 'counts',
  'kasbonFor', 'loanDeduction', 'otRate', 'shRateFor', 'mealDays', 'cutiSisa', 'cutiUsed', 'payEmp', 'slipCutiHtml', 'shiftOf', 'jadwalMasuk', 'mesinTelatAll', 'absMin', 'telatHitung', 'iso', 'parse'];

function loadApp() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  // Kode utama dibungkus (function(){ ... })(); — ekspor fungsi yang diuji dari dalam pembungkus itu.
  const exp = 'globalThis.__app={' + EXPORTS.join(',') + '};\n';
  const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).map((c) => {
    if (!/^\s*\(function\(\)\{/.test(c)) return c;
    const i = c.lastIndexOf('})();'); return c.slice(0, i) + exp + c.slice(i);
  }).join('\n;\n');
  const el = fakeEl();
  const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  const ctx = {
    console, Math, Date, JSON, Object, Array, String, Number, Set, Map, Promise, RegExp, Error, Symbol, Intl, parseInt, parseFloat, isNaN, encodeURIComponent,
    document: { addEventListener() {}, getElementById: () => el, querySelector: () => el, querySelectorAll: () => [], createElement: () => el, body: el, head: el, activeElement: null },
    localStorage: store(), sessionStorage: store(), location: { origin: '', hash: '', reload() {} }, navigator: {},
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0,
    addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), fetch: () => new Promise(() => {}),
    Blob: function () {}, URL: { createObjectURL: () => '', revokeObjectURL() {} }, Image: function () {}, innerWidth: 1400,
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: 'index.html' });
  if (!ctx.__app) throw new Error('Kode utama index.html tidak ditemukan');
  return ctx.__app;
}

// Pengaturan dasar seperti di aplikasi: cut-off 21, tarif lembur 20.000, uang makan 20.000 bila lembur >= 4 jam.
function baseSettings(extra) {
  return Object.assign({ nama: 'TEST', cutoff: 21, uangLembur: 20000, uangMakan: 20000, makanMinJam: 4, shBatas: 100000, shPotong: 50000, shPotongRendah: 30000, potongBulanan: [], libur: [] }, extra || {});
}

// Isi absensi kode `code` untuk tanggal-tanggal ISO.
function fill(dates, code) { const o = {}; dates.forEach((d) => { o[d] = code; }); return o; }

module.exports = { loadApp, baseSettings, fill };
