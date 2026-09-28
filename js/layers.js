/* layers.js — Layer Manager ala Global Mapper Control Center:
   daftar layer hasil (kontur/ukur/profil/GPS/import), eye toggle, transparansi, hapus,
   import SHP/KML/GeoJSON/GPX (drag & drop), export peta PNG, bookmark lokasi. */
(function () {
  'use strict';
  var map = null, entries = [], seq = 0, pending = [];
  var BM_KEY = 'sk_bookmarks_v1';

  var EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>';
  var PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(m) { if (window.GMap && GMap.toast) GMap.toast(m); }

  function init(m) {
    if (map) return;
    map = m;
    for (var i = 0; i < pending.length; i++) doRegister(pending[i][0], pending[i][1], pending[i][2]);
    pending = [];
    var box = document.getElementById('lyr-list');
    if (box) {
      box.addEventListener('click', function (ev) {
        var btn = ev.target.closest('[data-act]'); if (!btn) return;
        var row = ev.target.closest('.lyr-row'); if (!row) return;
        var id = row.getAttribute('data-id'), act = btn.getAttribute('data-act');
        if (act === 'eye') toggle(id);
        else if (act === 'del') removeEntry(id);
      });
      box.addEventListener('input', function (ev) {
        if (ev.target.getAttribute && ev.target.getAttribute('data-act') === 'op') {
          var row = ev.target.closest('.lyr-row'); if (!row) return;
          setOpacity(row.getAttribute('data-id'), ev.target.value / 100);
        }
      });
    }
    renderList();
    initImport();
    initExport();
    initBookmarks();
  }

  function doRegister(name, layer, opts) {
    opts = opts || {};
    var e = { id: 'lyr-' + (++seq), name: name, layer: layer, removable: opts.removable !== false, visible: true, opacity: 1 };
    entries.push(e);
    renderList();
    return e.id;
  }
  // register aman dipanggil sebelum init (diantrekan)
  function register(name, layer, opts) {
    if (!map || !layer) { pending.push([name, layer, opts || {}]); return 'pending-' + (++seq); }
    return doRegister(name, layer, opts);
  }
  function find(id) {
    for (var i = 0; i < entries.length; i++) if (entries[i].id === id) return entries[i];
    return null;
  }
  function unregister(id) {
    var e = find(id); if (!e) return;
    try { map.removeLayer(e.layer); } catch (x) {}
    entries = entries.filter(function (x) { return x.id !== id; });
    renderList();
  }
  function toggle(id) {
    var e = find(id); if (!e) return;
    e.visible = !e.visible;
    if (e.visible) e.layer.addTo(map); else map.removeLayer(e.layer);
    renderList();
  }
  function removeEntry(id) {
    var e = find(id); if (!e || !e.removable) return;
    map.removeLayer(e.layer);
    entries = entries.filter(function (x) { return x.id !== id; });
    toast('Layer dihapus: ' + e.name);
    renderList();
  }
  function applyOpacity(layer, v) {
    if (layer.eachLayer) { layer.eachLayer(function (l) { applyOpacity(l, v); }); return; }
    if (layer.setStyle) layer.setStyle({ opacity: v, fillOpacity: Math.max(0.04, v * 0.55) });
    else if (layer.setOpacity) layer.setOpacity(v);
  }
  function setOpacity(id, v) {
    var e = find(id); if (!e) return;
    e.opacity = v;
    applyOpacity(e.layer, v);
  }

  function renderList() {
    var box = document.getElementById('lyr-list');
    if (!box) return;
    if (!entries.length) {
      box.innerHTML = '<p class="hint">Belum ada layer. Hasil Kontur, Ukur Lahan, Profil, import file, dan posisi GPS akan tercatat di sini.</p>';
      return;
    }
    box.innerHTML = entries.map(function (e) {
      return '<div class="lyr-row' + (e.visible ? '' : ' off') + '" data-id="' + e.id + '">' +
        '<button class="lyr-eye" data-act="eye" title="Tampilkan / sembunyikan">' + (e.visible ? EYE : EYE_OFF) + '</button>' +
        '<span class="lyr-name">' + esc(e.name) + '</span>' +
        '<input class="lyr-op" type="range" min="15" max="100" value="' + Math.round(e.opacity * 100) + '" title="Transparansi" data-act="op">' +
        (e.removable ? '<button class="lyr-del" data-act="del" title="Hapus layer">✕</button>' : '') +
        '</div>';
    }).join('');
  }

  // ---------- import file: SHP / KML / GeoJSON / GPX ----------
  function readText(f, cb) {
    var r = new FileReader();
    r.onload = function () { cb(r.result); };
    r.onerror = function () { toast('Gagal baca ' + f.name); };
    r.readAsText(f);
  }
  function readBuf(f, cb) {
    var r = new FileReader();
    r.onload = function () { cb(r.result); };
    r.onerror = function () { toast('Gagal baca ' + f.name); };
    r.readAsArrayBuffer(f);
  }
  function initImport() {
    var fi = document.getElementById('lyr-file');
    if (fi) fi.addEventListener('change', function () { handleFiles(fi.files); fi.value = ''; });
    var mapEl = document.getElementById('map');
    if (!mapEl) return;
    var depth = 0;
    mapEl.addEventListener('dragenter', function (e) { e.preventDefault(); depth++; mapEl.classList.add('drop-hi'); });
    mapEl.addEventListener('dragover', function (e) { e.preventDefault(); });
    mapEl.addEventListener('dragleave', function (e) { e.preventDefault(); if (--depth <= 0) { depth = 0; mapEl.classList.remove('drop-hi'); } });
    mapEl.addEventListener('drop', function (e) {
      e.preventDefault(); depth = 0; mapEl.classList.remove('drop-hi');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    });
  }
  function handleFiles(files) {
    Array.prototype.forEach.call(files, function (f) {
      var ext = (f.name.split('.').pop() || '').toLowerCase();
      if (ext === 'geojson' || ext === 'json') {
        readText(f, function (t) {
          try { addImport(f.name, JSON.parse(t)); } catch (e) { toast('Gagal baca ' + f.name); }
        });
      } else if (ext === 'kml' || ext === 'gpx') {
        readText(f, function (t) {
          if (typeof toGeoJSON === 'undefined') { toast('Pustaka ' + ext.toUpperCase() + ' belum termuat'); return; }
          try {
            var xml = new DOMParser().parseFromString(t, 'text/xml');
            addImport(f.name, ext === 'kml' ? toGeoJSON.kml(xml) : toGeoJSON.gpx(xml));
          } catch (e) { toast('Gagal baca ' + f.name); }
        });
      } else if (ext === 'zip' || ext === 'shp') {
        readBuf(f, function (b) {
          if (typeof shp === 'undefined') { toast('Pustaka SHP belum termuat'); return; }
          toast('Membaca shapefile…');
          shp(b).then(function (gj) { addImport(f.name, gj); })
                .catch(function () { toast('Gagal baca shapefile ' + f.name); });
        });
      } else {
        toast('Format .' + ext + ' belum didukung');
      }
    });
  }
  function styleFor(f) {
    var t = (f.geometry && f.geometry.type) || '';
    if (/Polygon/.test(t)) return { color: '#38bdf8', weight: 2.5, fillColor: '#38bdf8', fillOpacity: 0.25 };
    return { color: '#38bdf8', weight: 3.5, opacity: 0.95 };
  }
  function addImport(name, gj) {
    if (gj && gj.type === 'Feature') gj = { type: 'FeatureCollection', features: [gj] };
    if (!gj || !gj.features || !gj.features.length) { toast('File kosong: ' + name); return; }
    var short = name.replace(/\.(geojson|json|kml|gpx|zip|shp)$/i, '');
    var layer = L.geoJSON(gj, {
      style: styleFor,
      pointToLayer: function (f, ll) {
        return L.circleMarker(ll, { radius: 6, color: '#0b1526', weight: 2, fillColor: '#38bdf8', fillOpacity: 1 });
      },
      onEachFeature: function (f, l) {
        var p = f.properties || {};
        var keys = Object.keys(p).filter(function (k) { return p[k] !== null && p[k] !== undefined && p[k] !== ''; }).slice(0, 8);
        if (!keys.length) return;
        l.bindPopup('<b>' + esc(short) + '</b><br>' + keys.map(function (k) {
          return esc(k) + ': <b>' + esc(String(p[k])) + '</b>';
        }).join('<br>'));
      }
    }).addTo(map);
    register(short, layer);
    try { map.flyToBounds(layer.getBounds().pad(0.15), { duration: 1 }); } catch (e) {}
    toast('File dimuat: ' + short);
  }

  // ---------- export peta jadi PNG ----------
  function initExport() {
    var b = document.getElementById('lyr-export');
    if (!b) return;
    b.addEventListener('click', function () {
      if (typeof leafletImage !== 'function') { toast('Pustaka export belum termuat'); return; }
      toast('Menyiapkan gambar…');
      leafletImage(map, function (err, canvas) {
        if (err || !canvas) { toast('Gagal membuat gambar'); return; }
        try {
          var a = document.createElement('a');
          a.download = 'surveykit-' + Date.now() + '.png';
          a.href = canvas.toDataURL('image/png');
          document.body.appendChild(a); a.click(); a.remove();
          toast('Gambar peta tersimpan');
        } catch (e) { toast('Gagal menyimpan gambar'); }
      });
    });
  }

  // ---------- bookmark lokasi ----------
  function getBMs() { try { return JSON.parse(localStorage.getItem(BM_KEY)) || []; } catch (e) { return []; } }
  function setBMs(a) { try { localStorage.setItem(BM_KEY, JSON.stringify(a)); } catch (e) {} }
  function initBookmarks() {
    var save = document.getElementById('bm-save'), inp = document.getElementById('bm-name');
    if (!save || !inp) return;
    function doSave() {
      var arr = getBMs();
      var nm = inp.value.trim() || ('Lokasi ' + (arr.length + 1));
      var c = map.getCenter();
      arr.push({ name: nm, lat: +c.lat.toFixed(6), lon: +c.lng.toFixed(6), z: map.getZoom() });
      setBMs(arr); inp.value = '';
      renderBMs();
      toast('Bookmark tersimpan: ' + nm);
    }
    save.addEventListener('click', doSave);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSave(); });
    document.getElementById('bm-list').addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-bm]'); if (!btn) return;
      var i = +btn.getAttribute('data-bm'), arr = getBMs(), b = arr[i];
      if (!b) return;
      if (btn.getAttribute('data-act') === 'del') { arr.splice(i, 1); setBMs(arr); renderBMs(); }
      else map.flyTo([b.lat, b.lon], b.z, { duration: 1.2 });
    });
    renderBMs();
  }
  function renderBMs() {
    var list = document.getElementById('bm-list');
    if (!list) return;
    var arr = getBMs();
    list.innerHTML = arr.length ? arr.map(function (b, i) {
      return '<div class="bm-row">' +
        '<button class="bm-go" data-bm="' + i + '" data-act="go" title="Terbang ke lokasi">' + PIN + '<span>' + esc(b.name) + '</span></button>' +
        '<button class="bm-del" data-bm="' + i + '" data-act="del" title="Hapus bookmark">✕</button></div>';
    }).join('') : '<p class="hint">Belum ada bookmark. Geser peta ke lokasi favorit, beri nama, lalu simpan.</p>';
  }

  window.LayerManager = {
    init: init, register: register, unregister: unregister,
    toggle: toggle, remove: removeEntry, setOpacity: setOpacity,
    count: function () { return entries.length; }
  };
})();
