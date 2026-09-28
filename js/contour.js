/* contour.js — Tool Kontur: TANDAI DAERAHMU SENDIRI (klik -> pin, kotak ikut pin & bisa diubah) */
(function () {
  'use strict';
  var G = window.Geo, K = window.Kml;
  var inited = false, active = false, map = null, drawn = null;
  var contourGroup = null, contourLayer = null, contourRegId = null;
  var lastGrid = null, lastBbox = null;
  var pin = null, box = null, sizeK = 1, genSeq = 0, regenTimer = null;

  // lebar kotak (derajat) mengikuti zoom x faktor ukuran pilihan user
  function boxD() {
    var d = 360 / Math.pow(2, map.getZoom()) * 1.5 * sizeK;
    return Math.max(0.02, Math.min(2, d));
  }
  function currentBbox() {
    var d = boxD(), ll = pin.getLatLng();
    return { west: ll.lng - d / 2, east: ll.lng + d / 2, south: ll.lat - d / 2, north: ll.lat + d / 2 };
  }
  function drawBox() {
    var b = currentBbox();
    if (box) drawn.removeLayer(box);
    box = L.rectangle(
      [[b.south, b.west], [b.north, b.east]],
      { color: '#2563eb', weight: 2, dashArray: '6 4', fillOpacity: 0.03 }
    );
    drawn.addLayer(box);
  }
  // user menandai daerahnya: pin jatuh di titik klik, kontur dibuat untuk daerah itu
  function markAt(latlng) {
    drawn.clearLayers();
    pin = L.marker(latlng, { draggable: true, bubblingMouseEvents: false, title: 'Geser pin untuk memindah tanda' });
    pin.on('drag', drawBox);
    pin.on('dragend', scheduleRegen);
    drawn.addLayer(pin);
    drawBox();
    generate(currentBbox());
  }
  function scheduleRegen() {
    clearTimeout(regenTimer);
    regenTimer = setTimeout(function () {
      if (!active || !pin) return;
      drawBox();
      generate(currentBbox());
    }, 700);
  }
  function onMapClick(e) {
    if (!active) return;
    markAt(e.latlng); // klik = pindah tanda ke titik itu
  }

  function init(sharedMap) {
    if (inited) return; inited = true;
    map = sharedMap;
    drawn = new L.FeatureGroup();
    map.addLayer(drawn);
    contourGroup = L.layerGroup().addTo(map); // hasil kontur: didaftarkan ke Layer Manager
    document.getElementById('ct-interval').addEventListener('change', function () {
      if (lastGrid) renderContours(lastGrid, effectiveInterval(lastGrid));
    });
    document.getElementById('ct-bigger').onclick = function () {
      if (!active || !pin) return;
      sizeK = Math.min(4, sizeK * 1.5);
      drawBox(); scheduleRegen();
    };
    document.getElementById('ct-smaller').onclick = function () {
      if (!active || !pin) return;
      sizeK = Math.max(0.25, sizeK / 1.5);
      drawBox(); scheduleRegen();
    };
    document.getElementById('ct-geojson').onclick = downloadGeoJSON;
    document.getElementById('ct-kml').onclick = downloadKML;
    document.getElementById('ct-clear').onclick = function () { drawn.clearLayers(); clearContours(); };
  }

  function activate() {
    active = true;
    map.on('click', onMapClick);
    document.getElementById('map').style.cursor = 'crosshair';
    if (!pin) {
      document.getElementById('ct-info').innerHTML = '<p class="hint">👆 Klik peta untuk menandai daerahmu.</p>';
    }
  }
  function deactivate() {
    active = false;
    clearTimeout(regenTimer);
    map.off('click', onMapClick);
    document.getElementById('map').style.cursor = '';
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
    if (document.getElementById('ct-interval').value === 'auto') {
      var r = gridRange(grid);
      return niceInterval(r.mx - r.mn);
    }
    return parseFloat(document.getElementById('ct-interval').value);
  }

  function clearContours() {
    lastGrid = null; lastBbox = null;
    pin = null; box = null; sizeK = 1;
    if (contourGroup) contourGroup.clearLayers();
    contourLayer = null;
    document.getElementById('ct-info').innerHTML = '<p class="hint">👆 Klik peta untuk menandai daerahmu.</p>';
    document.getElementById('ct-dl').style.display = 'none';
  }

  function generate(bbox) {
    var info = document.getElementById('ct-info');
    info.innerHTML = '<p class="hint">⏳ Mengambil data DEM & menghitung kontur…</p>';
    var seq = ++genSeq;
    var z = G.chooseZoomForBbox(bbox, 480);
    G.fetchElevationGrid(bbox, z).then(function (grid) {
      if (seq !== genSeq || !active) return; // abaikan hasil basi
      lastGrid = grid; lastBbox = bbox;
      renderContours(grid, effectiveInterval(grid));
    }).catch(function (err) {
      if (seq !== genSeq || !active) return;
      info.innerHTML = '<p class="hint err-text">Gagal: ' + K.esc(err.message) + '</p>';
    });
  }

  // statistik tambahan dari grid DEM: elevasi, beda tinggi, kemiringan, luas, klasifikasi medan
  function gridStats(grid) {
    var d = grid.data, n = d.length, sum = 0, mn = Infinity, mx = -Infinity, i, v;
    for (i = 0; i < n; i++) { v = d[i]; sum += v; if (v < mn) mn = v; if (v > mx) mx = v; }
    var w = grid.w, h = grid.h;
    var latC = (grid.north + grid.south) / 2 * Math.PI / 180;
    var mxM = (grid.east - grid.west) / w * 111320 * Math.cos(latC); // meter per pixel (x)
    var myM = (grid.north - grid.south) / h * 110540;               // meter per pixel (y)
    var sSum = 0, sCnt = 0, sMax = 0, x, y, dzdx, dzdy, s;
    for (y = 1; y < h - 1; y++) {
      for (x = 1; x < w - 1; x++) {
        dzdx = (d[y * w + x + 1] - d[y * w + x - 1]) / (2 * mxM);
        dzdy = (d[(y + 1) * w + x] - d[(y - 1) * w + x]) / (2 * myM);
        s = Math.sqrt(dzdx * dzdx + dzdy * dzdy) * 100; // persen
        sSum += s; sCnt++; if (s > sMax) sMax = s;
      }
    }
    var relief = mx - mn;
    var medan = relief < 25 ? 'Datar' : relief < 100 ? 'Bergelombang' : relief < 300 ? 'Berbukit' : 'Bergunung';
    return { mn: mn, mx: mx, mean: sum / n, relief: relief, slopeMean: sCnt ? sSum / sCnt : 0, slopeMax: sMax, medan: medan };
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

  function renderContours(grid, interval) {
    var d = grid.data, mn = Infinity, mx = -Infinity, i;
    for (i = 0; i < d.length; i++) { if (d[i] < mn) mn = d[i]; if (d[i] > mx) mx = d[i]; }
    var lo = Math.floor(mn / interval) * interval;
    var thresholds = [];
    for (var t = lo; t <= mx; t += interval) thresholds.push(Math.round(t * 100) / 100);
    if (thresholds.length < 2) thresholds.push(lo + interval);
    if (thresholds.length > 400) {
      document.getElementById('ct-info').innerHTML = '<p class="hint err-text">Terlalu banyak garis kontur. Pilih interval lebih besar atau area lebih kecil.</p>';
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
    // luas area kotak (ha / km2)
    var latC = (grid.north + grid.south) / 2 * Math.PI / 180;
    var areaM2 = (grid.east - grid.west) * 111320 * Math.cos(latC) * (grid.north - grid.south) * 110540;
    var areaTxt = areaM2 >= 1000000 ? G.fmtNum(areaM2 / 1000000, 2) + ' km²' : G.fmtNum(areaM2 / 10000, 1) + ' ha';
    document.getElementById('ct-info').innerHTML =
      '<p class="ok-text">✔ ' + nLines + ' garis kontur (interval ' + interval + ' m). ' +
      'Klik garis untuk lihat nilainya.</p>' +
      '<p class="hint">Garis tebal = kontur indeks (kelipatan ' + (interval * 5) + ' m).</p>' +
      '<div class="res-grid">' +
      '<div class="res"><span>📏 Luas area</span><b>' + areaTxt + '</b></div>' +
      '<div class="res"><span>📍 Elevasi titik tanda</span><b>' + (pin ? G.fmtNum(G.sampleGrid(grid, pin.getLatLng().lng, pin.getLatLng().lat), 1) + ' m' : '–') + '</b></div>' +
      '<div class="res"><span>⛰️ Elevasi min</span><b>' + G.fmtNum(st.mn, 0) + ' m</b></div>' +
      '<div class="res"><span>⛰️ Elevasi maks</span><b>' + G.fmtNum(st.mx, 0) + ' m</b></div>' +
      '<div class="res"><span>📊 Elevasi rata-rata</span><b>' + G.fmtNum(st.mean, 0) + ' m</b></div>' +
      '<div class="res"><span>📐 Beda tinggi</span><b>' + G.fmtNum(st.relief, 0) + ' m</b></div>' +
      '<div class="res"><span>〰️ Kemiringan rata-rata</span><b>' + G.fmtNum(st.slopeMean, 1) + ' %</b></div>' +
      '<div class="res"><span>🏔️ Perkiraan medan</span><b>' + st.medan + '</b></div>' +
      '</div>';
    document.getElementById('ct-dl').style.display = '';
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
