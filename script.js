'use strict';

/* =========================================================
   SLICER — potong gambar menjadi baris × kolom, 100% lokal
   ========================================================= */

const $ = (id) => document.getElementById(id);

const els = {
  dropzone: $('dropzone'), fileInput: $('file-input'), sampleBtn: $('sample-btn'),
  chip: $('file-chip'), chipThumb: $('chip-thumb'), chipName: $('chip-name'), chipDims: $('chip-dims'),
  controls: $('controls'),
  rowsMinus: $('rows-minus'), rowsPlus: $('rows-plus'), rowsNum: $('rows-num'), rowsRange: $('rows-range'),
  colsMinus: $('cols-minus'), colsPlus: $('cols-plus'), colsNum: $('cols-num'), colsRange: $('cols-range'),
  roSrc: $('ro-src'), roSlice: $('ro-slice'), roCrop: $('ro-crop'), roCount: $('ro-count'),
  previewEmpty: $('preview-empty'), frame: $('frame'), previewImg: $('preview-img'), overlay: $('overlay'),
  capGrid: $('cap-grid'), capDims: $('cap-dims'),
  resultsEmpty: $('results-empty'), resultsGrid: $('results-grid'),
  resMeta: $('res-meta'), dlAll: $('dl-all'), dlAllLabel: $('dl-all-label'),
  resetBtn: $('reset-btn'), toast: $('toast'),
};

const MIN = 1;
const MAX = 10;
const RESLICE_DELAY = 280;   // debounce saat mengubah baris/kolom
const DOWNLOAD_GAP = 320;    // jeda antar unduhan massal

const state = {
  img: null,
  objectUrl: null,   // URL pratinjau yang sedang dipakai
  baseName: 'gambar',
  rows: 3,
  cols: 3,
  slices: [],        // { url, r, c, w, h, filename }
  sliceTimer: null,
};

/* ---------- util ---------- */

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let toastTimer = null;
function toast(msg, isError = false) {
  els.toast.textContent = msg;
  els.toast.classList.toggle('toast-err', isError);
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2600);
}

function baseNameFrom(name) {
  const base = String(name || '')
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9\-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || 'gambar';
}

function sliceMetrics() {
  const iw = state.img.naturalWidth;
  const ih = state.img.naturalHeight;
  const sw = Math.max(1, Math.floor(iw / state.cols)); // potongan seragam, sisa dipangkas
  const sh = Math.max(1, Math.floor(ih / state.rows));
  return {
    iw, ih, sw, sh,
    remX: iw - sw * state.cols,
    remY: ih - sh * state.rows,
    tooSmall: iw < state.cols || ih < state.rows,
  };
}

/* ---------- memuat gambar ---------- */

function setImage(img, displayName, baseName, url) {
  clearSlices();
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);

  state.img = img;
  state.baseName = baseName;
  state.objectUrl = url;

  els.previewImg.src = url;
  els.previewEmpty.hidden = true;
  els.frame.hidden = false;
  els.controls.classList.remove('is-disabled');

  els.chip.hidden = false;
  els.chipThumb.src = url;
  els.chipName.textContent = displayName;
  els.chipDims.textContent = `${img.naturalWidth} × ${img.naturalHeight} px`;

  updateReadout();
  renderOverlay();
  scheduleSlice();
  toast(`Gambar dimuat — ${img.naturalWidth} × ${img.naturalHeight} px`);
}

function handleFile(file) {
  if (!file) return;
  if (!file.type || !file.type.startsWith('image/')) {
    toast('File itu bukan gambar — coba PNG, JPG, atau WEBP.', true);
    return;
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => setImage(img, file.name, baseNameFrom(file.name), url);
  img.onerror = () => { URL.revokeObjectURL(url); toast('Gagal membaca gambar.', true); };
  img.src = url;
}

/* ---------- readout & pratinjau ---------- */

function updateReadout() {
  if (!state.img) {
    els.roSrc.textContent = '—';
    els.roSlice.textContent = '—';
    els.roCrop.textContent = '—';
    els.roCount.textContent = '—';
    els.roSlice.classList.remove('warn');
    els.capDims.textContent = '—';
    return;
  }
  const m = sliceMetrics();
  els.roSrc.textContent = `${m.iw} × ${m.ih} px`;
  els.roSlice.textContent = `${m.sw} × ${m.sh} px`;
  els.roSlice.classList.toggle('warn', m.tooSmall);
  els.roCrop.textContent = m.tooSmall
    ? 'grid melebihi gambar'
    : (m.remX || m.remY ? `${m.remX} × ${m.remY} px` : 'pas — 0 px');
  els.roCount.textContent = `${state.rows * state.cols} buah`;
  els.capDims.textContent = `${m.iw} × ${m.ih} px`;
}

function renderOverlay() {
  els.overlay.innerHTML = '';
  els.capGrid.textContent = state.img ? `${state.cols} × ${state.rows}` : '— × —';
  if (!state.img) return;

  const m = sliceMetrics();
  const frag = document.createDocumentFragment();
  const mk = (cls, style) => {
    const d = document.createElement('span');
    d.className = cls;
    Object.assign(d.style, style);
    frag.appendChild(d);
  };

  for (let k = 1; k < state.cols; k++) mk('line-v', { left: ((k * m.sw / m.iw) * 100) + '%' });
  for (let k = 1; k < state.rows; k++) mk('line-h', { top: ((k * m.sh / m.ih) * 100) + '%' });
  if (m.remX > 0) mk('rem rem-x', { width: ((m.remX / m.iw) * 100) + '%' });
  if (m.remY > 0) mk('rem rem-y', { height: ((m.remY / m.ih) * 100) + '%' });
  for (let r = 1; r < state.rows; r++) {
    for (let c = 1; c < state.cols; c++) {
      mk('node', { left: ((c * m.sw / m.iw) * 100) + '%', top: ((r * m.sh / m.ih) * 100) + '%' });
    }
  }
  els.overlay.appendChild(frag);
}

/* ---------- gambar contoh ---------- */

function makeSample() {
  const w = 1280, h = 832;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const x = cv.getContext('2d');

  const g = x.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#F4F0E6');
  g.addColorStop(0.55, '#E4DCCB');
  g.addColorStop(1, '#CFC4AE');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);

  x.strokeStyle = 'rgba(23,20,16,.06)';
  x.lineWidth = 1;
  for (let i = 0; i <= w; i += 40) { x.beginPath(); x.moveTo(i + .5, 0); x.lineTo(i + .5, h); x.stroke(); }
  for (let j = 0; j <= h; j += 40) { x.beginPath(); x.moveTo(0, j + .5); x.lineTo(w, j + .5); x.stroke(); }

  x.fillStyle = '#FF4D00';
  x.beginPath(); x.arc(w * 0.68, h * 0.34, 170, 0, Math.PI * 2); x.fill();

  x.strokeStyle = '#161410';
  x.lineWidth = 7;
  x.beginPath(); x.arc(w * 0.3, h * 0.62, 150, 0, Math.PI * 2); x.stroke();

  x.fillStyle = '#161410';
  x.fillRect(70, h - 122, w - 140, 26);

  x.fillStyle = '#161410';
  x.font = '700 96px "Bricolage Grotesque", sans-serif';
  x.fillText('CONTOH', 84, 158);
  x.fillStyle = 'rgba(23,20,16,.55)';
  x.font = '500 26px "IBM Plex Mono", monospace';
  x.fillText('SLICER · 1280 × 832', 86, 200);

  cv.toBlob((b) => {
    if (!b) { toast('Gagal membuat gambar contoh.', true); return; }
    const url = URL.createObjectURL(b);
    const img = new Image();
    img.onload = () => setImage(img, 'contoh-slicer.png', 'contoh-slicer', url);
    img.onerror = () => { URL.revokeObjectURL(url); toast('Gagal memuat contoh.', true); };
    img.src = url;
  }, 'image/png');
}

/* ---------- pemotongan ---------- */

function scheduleSlice() {
  if (!state.img) return;
  clearTimeout(state.sliceTimer);
  state.sliceTimer = setTimeout(sliceNow, RESLICE_DELAY);
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob gagal'))), 'image/png');
  });
}

function clearSlices(hideGrid = true) {
  for (const s of state.slices) URL.revokeObjectURL(s.url);
  state.slices = [];
  els.resultsGrid.innerHTML = '';
  if (hideGrid) {
    els.resultsGrid.hidden = true;
    els.resultsEmpty.hidden = false;
  }
  els.dlAll.disabled = true;
  els.dlAllLabel.textContent = 'Unduh semua';
}

async function sliceNow() {
  if (!state.img) return;
  clearTimeout(state.sliceTimer);

  clearSlices(false);
  const { img, rows, cols } = state;
  const m = sliceMetrics();

  els.resultsEmpty.hidden = true;
  els.resultsGrid.hidden = false;
  els.resultsGrid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  els.resMeta.textContent = 'memotong…';

  try {
    const jobs = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cv = document.createElement('canvas');
        cv.width = m.sw;
        cv.height = m.sh;
        cv.getContext('2d').drawImage(img, c * m.sw, r * m.sh, m.sw, m.sh, 0, 0, m.sw, m.sh);
        jobs.push({ r, c, cv });
      }
    }

    const blobs = await Promise.all(jobs.map((j) => canvasToBlob(j.cv)));
    const grid = els.resultsGrid;

    blobs.forEach((blob, i) => {
      const { r, c } = jobs[i];
      const rec = {
        url: URL.createObjectURL(blob),
        r, c, w: m.sw, h: m.sh,
        filename: `${state.baseName}_r${r + 1}c${c + 1}.png`,
      };
      state.slices.push(rec);
      grid.appendChild(cardFor(rec, i));
    });

    els.resMeta.textContent = `${rows * cols} potongan · ${m.sw} × ${m.sh} px`;
    els.dlAll.disabled = false;
    els.dlAllLabel.textContent = `Unduh semua (${rows * cols})`;
  } catch (err) {
    console.error(err);
    clearSlices();
    els.resMeta.textContent = 'gagal memotong';
    toast('Gagal memotong gambar.', true);
  }
}

function cardFor(rec, i) {
  const fig = document.createElement('figure');
  fig.className = 'slice';
  fig.style.animationDelay = `${Math.min(i * 26, 520)}ms`;

  const box = document.createElement('div');
  box.className = 'slice-img';
  box.style.aspectRatio = `${rec.w} / ${rec.h}`;

  const im = document.createElement('img');
  im.src = rec.url;
  im.alt = `Potongan baris ${rec.r + 1}, kolom ${rec.c + 1}`;
  im.loading = 'lazy';
  box.appendChild(im);

  const cap = document.createElement('figcaption');
  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.textContent = `B${rec.r + 1}·K${rec.c + 1}`;
  const dim = document.createElement('span');
  dim.className = 'dim';
  dim.textContent = `${rec.w} × ${rec.h}`;
  const a = document.createElement('a');
  a.className = 'dl';
  a.href = rec.url;
  a.download = rec.filename;
  a.title = `Unduh ${rec.filename}`;
  a.setAttribute('aria-label', `Unduh ${rec.filename}`);
  a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
  cap.append(tag, dim, a);

  fig.append(box, cap);
  return fig;
}

/* ---------- unduh ---------- */

async function downloadAll() {
  const list = state.slices.slice();
  if (!list.length) return;
  els.dlAll.disabled = true;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const a = document.createElement('a');
    a.href = s.url;
    a.download = s.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (i < list.length - 1) await delay(DOWNLOAD_GAP);
  }
  els.dlAll.disabled = false;
  toast(`${list.length} potongan diunduh`);
}

/* ---------- kontrol baris / kolom ---------- */

function setCount(axis, v) {
  v = Math.round(Number(v));
  if (!Number.isFinite(v)) return; // input sedang kosong / tidak valid
  v = Math.min(MAX, Math.max(MIN, v));
  state[axis] = v;
  const num = axis === 'rows' ? els.rowsNum : els.colsNum;
  const range = axis === 'rows' ? els.rowsRange : els.colsRange;
  num.value = String(v);
  range.value = String(v);
  updateReadout();
  renderOverlay();
  scheduleSlice();
}

function bindStepper(axis) {
  const p = axis; // 'rows' | 'cols'
  els[p + 'Minus'].addEventListener('click', () => setCount(axis, state[axis] - 1));
  els[p + 'Plus'].addEventListener('click', () => setCount(axis, state[axis] + 1));
  const num = els[p + 'Num'];
  const range = els[p + 'Range'];
  num.addEventListener('input', () => setCount(axis, num.value));
  num.addEventListener('blur', () => { num.value = String(state[axis]); });
  range.addEventListener('input', () => setCount(axis, range.value));
}

/* ---------- reset ---------- */

function resetAll() {
  clearSlices();
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.img = null;
  state.objectUrl = null;
  state.baseName = 'gambar';
  els.previewImg.removeAttribute('src');
  els.chipThumb.removeAttribute('src');
  els.frame.hidden = true;
  els.previewEmpty.hidden = false;
  els.chip.hidden = true;
  els.controls.classList.add('is-disabled');
  els.resMeta.textContent = '—';
  els.fileInput.value = '';
  setCount('rows', 3);
  setCount('cols', 3);
  toast('Diatur ulang — muat gambar baru.');
}

/* ---------- event ---------- */

function bindEvents() {
  // unggah: klik & keyboard
  els.dropzone.addEventListener('click', () => els.fileInput.click());
  els.dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.fileInput.click(); }
  });
  els.fileInput.addEventListener('change', () => {
    handleFile(els.fileInput.files && els.fileInput.files[0]);
    els.fileInput.value = '';
  });
  els.sampleBtn.addEventListener('click', makeSample);

  // seret & lepas
  ['dragenter', 'dragover'].forEach((ev) =>
    els.dropzone.addEventListener(ev, (e) => { e.preventDefault(); els.dropzone.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) =>
    els.dropzone.addEventListener(ev, (e) => { e.preventDefault(); els.dropzone.classList.remove('drag'); }));
  els.dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleFile(file);
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  // tempel dari clipboard (Ctrl+V)
  document.addEventListener('paste', (e) => {
    const files = e.clipboardData && e.clipboardData.files;
    if (!files || !files.length) return;
    const imgFile = Array.from(files).find((f) => f.type.startsWith('image/'));
    if (imgFile) { handleFile(imgFile); toast('Gambar ditempel dari clipboard.'); }
  });

  // baris / kolom
  bindStepper('rows');
  bindStepper('cols');

  // unduh semua & reset
  els.dlAll.addEventListener('click', downloadAll);
  els.resetBtn.addEventListener('click', resetAll);
}

/* ---------- inisialisasi ---------- */

function init() {
  bindEvents();
  setCount('rows', 3);
  setCount('cols', 3);
}

init();



