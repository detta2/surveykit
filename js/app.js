/* app.js — SATU peta, dock 4 alat di bawah, lembar alat.
   Koordinat = mode default (ketuk peta langsung dapat koordinat). */
(function () {
  'use strict';

  var map = null;
  var current = null;
  var pickMode = false;
  var inited = {};
  var coordLayer = null;

  var TITLES = {
    coord: 'Koordinat',
    ukur: 'Ukur Jarak & Luas',
    kontur: 'Kontur',
    simpan: 'Tersimpan'
  };
  var HINTS = {
    coord: '📍 Ketuk titik mana saja di peta buat liat koordinatnya.',
    ukur: 'Ketuk titik-titik di peta — 2 titik jadi <b>jarak</b>, 3+ titik jadi <b>luas</b>.',
    kontur: '👆 Ketuk titik-titik ngikutin batas lahanmu.'
  };
  // modul yg perlu init sekali per alat (activate hanya untuk yg interaksi peta)
  var MODULES = {
    coord: ['ToolConverter'],
    ukur: ['ToolUkur', 'ToolMeasure', 'ToolProfile'],
    kontur: ['ToolContour'],
    simpan: []
  };

  function el(id) { return document.getElementById(id); }
  function toast(m) { if (window.GMap) GMap.toast(m); }
  function fmt(n, d) {
    return Number(n).toLocaleString('id-ID', { maximumFractionDigits: d == null ? 5 : d });
  }

  function ensureInit(name) {
    if (inited[name]) return;
    inited[name] = true;
    (MODULES[name] || []).forEach(function (m) {
      if (window[m] && window[m].init) window[m].init(map);
    });
  }

  window.AppHint = function (msg) {
    var h = el('hintbar');
    if (!msg) { h.style.display = 'none'; return; }
    h.innerHTML = msg;
    h.style.display = 'block';
  };
  window.AppSheet = {
    open: function () { document.body.classList.add('sheet-open'); },
    close: function () { document.body.classList.remove('sheet-open'); },
    toggle: function () { document.body.classList.toggle('sheet-open'); }
  };

  function setTool(name) {
    if (name === current) { AppSheet.toggle(); return; } // ketuk alat aktif = buka/tutup lembar
    if (current === 'ukur' && window.ToolUkur) ToolUkur.deactivate();
    if (current === 'kontur' && window.ToolContour) ToolContour.deactivate();
    pickMode = false;
    current = name;
    document.querySelectorAll('.dock-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tool === name);
    });
    ensureInit(name);
    document.querySelectorAll('.toolpane').forEach(function (p) {
      p.classList.toggle('active', p.dataset.pane === name);
    });
    el('sheet-title').textContent = TITLES[name] || 'Alat';
    AppSheet.open();
    if (name === 'ukur' && window.ToolUkur) ToolUkur.activate();
    if (name === 'kontur' && window.ToolContour) ToolContour.activate();
    AppHint(HINTS[name] || null);
  }

  function escAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function copyText(t) {
    function done() { toast('Disalin'); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { /* abaikan */ }
      ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(done, fallback);
    } else fallback();
  }

  // ketuk peta di mode Koordinat -> kartu hasil + tombol aksi
  function showCoord(latlng) {
    var lat = latlng.lat, lon = latlng.lng;
    coordLayer.clearLayers();
    coordLayer.addLayer(L.marker([lat, lon]));
    var rows = '';
    if (window.CoordFmt && CoordFmt.formats) {
      rows = CoordFmt.formats(lat, lon).map(function (f) {
        return '<div class="res copyable" data-copy="' + escAttr(f.value) + '" title="Ketuk buat menyalin">' +
          '<span>' + escAttr(f.label) + '</span><b>' + escAttr(f.value) + '</b></div>';
      }).join('');
    }
    el('cc-result').innerHTML =
      '<div class="res-grid">' + rows + '</div>' +
      '<div class="btn-row">' +
      '<button class="btn secondary" id="cc-save">🔖 Simpan titik ini</button>' +
      '<button class="btn secondary" id="cc-measure">📏 Ukur dari titik ini</button>' +
      '</div>' +
      '<p class="hint" style="margin-top:8px">Ketuk kotaknya buat menyalin.</p>';
    Array.prototype.forEach.call(el('cc-result').querySelectorAll('.copyable'), function (n) {
      n.addEventListener('click', function () { copyText(n.getAttribute('data-copy')); });
    });
    el('cc-save').addEventListener('click', function () {
      if (window.LayerManager) LayerManager.addBookmark(
        'Titik ' + lat.toFixed(4) + ', ' + lon.toFixed(4), lat, lon, map.getZoom());
    });
    el('cc-measure').addEventListener('click', function () {
      setTool('ukur');
      if (window.ToolUkur) ToolUkur.seed(L.latLng(lat, lon));
    });
    AppSheet.open();
  }

  // dipanggil tombol "📍 Ambil dari peta" di konverter
  window.AppPickCoord = function () {
    pickMode = true;
    AppSheet.close();
    AppHint('👆 <b>Ketuk satu titik di peta</b> buat ngisi koordinat…');
  };

  document.addEventListener('DOMContentLoaded', function () {
    map = window.GMap.init();
    if (window.LayerManager) LayerManager.init(map);
    if (window.NavPancang) NavPancang.init(map);
    coordLayer = L.layerGroup().addTo(map);
    if (window.LayerManager) LayerManager.register('Titik koordinat', coordLayer);

    var readout = el('coords');
    var defaultHint = readout.innerHTML;
    map.on('mousemove', function (e) {
      if (pickMode) return;
      readout.innerHTML = 'Lat <b>' + fmt(e.latlng.lat) + '</b> &nbsp; Lon <b>' + fmt(e.latlng.lng) + '</b>';
    });

    map.on('click', function (e) {
      if (pickMode) {
        pickMode = false;
        el('cv-lat').value = e.latlng.lat.toFixed(6);
        el('cv-lon').value = e.latlng.lng.toFixed(6);
        readout.innerHTML = defaultHint;
        el('cc-manual').style.display = '';
        AppSheet.open();
        AppHint(HINTS.coord);
        el('cv-go1').click();
        return;
      }
      if (current === 'ukur' && window.ToolUkur) { ToolUkur.handleClick(e.latlng); return; }
      if (current === 'kontur') return; // kontur menangani kliknya sendiri
      if (current === 'coord') showCoord(e.latlng);
    });

    document.querySelectorAll('.dock-btn').forEach(function (b) {
      b.addEventListener('click', function () { setTool(b.dataset.tool); });
    });
    el('sheet-close').addEventListener('click', AppSheet.close);
    el('cc-manual-toggle').addEventListener('click', function () {
      var m = el('cc-manual');
      m.style.display = m.style.display === 'none' ? '' : 'none';
    });

    // klik chip "SurveyKit" = sembunyikan/tampilkan menu (biar peta lega)
    var brand = el('brand-chip');
    function toggleUI() {
      var hidden = document.body.classList.toggle('ui-hidden');
      brand.setAttribute('aria-pressed', hidden ? 'true' : 'false');
      brand.title = hidden ? 'Tampilkan menu' : 'Sembunyikan menu';
    }
    brand.addEventListener('click', toggleUI);
    brand.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleUI(); }
    });

    // panduan
    var help = el('help');
    el('help-btn').addEventListener('click', function () { help.style.display = 'grid'; });
    el('help-close').addEventListener('click', function () { help.style.display = 'none'; });
    help.addEventListener('click', function (e) { if (e.target === help) help.style.display = 'none'; });

    // mulai: mode Koordinat, lembar terbuka
    setTool('coord');
  });
})();
