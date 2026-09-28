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
    toast(e.name + ' dihapus');
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
      box.innerHTML = '<p class="hint">Belum ada apa-apa di peta. Hasil ukur, kontur, file yang ditambah, dan posisi GPS bakal muncul di sini.</p>';
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
    r.onerror = function () { toast('Gagal buka ' + f.name); };
    r.readAsText(f);
  }
  function readBuf(f, cb) {
    var r = new FileReader();
    r.onload = function () { cb(r.result); };
    r.onerror = function () { toast('Gagal buka ' + f.name); };
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
          try { addImport(f.name, JSON.parse(t)); } catch (e) { toast('Gagal buka ' + f.name); }
        });
      } else if (ext === 'kml' || ext === 'gpx') {
        readText(f, function (t) {
          if (typeof toGeoJSON === 'undefined') { toast('Pustaka ' + ext.toUpperCase() + ' belum siap, coba lagi'); return; }
          try {
            var xml = new DOMParser().parseFromString(t, 'text/xml');
            addImport(f.name, ext === 'kml' ? toGeoJSON.kml(xml) : toGeoJSON.gpx(xml));
          } catch (e) { toast('Gagal buka ' + f.name); }
        });
      } else if (ext === 'zip' || ext === 'shp') {
        readBuf(f, function (b) {
          if (typeof shp === 'undefined') { toast('Pustaka SHP belum siap, coba lagi'); return; }
          toast('Buka shapefile…');
          shp(b).then(function (gj) { addImport(f.name, gj); })
                .catch(function () { toast('Gagal buka shapefile ' + f.name); });
        });
      } else {
        toast('Format .' + ext + ' nggak didukung');
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
    if (!gj || !gj.features || !gj.features.length) { toast('Filenya kosong: ' + name); return; }
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
    toast(short + ' masuk ke peta');
  }

  // ---------- export peta jadi PNG (renderer sendiri) ----------
  // leaflet-image tidak dipakai: hang pada marker divIcon & tidak merender
  // layer vektor Leaflet 1.9. Urutan gambar: tiles -> SVG vektor -> marker/tooltip.
  var FONT = 'Inter, system-ui, -apple-system, sans-serif';
  function initExport() {
    var b = document.getElementById('lyr-export');
    if (!b) return;
    b.addEventListener('click', exportPNG);
  }
  function drawPill(ctx, cx, cy, text, font, bg, fg, border) {
    ctx.save();
    ctx.font = font;
    var pw = ctx.measureText(text).width + 14, ph = 18;
    var x = cx - pw / 2, y = cy - ph / 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, pw, ph, 9); else ctx.rect(x, y, pw, ph);
    ctx.fillStyle = bg; ctx.fill();
    if (border) { ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.stroke(); }
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy + 0.5);
    ctx.restore();
  }
  function drawPin(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = '#3b82f6'; ctx.strokeStyle = '#1d4ed8'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y - 16, 10, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 8.7, y - 11); ctx.lineTo(x, y); ctx.lineTo(x + 8.7, y - 11); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y - 16, 4, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.restore();
  }
  function exportPNG() {
    toast('Bikin gambar…');
    var mapEl = document.getElementById('map');
    var size = map.getSize();
    var canvas = document.createElement('canvas');
    canvas.width = Math.round(size.x); canvas.height = Math.round(size.y);
    var ctx = canvas.getContext('2d');
    var zoom = map.getZoom();
    var origin = map.getPixelBounds().min; // sudut kiri-atas dalam world px
    function toPx(latlng) { return map.project(latlng, zoom).subtract(origin); }

    var finished = false;
    var timer = setTimeout(function () { finalize(false); }, 25000);
    function finalize(ok) {
      if (finished) return; finished = true;
      clearTimeout(timer);
      if (!ok) { toast('Gagal bikin gambar'); return; }
      try {
        var a = document.createElement('a');
        a.download = 'surveykit-' + Date.now() + '.png';
        a.href = canvas.toDataURL('image/png');
        document.body.appendChild(a); a.click(); a.remove();
        toast('Gambar tersimpan');
      } catch (e) { toast('Gagal nyimpen gambar'); }
    }

    // 1) tiles basemap
    var tileLayers = [];
    map.eachLayer(function (l) { if (l instanceof L.TileLayer) tileLayers.push(l); });
    var jobs = [];
    tileLayers.forEach(function (layer) {
      if (zoom > layer.options.maxZoom || zoom < layer.options.minZoom) return;
      var tso = layer.options.tileSize;
      var ts = (tso instanceof L.Point) ? tso.x : (tso || 256);
      var tbMin = map.getPixelBounds().min.divideBy(ts).floor();
      var tbMax = map.getPixelBounds().max.divideBy(ts).floor();
      for (var ty = tbMin.y; ty <= tbMax.y; ty++) {
        for (var tx = tbMin.x; tx <= tbMax.x; tx++) {
          var tp = new L.Point(tx, ty);
          var urlTp = tp.clone();
          if (layer._adjustTilePoint) layer._adjustTilePoint(urlTp);
          if (urlTp.y < 0) continue;
          var pos = tp.scaleBy(ts).subtract(origin);
          jobs.push({ url: layer.getTileUrl(urlTp), x: pos.x, y: pos.y, s: ts });
        }
      }
    });
    function afterTiles() { drawVectors(afterVectors); }
    if (!jobs.length) { afterTiles(); }
    else {
      var pending = jobs.length;
      jobs.forEach(function (j) {
        var im = new Image();
        im.crossOrigin = 'anonymous';
        function doneOne() {
          try { if (im.naturalWidth) ctx.drawImage(im, Math.floor(j.x), Math.floor(j.y), j.s, j.s); } catch (e) {}
          if (--pending === 0) afterTiles();
        }
        im.onload = doneOne; im.onerror = doneOne;
        im.src = j.url;
      });
    }

    // 2) layer vektor (kontur, poligon ukur, graticule): rasterisasi SVG overlayPane
    function drawVectors(cb) {
      try {
        var svg = map.getPanes().overlayPane.querySelector('svg');
        if (!svg) return cb();
        var xml = new XMLSerializer().serializeToString(svg);
        var img = new Image();
        img.onload = function () {
          try {
            var r = svg.getBoundingClientRect(), mr = mapEl.getBoundingClientRect();
            ctx.drawImage(img, r.left - mr.left, r.top - mr.top, r.width, r.height);
          } catch (e) {}
          cb();
        };
        img.onerror = function () { cb(); };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
      } catch (e) { cb(); }
    }

    // 3) marker & tooltip permanen digambar manual (divIcon tidak bisa dirasterisasi)
    function afterVectors() {
      map.eachLayer(function (l) {
        try {
          if (l instanceof L.Tooltip && l.options.permanent && l.getLatLng) {
            var el = l.getElement(); if (!el) return;
            var t = (el.textContent || '').trim(); if (!t) return;
            var p = toPx(l.getLatLng());
            drawPill(ctx, p.x, p.y - 24, t, '700 12.5px ' + FONT, 'rgba(13,20,34,.94)', '#fff', 'rgba(255,255,255,.16)');
          } else if (l instanceof L.Marker) {
            var m = toPx(l.getLatLng());
            var isDiv = l.options.icon instanceof L.DivIcon;
            if (!isDiv) { drawPin(ctx, m.x, m.y); return; }
            var cls = (l.options.icon && l.options.icon.options.className) || '';
            if (cls.indexOf('ct-label-wrap') !== -1) {
              var mel = l.getElement();
              var txt = mel ? (mel.textContent || '').trim() : '';
              if (txt) drawPill(ctx, m.x, m.y, txt, '800 10px ' + FONT, 'rgba(11,21,38,.88)', '#ffd9a0', 'rgba(232,147,12,.65)');
            } else if (cls.indexOf('gps-wrap') !== -1) {
              ctx.save();
              ctx.beginPath(); ctx.arc(m.x, m.y, 7, 0, 7);
              ctx.fillStyle = '#3b82f6'; ctx.fill();
              ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke();
              ctx.restore();
            } else {
              ctx.save();
              ctx.beginPath(); ctx.arc(m.x, m.y, 5, 0, 7);
              ctx.fillStyle = '#38bdf8'; ctx.fill();
              ctx.restore();
            }
          }
        } catch (e) {}
      });
      finalize(true);
    }
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
      toast('Lokasi tersimpan: ' + nm);
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
        '<button class="bm-go" data-bm="' + i + '" data-act="go" title="Buka lokasi ini">' + PIN + '<span>' + esc(b.name) + '</span></button>' +
        '<button class="bm-del" data-bm="' + i + '" data-act="del" title="Hapus">✕</button></div>';
    }).join('') : '<p class="hint">Belum ada yang disimpan. Arahkan peta ke lokasi favorit, kasih nama, terus simpan.</p>';
  }

  // dipakai kartu koordinat: simpan titik tanpa buka panel
  function addBookmark(name, lat, lon, z) {
    var arr = getBMs();
    arr.push({ name: name, lat: +lat.toFixed(6), lon: +lon.toFixed(6), z: z || (map ? map.getZoom() : 13) });
    setBMs(arr);
    renderBMs();
    toast('Lokasi tersimpan: ' + name);
  }

  window.LayerManager = {
    init: init, register: register, unregister: unregister,
    toggle: toggle, remove: removeEntry, setOpacity: setOpacity,
    addBookmark: addBookmark,
    count: function () { return entries.length; }
  };
})();
