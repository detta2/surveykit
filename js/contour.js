/* contour.js — Tool Kontur Otomatis: gambar kotak DI PETA BERSAMA */
(function () {
  'use strict';
  var G = window.Geo, K = window.Kml;
  var inited = false, active = false, map = null, drawCtl = null, drawn = null, contourLayer = null;
  var lastGrid = null, lastBbox = null, drawer = null;

  function onCreated(e) {
    if (!active) return;
    drawn.clearLayers();
    drawn.addLayer(e.layer);
    var b = e.layer.getBounds();
    generate({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() });
  }

  function init(sharedMap) {
    if (inited) return; inited = true;
    map = sharedMap;
    drawn = new L.FeatureGroup();
    map.addLayer(drawn);
    drawCtl = new L.Control.Draw({
      draw: {
        rectangle: { shapeOptions: { color: '#2563eb', weight: 2, fillOpacity: 0.05 } },
        polyline: false, polygon: false, circle: false, marker: false, circlemarker: false
      },
      edit: { featureGroup: drawn }
    });
    map.on(L.Draw.Event.CREATED, onCreated);
    map.on(L.Draw.Event.DELETED, function () { if (active) clearContours(); });
    drawer = new L.Draw.Rectangle(map, { shapeOptions: { color: '#2563eb', weight: 2, fillOpacity: 0.05 } });
    document.getElementById('ct-interval').addEventListener('change', function () {
      if (lastGrid) renderContours(lastGrid, parseFloat(this.value));
    });
    document.getElementById('ct-geojson').onclick = downloadGeoJSON;
    document.getElementById('ct-kml').onclick = downloadKML;
    document.getElementById('ct-clear').onclick = function () { drawn.clearLayers(); clearContours(); };
  }

  function activate() {
    active = true;
    if (!drawCtl._map) map.addControl(drawCtl);
    if (drawer) drawer.enable(); // langsung mode gambar: tarik kotak di peta
  }
  function deactivate() {
    active = false;
    if (drawer && drawer.enabled()) drawer.disable();
    map.removeControl(drawCtl);
  }

  function clearContours() {
    lastGrid = null; lastBbox = null;
    if (contourLayer) { map.removeLayer(contourLayer); contourLayer = null; }
    document.getElementById('ct-info').innerHTML = '<p class="hint">Gambar kotak di peta untuk generate garis kontur.</p>';
    document.getElementById('ct-dl').style.display = 'none';
  }

  function generate(bbox) {
    var info = document.getElementById('ct-info');
    info.innerHTML = '<p class="hint">⏳ Mengambil data DEM & menghitung kontur…</p>';
    var interval = parseFloat(document.getElementById('ct-interval').value);
    var z = G.chooseZoomForBbox(bbox, 480);
    G.fetchElevationGrid(bbox, z).then(function (grid) {
      lastGrid = grid; lastBbox = bbox;
      renderContours(grid, interval);
    }).catch(function (err) {
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
