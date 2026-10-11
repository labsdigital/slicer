'use strict';
/* =========================================================
   Uji regresi SLICER — jalankan: node test.js
   Menjalankan script.js sungguhan di atas stub DOM mini
   (tanpa browser) untuk memastikan:
   1. Mode "Sama Rata" → tombol Potong menghasilkan potongan.
   2. Mode "Geser manual" → potong memakai posisi garis hasil drag (bukan reset).
   3. Garis manual tidak bisa menyeber satu sama lain (clamp).
   ========================================================= */

const fs = require('fs');
const path = require('path');

/* ---------- stub DOM mini ---------- */

class El {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.style = {};
    this.dataset = {};
    this._cls = '';
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.files = null;
    this.parent = null;
    this._listeners = {};
    const self = this;
    this.classList = {
      add: (...cs) => { const s = new Set(self._cls.split(/\s+/).filter(Boolean)); cs.forEach((c) => s.add(c)); self._cls = [...s].join(' '); },
      remove: (...cs) => { const s = new Set(self._cls.split(/\s+/).filter(Boolean)); cs.forEach((c) => s.delete(c)); self._cls = [...s].join(' '); },
      toggle: (c, force) => { const want = force === undefined ? !self.classList.contains(c) : force; if (want) self.classList.add(c); else self.classList.remove(c); },
      contains: (c) => self._cls.split(/\s+/).includes(c),
    };
  }
  get className() { return this._cls; }
  set className(v) { this._cls = String(v); }
  get innerHTML() { return ''; }
  set innerHTML(v) { if (!v) this.children = []; }
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  removeEventListener(type, fn) { const a = this._listeners[type] || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
  _fire(type, ev = {}) {
    ev.preventDefault = ev.preventDefault || (() => {});
    ev.stopPropagation = ev.stopPropagation || (() => {});
    for (const fn of (this._listeners[type] || []).slice()) fn(ev);
  }
  appendChild(c) {
    if (c && c.isFragment) { c.children.forEach((x) => { x.parent = this; this.children.push(x); }); c.children = []; return c; }
    c.parent = this; this.children.push(c); return c;
  }
  append(...cs) { cs.forEach((c) => this.appendChild(c)); }
  remove() { if (this.parent) { const i = this.parent.children.indexOf(this); if (i >= 0) this.parent.children.splice(i, 1); } }
  setAttribute() {}
  removeAttribute() {}
  click() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 832 }; }
  _matches(sel) { return this._cls.split(/\s+/).includes(sel.replace(/^\./, '')); }
  querySelectorAll(sel) { const out = []; const walk = (n) => n.children.forEach((ch) => { if (ch._matches && ch._matches(sel)) out.push(ch); walk(ch); }); walk(this); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  getContext() {
    return {
      createLinearGradient: () => ({ addColorStop() {} }),
      fillRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
      moveTo() {}, lineTo() {}, fillText() {}, drawImage() {},
    };
  }
  toBlob(cb) { setTimeout(() => cb({ type: 'image/png', size: 1 }), 0); }
}

const byId = new Map();
const doc = {
  getElementById(id) { if (!byId.has(id)) byId.set(id, new El('div')); return byId.get(id); },
  createElement(tag) { return new El(tag); },
  createDocumentFragment() { const f = new El('#fragment'); f.isFragment = true; return f; },
  addEventListener() {},
};
const win = new El('#window');

class FakeImage {
  constructor() { this.naturalWidth = 1280; this.naturalHeight = 832; }
  set src(v) { this._src = v; setTimeout(() => this.onload && this.onload(), 0); }
  get src() { return this._src; }
}

let blobSeq = 0;
const URLStub = { createObjectURL: () => 'blob:' + (++blobSeq), revokeObjectURL() {} };

/* ---------- jalankan script.js sungguhan ---------- */

global.document = doc;
global.window = win;
global.Image = FakeImage;
global.URL = URLStub;

const src = fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8');
eval(src); // semua deklarasi terkurung di eval; driver lewat event listener

/* ---------- util uji ---------- */

const el = (id) => doc.getElementById(id);
const flush = () => new Promise((r) => setTimeout(r, 15));
const aspectOf = (grid, i) => grid.children[i].children[0].style.aspectRatio;

let failed = 0;
function assertEq(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n        expected: ${JSON.stringify(expected)}\n        actual  : ${JSON.stringify(actual)}`}`);
}

/* ---------- skenario ---------- */

(async () => {
  // 1. muat gambar 1280×832 lewat input file
  el('file-input').files = [{ type: 'image/png', name: 'uji-coba.png' }];
  el('file-input')._fire('change');
  await flush();
  assertEq('readout sumber', el('ro-src').textContent, '1280 × 832 px');
  assertEq('readout total potongan (dulu "NaN buah")', el('ro-count').textContent, '9 buah');
  assertEq('readout sisa potong', el('ro-crop').textContent, '2 × 1 px');

  // 2. REPRO LAPORAN: Sama Rata → Potong (dulu: 0 potongan, "NaN potongan")
  el('slice-btn')._fire('click');
  await flush();
  assertEq('meta potong mode Sama Rata', el('res-meta').textContent, '9 potongan · 426 × 277 px');
  assertEq('jumlah kartu hasil mode Sama Rata', el('results-grid').children.length, 9);
  assertEq('label unduh semua', el('dl-all-label').textContent, 'Unduh semua (9)');
  assertEq('ukuran potongan r1c1 (Sama Rata)', aspectOf(el('results-grid'), 0), '426 / 277');

  // 3. Geser Manual → garis muncul di overlay
  el('slicer-free')._fire('click');
  const lines1 = el('overlay').querySelectorAll('.slicer-line');
  assertEq('jumlah garis manual (2 tegak + 2 datar)', lines1.length, 4);

  // 4. drag garis tegak pertama ke x=500 → potong harus pakai posisi geseran
  const lineV0 = lines1.find((l) => l.dataset.type === 'v' && Number(l.dataset.index) === 0);
  lineV0._fire('mousedown');
  win._fire('mousemove', { clientX: 500, clientY: 0 });
  win._fire('mouseup');
  el('slice-btn')._fire('click');
  await flush();
  assertEq('meta potong mode Geser manual', el('res-meta').textContent, '9 potongan · 1280 × 832 px');
  assertEq('potongan r1c1 memakai garis drag (bukan reset)', aspectOf(el('results-grid'), 0), '500 / 277');

  // 5. coba menyeber garis lain → di-clamp (r1c2 jadi 1px, bukan saling tukar)
  const lines2 = el('overlay').querySelectorAll('.slicer-line');
  const lineV1 = lines2.find((l) => l.dataset.type === 'v' && Number(l.dataset.index) === 1);
  lineV1._fire('mousedown');
  win._fire('mousemove', { clientX: 100, clientY: 0 }); // melewati garis di x=500
  win._fire('mouseup');
  el('slice-btn')._fire('click');
  await flush();
  assertEq('clamp garis: tidak menyeber', aspectOf(el('results-grid'), 1), '1 / 277');

  // 6. kembali ke Sama Rata → Potong tetap berhasil
  el('slicer-equal')._fire('click');
  el('slice-btn')._fire('click');
  await flush();
  assertEq('meta potong Sama Rata (kembali)', el('res-meta').textContent, '9 potongan · 426 × 277 px');
  assertEq('jumlah kartu Sama Rata (kembali)', el('results-grid').children.length, 9);

  // 7. ubah jumlah baris lewat stepper, potong lagi
  el('rows-plus')._fire('click');
  assertEq('readout total potongan 4×3', el('ro-count').textContent, '12 buah');
  el('slice-btn')._fire('click');
  await flush();
  assertEq('meta potong 4×3', el('res-meta').textContent, '12 potongan · 426 × 208 px');
  assertEq('jumlah kartu 4×3', el('results-grid').children.length, 12);

  console.log(failed ? `\n${failed} uji GAGAL` : '\nSemua uji lulus ✔');
  process.exit(failed ? 1 : 0);
})();
