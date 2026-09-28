/* contour.js — Tool Kontur: gambar batas lahannya sendiri (ketuk titik-titik), kontur dibuat di dalamnya */
(function () {
  'use strict';
  var G = window.Geo, K = window.Kml;
  var inited = false, active = false, map = null, drawn = null;
  var contourGroup = null, contourLayer = null, contourRegId = null;
  var lastGrid = null, lastRing = null;
  var pts = [], preview = null, dots = [], finished = false, generating = false, genSeq = 0;

  function el(id) { return document.getElementById(id); }
  function toast(m) { if (window.GMap) GMap.toast(m); }
  function ring() { return pts.map(function (p) { return [p.lng, p.lat]; }); }

  function bboxOf(r) {
    var w = Infinity, e = -Infinity, s = Infinity, n = -Infinity, i;
    for (i = 0; i < r.length; i++) {
      if (r[i][0] < w) w = r[i][0];
      if (r[i][0] > e) e = r[i][0];
      if (r[i][1] < s) s = r[i][1];
      if (r[i][1] > n) n = r[i][1];
    }
    var padX = Math.max((e - w) * 0.05, 0.002), padY = Math.max((n - s) * 0.05, 0.002);
    return { west: w - padX, east: e + padX, south: s - padY, north: n + padY };
  }

  function updateButtons() {
    el('ct-finish').disabled = !(pts.length >= 3 && !generating && !finished);
    if (generating || finished) return;
    var h = el('ct-info');
    if (!pts.length) h.innerHTML = '<p class="hint">👆 Ketuk titik-titik ngikutin batas lahan — minimal 3 titik, makin rapat makin pas.</p>';
    else h.innerHTML = '<p class="hint">📍 ' + pts.length + ' titik — ketuk lagi buat nambah' +
      (pts.length >= 3 ? ', atau pencet <b>✓ Selesai</b>.' : ' (minimal 3).') + '</p>';
  }

  function drawPreview() {
    if (preview) { drawn.removeLayer(preview); preview = null; }
    dots.forEach(function (d) { drawn.removeLayer(d); });
    dots = [];
    if (!pts.length) { updateButtons(); return; }
    var latlngs = pts.map(function (p) { return [p.lat, p.lng]; });
    preview = pts.length >= 3
      ? L.polygon(latlngs, { color: '#22c55e', weight: 3, fillColor: '#22c55e', fillOpacity: 0.06 })
      : L.polyline(latlngs, { color: '#22c55e', weight: 3 });
    drawn.addLayer(preview);
    pts.forEach(function (p) {
      dots.push(L.circleMarker([p.lat, p.lng], { radius: 4, color: '#22c55e', fillColor: '#22c55e', fillOpacity: 1 }).addTo(drawn));
    });
    updateButtons();
  }

  function onMapClick(e) {
    if (!active || generating) return;
    if (finished) reset(); // ketuk lagi = mulai gambar batas baru
    pts.push({ lat: e.latlng.lat, lng: e.latlng.lng });
    drawPreview();
  }

  function reset() {
    genSeq++;
    generating = false; finished = false;
    pts = [];
    if (preview) { drawn.removeLayer(preview); preview = null; }
    dots.forEach(function (d) { drawn.removeLayer(d); });
    dots = [];
    lastGrid = null; lastRing = null;
    if (contourGroup) contourGroup.clearLayers();
    contourLayer = null;
    el('ct-dl').style.display = 'none';
    updateButtons();
  }

  function finish() {
    if (generating || finished) return;
    if (pts.length < 3) { toast('Tandai minimal 3 titik dulu.'); return; }
    finished = true;
    updateButtons();
    generate(bboxOf(ring()), ring());
  }

  function init(sharedMap) {
    if (inited) return; inited = true;
    map = sharedMap;
    drawn = new L.FeatureGroup();
    map.addLayer(drawn);
    contourGroup = L.layerGroup().addTo(map); // hasil kontur: didaftarkan ke Layer Manager
    el('ct-interval').addEventListener('change', function () {
      if (lastGrid) renderContours(lastGrid, effectiveInterval(lastGrid), lastRing);
    });
    el('ct-finish').onclick = finish;
    el('ct-undo').onclick = function () {
      if (generating || finished) return;
      pts.pop();
      drawPreview();
    };
    el('ct-clear').onclick = reset;
    el('ct-geojson').onclick = downloadGeoJSON;
    el('ct-kml').onclick = downloadKML;
  }

  function activate() {
    active = true;
    map.on('click', onMapClick);
    el('map').style.cursor = 'crosshair';
    updateButtons();
  }
  function deactivate() {
    active = false;
    genSeq++; // batalkan generate yang masih jalan
    generating = false;
    map.off('click', onMapClick);
    el('map').style.cursor = '';
  }

  // interval otomatis: target ~12 garis, dibulatkan ke 1/2/5 x 10^n
  function niceInterval(range) {
    if (!(range > 0)) return 5;
    var raw = range / 12;
    var pow = Math.pow(10, Math.floor(Math.log10(raw)));
    var n = raw / pow;
    var snap = n >= 5 ? 10 : n >= 2 ? 5 : n >= 1 ? 2 : 1;
    return Math.round(snap * pow * 100) / 100;
  }
  function gridRange(grid) {
    var d = grid.data, mn = Infinity, mx = -Infinity, i;
    for (i = 0; i < d.length; i++) { if (d[i] < mn) mn = d[i]; if (d[i] > mx) mx = d[i]; }
    return { mn: mn, mx: mx };
  }
  function effectiveInterval(grid) {
    if (el('ct-interval').value === 'auto') {
      var r = gridRange(grid);
      return niceInterval(r.mx - r.mn);
    }
    return parseFloat(el('ct-interval').value);
  }

  // sel di luar batas lahan di-mask jadi NaN: garis kontur berhenti pas di batas
  function maskGrid(grid, r) {
    var w = grid.w, h = grid.h;
    var resX = (grid.east - grid.west) / w, resY = (grid.north - grid.south) / h;
    var out = new Float64Array(w * h);
    for (var y = 0; y < h; y++) {
      var lat = grid.north - (y + 0.5) * resY;
      for (var x = 0; x < w; x++) {
        var lon = grid.west + (x + 0.5) * resX;
        out[y * w + x] = G.pointInPolygon([lon, lat], r) ? grid.data[y * w + x] : NaN;
      }
    }
    return { w: w, h: h, data: out, north: grid.north, south: grid.south, east: grid.east, west: grid.west };
  }

  function generate(bbox, r) {
    var info = el('ct-info');
    generating = true; updateButtons();
    info.innerHTML = '<p class="hint">⏳ Ambil data DEM & bikin kontur…</p>';
    var seq = ++genSeq;
    var z = G.chooseZoomForBbox(bbox, 480);
    G.fetchElevationGrid(bbox, z).then(function (grid) {
      if (seq !== genSeq || !active) return;
      var masked = maskGrid(grid, r);
      lastGrid = masked; lastRing = r;
      generating = false;
      renderContours(masked, effectiveInterval(masked), r);
    }).catch(function (err) {
      if (seq !== genSeq || !active) return;
      generating = false; finished = false;
      info.innerHTML = '<p class="hint err-text">Gagal: ' + K.esc(err.message) + '</p>';
      updateButtons();
    });
  }

  // statistik dari grid DEM: elevasi, beda tinggi, kemiringan, klasifikasi medan (NaN dilewati)
  function gridStats(grid) {
    var d = grid.data, n = d.length, sum = 0, mn = Infinity, mx = -Infinity, cnt = 0, i, v;
    for (i = 0; i < n; i++) {
      v = d[i];
      if (v !== v) continue; // NaN
      sum += v; cnt++;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    var w = grid.w, h = grid.h;
    var latC = (grid.north + grid.south) / 2 * Math.PI / 180;
    var mxM = (grid.east - grid.west) / w * 111320 * Math.cos(latC); // meter per pixel (x)
    var myM = (grid.north - grid.south) / h * 110540;               // meter per pixel (y)
    var sSum = 0, sCnt = 0, sMax = 0, x, y, dzdx, dzdy, s, a, b;
    for (y = 1; y < h - 1; y++) {
      for (x = 1; x < w - 1; x++) {
        a = d[y * w + x + 1]; b = d[y * w + x - 1];
        if (a !== a || b !== b) continue;
        dzdx = (a - b) / (2 * mxM);
        a = d[(y + 1) * w + x]; b = d[(y - 1) * w + x];
        if (a !== a || b !== b) continue;
        dzdy = (a - b) / (2 * myM);
        s = Math.sqrt(dzdx * dzdx + dzdy * dzdy) * 100; // persen
        sSum += s; sCnt++; if (s > sMax) sMax = s;
      }
    }
    var relief = mx - mn;
    var medan = relief < 25 ? 'Datar' : relief < 100 ? 'Bergelombang' : relief < 300 ? 'Berbukit' : 'Bergunung';
    return { mn: mn, mx: mx, mean: cnt ? sum / cnt : 0, relief: relief, slopeMean: sCnt ? sSum / sCnt : 0, slopeMax: sMax, medan: medan };
  }

  // titik label: tengah ring terpanjang dari poligon terbesar (biar label nempel di garis)
  function labelPoint(geom) {
    if (!geom || !geom.coordinates || !geom.coordinates.length) return null;
    var best = null, bestN = 0;
    geom.coordinates.forEach(function (poly) {
      poly.forEach(function (ring) {
        if (ring.length > bestN) { bestN = ring.length; best = ring; }
      });
    });
    if (!best) return null;
    var p = best[Math.floor(best.length / 2)];
    return [p[1], p[0]];
  }

  function renderContours(grid, interval, r) {
    var d = grid.data, mn = Infinity, mx = -Infinity, i;
    for (i = 0; i < d.length; i++) { if (d[i] < mn) mn = d[i]; if (d[i] > mx) mx = d[i]; }
    var lo = Math.floor(mn / interval) * interval;
    var thresholds = [];
    for (var t = lo; t <= mx; t += interval) thresholds.push(Math.round(t * 100) / 100);
    if (thresholds.length < 2) thresholds.push(lo + interval);
    if (thresholds.length > 400) {
      el('ct-info').innerHTML = '<p class="hint err-text">Terlalu banyak garis kontur. Pilih interval lebih besar atau area lebih kecil.</p>';
      return;
    }
    var multis = d3.contours().size([grid.w, grid.h]).thresholds(thresholds)(Array.from(d));
    var resX = (grid.east - grid.west) / grid.w, resY = (grid.north - grid.south) / grid.h;
    function px2ll(p) { return [grid.west + p[0] * resX, grid.north - p[1] * resY]; }
    function ring2ll(ring) { return ring.map(px2ll); }

    var features = multis.map(function (mp) {
      return {
        type: 'Feature',
        properties: { elev: mp.value },
        geometry: { type: 'MultiPolygon', coordinates: mp.coordinates.map(function (poly) { return poly.map(ring2ll); }) }
      };
    });
    var fc = { type: 'FeatureCollection', features: features };

    contourGroup.clearLayers();
    // halo putih di bawah garis: biar kontur tetap kebaca di atas citra satelit yang gelap/ramai
    var halo = L.geoJSON(fc, {
      interactive: false,
      style: function (f) {
        var isIndex = Math.abs(f.properties.elev / interval % 5) < 1e-6;
        return { color: '#ffffff', weight: (isIndex ? 2.4 : 1.3) + 3.2, opacity: 0.9, fill: false };
      }
    });
    var lines = L.geoJSON(fc, {
      style: function (f) {
        var isIndex = Math.abs(f.properties.elev / interval % 5) < 1e-6;
        return { color: isIndex ? '#b45309' : '#e8930c', weight: isIndex ? 2.4 : 1.3, opacity: 0.95, fill: false };
      },
      onEachFeature: function (f, layer) {
        layer.bindPopup('<b>Kontur ' + G.fmtNum(f.properties.elev, 1) + ' m</b>');
      }
    });
    // label angka elevasi di tiap garis, kayak peta topografi beneran
    var labels = L.layerGroup();
    if (features.length <= 80) {
      features.forEach(function (f) {
        var pt = labelPoint(f.geometry);
        if (!pt) return;
        L.marker(pt, {
          icon: L.divIcon({
            className: 'ct-label-wrap',
            html: '<span class="ct-label">' + G.fmtNum(f.properties.elev, 0) + '</span>'
          }),
          interactive: false, keyboard: false
        }).addTo(labels);
      });
    }
    contourGroup.addLayer(halo);
    contourGroup.addLayer(lines);
    contourGroup.addLayer(labels);
    contourLayer = lines;
    if (!contourRegId && window.LayerManager) contourRegId = LayerManager.register('Kontur', contourGroup);

    var nLines = features.length;
    var st = gridStats(grid);
    var perim = 0;
    for (i = 0; i < r.length; i++) {
      var a = r[i], b = r[(i + 1) % r.length];
      perim += G.haversine(a[1], a[0], b[1], b[0]);
    }
    el('ct-info').innerHTML =
      '<p class="ok-text">✔ ' + nLines + ' garis kontur (interval ' + interval + ' m). ' +
      'Klik garis untuk lihat nilainya.</p>' +
      '<p class="hint">Garis tebal = kontur indeks (kelipatan ' + (interval * 5) + ' m). Ketuk peta buat gambar batas baru.</p>' +
      '<div class="res-grid">' +
      '<div class="res"><span>📏 Luas lahan</span><b>' + G.fmtArea(G.ringArea(r)) + '</b></div>' +
      '<div class="res"><span>⭕ Keliling batas</span><b>' + G.fmtDist(perim) + '</b></div>' +
      '<div class="res"><span>⛰️ Elevasi terendah</span><b>' + G.fmtNum(st.mn, 0) + ' m</b></div>' +
      '<div class="res"><span>⛰️ Elevasi tertinggi</span><b>' + G.fmtNum(st.mx, 0) + ' m</b></div>' +
      '<div class="res"><span>📊 Elevasi rata-rata</span><b>' + G.fmtNum(st.mean, 0) + ' m</b></div>' +
      '<div class="res"><span>📐 Beda tinggi</span><b>' + G.fmtNum(st.relief, 0) + ' m</b></div>' +
      '<div class="res"><span>〰️ Kemiringan rata-rata</span><b>' + G.fmtNum(st.slopeMean, 1) + ' %</b></div>' +
      '<div class="res"><span>🏔️ Perkiraan medan</span><b>' + st.medan + '</b></div>' +
      '</div>';
    el('ct-dl').style.display = '';
    updateButtons();
    contourLayer._fc = fc;
  }

  function downloadGeoJSON() {
    if (!contourLayer || !contourLayer._fc) return;
    K.download('kontur.geojson', JSON.stringify(contourLayer._fc), 'application/geo+json');
  }
  function downloadKML() {
    if (!contourLayer || !contourLayer._fc) return;
    var pm = [];
    contourLayer._fc.features.forEach(function (f) {
      f.geometry.coordinates.forEach(function (poly) {
        poly.forEach(function (ring) {
          pm.push({ kind: 'line', name: 'Kontur ' + G.fmtNum(f.properties.elev, 1) + ' m', coords: ring });
        });
      });
    });
    K.download('kontur.kml', K.build('Peta Kontur', pm), 'application/vnd.google-earth.kml+xml');
  }

  window.ToolContour = { init: init, activate: activate, deactivate: deactivate };
})();
