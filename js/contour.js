/* contour.js — Tool Kontur Otomatis: KONTUR MENGIKUTI TAMPILAN PETA (tanpa gambar) */
(function () {
  'use strict';
  var G = window.Geo, K = window.Kml;
  var inited = false, active = false, map = null, drawn = null, contourLayer = null;
  var lastGrid = null, lastBbox = null;
  var followTimer = null, lastViewKey = '', genSeq = 0;

  // bbox dari tampilan peta saat ini (dibatasi max 2 derajat agar DEM tidak overload)
  function viewBbox() {
    var b = map.getBounds(), c = b.getCenter();
    var w = Math.min(b.getEast() - b.getWest(), 2);
    var h = Math.min(b.getNorth() - b.getSouth(), 2);
    return { west: c.lng - w / 2, east: c.lng + w / 2, south: c.lat - h / 2, north: c.lat + h / 2 };
  }
  function viewKey() {
    var b = map.getBounds(), z = map.getZoom(), f = function (v) { return v.toFixed(2); };
    return [f(b.getWest()), f(b.getSouth()), f(b.getEast()), f(b.getNorth()), z].join('|');
  }
  function refresh() {
    lastViewKey = viewKey();
    var bbox = viewBbox();
    drawn.clearLayers();
    drawn.addLayer(L.rectangle(
      [[bbox.south, bbox.west], [bbox.north, bbox.east]],
      { color: '#2563eb', weight: 2, dashArray: '6 4', fillOpacity: 0.03 }
    ));
    generate(bbox);
  }
  function onMoveEnd() {
    if (!active) return;
    clearTimeout(followTimer);
    followTimer = setTimeout(function () {
      if (!active || viewKey() === lastViewKey) return;
      refresh();
    }, 900);
  }

  function init(sharedMap) {
    if (inited) return; inited = true;
    map = sharedMap;
    drawn = new L.FeatureGroup();
    map.addLayer(drawn);
    document.getElementById('ct-interval').addEventListener('change', function () {
      if (lastGrid) renderContours(lastGrid, effectiveInterval(lastGrid));
    });
    document.getElementById('ct-refresh').onclick = refresh;
    document.getElementById('ct-geojson').onclick = downloadGeoJSON;
    document.getElementById('ct-kml').onclick = downloadKML;
    document.getElementById('ct-clear').onclick = function () { drawn.clearLayers(); clearContours(); };
  }

  function activate() {
    active = true;
    lastViewKey = ''; // paksa generate ulang saat tab dibuka
    map.on('moveend', onMoveEnd);
    refresh();
  }
  function deactivate() {
    active = false;
    clearTimeout(followTimer);
    map.off('moveend', onMoveEnd);
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
    if (contourLayer) { map.removeLayer(contourLayer); contourLayer = null; }
    document.getElementById('ct-info').innerHTML = '<p class="hint">Geser/zoom peta ke daerahmu — garis kontur otomatis dibuat mengikuti tampilan peta.</p>';
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

    if (contourLayer) map.removeLayer(contourLayer);
    contourLayer = L.geoJSON(fc, {
      style: function (f) {
        var isIndex = Math.abs(f.properties.elev / interval % 5) < 1e-6;
        return { color: isIndex ? '#b45309' : '#d97706', weight: isIndex ? 2.2 : 1, opacity: 0.85, fill: false };
      },
      onEachFeature: function (f, layer) {
        layer.bindPopup('<b>Kontur ' + G.fmtNum(f.properties.elev, 1) + ' m</b>');
      }
    }).addTo(map);

    var nLines = features.length;
    document.getElementById('ct-info').innerHTML =
      '<p class="ok-text">✔ ' + nLines + ' garis kontur (interval ' + interval + ' m), ' +
      'elevasi ' + G.fmtNum(mn, 0) + '–' + G.fmtNum(mx, 0) + ' m. Klik garis untuk lihat nilainya.</p>' +
      '<p class="hint">Garis tebal = kontur indeks (kelipatan ' + (interval * 5) + ' m).</p>';
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
