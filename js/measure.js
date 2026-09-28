/* measure.js — Tool Ukur Lahan: gambar polygon DI PETA BERSAMA + Cut & Fill */
(function () {
  'use strict';
  var G = window.Geo, K = window.Kml;
  var inited = false, active = false, map = null, drawCtl = null, drawn = null;
  var polyLL = null;   // [[lon,lat],...]
  var demStats = null; // {min,max,avg,elevs,cellM2}

  function onCreated(e) {
    if (!active) return;
    drawn.clearLayers();
    drawn.addLayer(e.layer);
    var ll = e.layer.getLatLngs()[0].map(function (p) { return [p.lng, p.lat]; });
    setPolygon(ll);
  }
  function onEdited() {
    if (!active) return;
    var layers = drawn.getLayers();
    if (layers.length) {
      var ll = layers[0].getLatLngs()[0].map(function (p) { return [p.lng, p.lat]; });
      setPolygon(ll);
    }
  }

  function init(sharedMap) {
    if (inited) return; inited = true;
    map = sharedMap;
    drawn = new L.FeatureGroup();
    map.addLayer(drawn);
    drawCtl = new L.Control.Draw({
      draw: {
        polygon: { shapeOptions: { color: '#16a34a', weight: 3 }, allowIntersection: false, showArea: true },
        polyline: false, rectangle: false, circle: false, marker: false, circlemarker: false
      },
      edit: { featureGroup: drawn }
    });
    map.on(L.Draw.Event.CREATED, onCreated);
    map.on(L.Draw.Event.DELETED, function () { if (active) clearAll(); });
    map.on(L.Draw.Event.EDITED, onEdited);
  }

  function activate() {
    active = true;
    map.addControl(drawCtl);
  }
  function deactivate() {
    active = false;
    map.removeControl(drawCtl);
  }

  function clearAll() {
    polyLL = null; demStats = null;
    document.getElementById('ms-basic').innerHTML = '<p class="hint">Gambar polygon di atas citra satelit untuk mengukur lahan.</p>';
    document.getElementById('ms-dem').innerHTML = '';
    document.getElementById('ms-cutfill').style.display = 'none';
  }

  function setPolygon(ll) {
    polyLL = ll; demStats = null;
    var area = G.ringArea(ll);
    var per = 0;
    for (var i = 0; i < ll.length; i++) {
      var a = ll[i], b = ll[(i + 1) % ll.length];
      per += G.haversine(a[1], a[0], b[1], b[0]);
    }
    document.getElementById('ms-basic').innerHTML =
      '<div class="res-grid">' +
      '<div class="res"><span>Luas lahan</span><b>' + G.fmtArea(area) + '</b></div>' +
      '<div class="res"><span>Luas (m²)</span><b>' + G.fmtNum(area, 1) + '</b></div>' +
      '<div class="res"><span>Keliling</span><b>' + G.fmtDist(per) + '</b></div>' +
      '</div>' +
      '<div class="btn-row">' +
      '<button class="btn" id="ms-analyze">⛰️ Analisis Ketinggian (DEM)</button>' +
      '<button class="btn secondary" id="ms-kml2">⬇ Unduh KML</button>' +
      '<button class="btn secondary" id="ms-clear">🗑 Hapus</button>' +
      '</div>';
    document.getElementById('ms-analyze').onclick = analyzeDEM;
    document.getElementById('ms-kml2').onclick = downloadKML;
    document.getElementById('ms-clear').onclick = function () { drawn.clearLayers(); clearAll(); };
    document.getElementById('ms-dem').innerHTML = '';
    document.getElementById('ms-cutfill').style.display = 'none';
  }

  function analyzeDEM() {
    var info = document.getElementById('ms-dem');
    info.innerHTML = '<p class="hint">⏳ Mengambil data DEM & menghitung…</p>';
    var lons = polyLL.map(function (p) { return p[0]; }), lats = polyLL.map(function (p) { return p[1]; });
    var bbox = {
      west: Math.min.apply(null, lons), east: Math.max.apply(null, lons),
      south: Math.min.apply(null, lats), north: Math.max.apply(null, lats)
    };
    var z = 14;
    var approxCells = (bbox.east - bbox.west) / 360 * Math.pow(2, z) * 256 * (bbox.north - bbox.south) / 360 * Math.pow(2, z) * 256;
    if (approxCells > 400000) z = 13;
    if (approxCells > 1600000) z = 12;

    G.fetchElevationGrid(bbox, z).then(function (grid) {
      var resX = (grid.east - grid.west) / grid.w, resY = (grid.north - grid.south) / grid.h;
      var mn = Infinity, mx = -Infinity, sum = 0, cnt = 0;
      var meanLat = (bbox.south + bbox.north) / 2;
      var cellM2 = G.cellAreaM2(meanLat, resX, resY);
      var elevs = [];
      var step = Math.max(1, Math.floor(Math.sqrt(grid.w * grid.h / 200000)));
      for (var r = 0; r < grid.h; r += step) {
        for (var c = 0; c < grid.w; c += step) {
          var lon = grid.west + (c + 0.5) * resX, lat = grid.north - (r + 0.5) * resY;
          if (!G.pointInPolygon([lon, lat], polyLL)) continue;
          var e = grid.data[r * grid.w + c];
          elevs.push(e);
          if (e < mn) mn = e; if (e > mx) mx = e;
          sum += e; cnt++;
        }
      }
      if (!cnt) { info.innerHTML = '<p class="hint err-text">Tidak ada data dalam polygon.</p>'; return; }
      demStats = { min: mn, max: mx, avg: sum / cnt, elevs: elevs, cellM2: cellM2 * step * step };
      info.innerHTML =
        '<div class="res-grid">' +
        '<div class="res"><span>Elevasi min</span><b>' + G.fmtNum(mn, 1) + ' m</b></div>' +
        '<div class="res"><span>Elevasi maks</span><b>' + G.fmtNum(mx, 1) + ' m</b></div>' +
        '<div class="res"><span>Elevasi rata-rata</span><b>' + G.fmtNum(sum / cnt, 1) + ' m</b></div>' +
        '<div class="res"><span>Sampel titik</span><b>' + G.fmtNum(cnt, 0) + '</b></div>' +
        '</div>' +
        '<p class="hint">Resolusi DEM ~' + G.fmtNum(G.metersPerPixel(meanLat, z) * step, 0) + ' m/piksel. Estimasi kasar untuk survei awal — verifikasi dengan pengukuran lapangan.</p>';
      var cf = document.getElementById('ms-cutfill');
      cf.style.display = '';
      document.getElementById('ms-target').value = (sum / cnt).toFixed(1);
      document.getElementById('ms-calc').onclick = calcCutFill;
    }).catch(function (err) {
      info.innerHTML = '<p class="hint err-text">Gagal: ' + K.esc(err.message) + '</p>';
    });
  }

  function calcCutFill() {
    if (!demStats) return;
    var target = parseFloat(String(document.getElementById('ms-target').value).replace(',', '.'));
    if (isNaN(target)) { alert('Masukkan elevasi rencana yang valid.'); return; }
    var cut = 0, fill = 0;
    demStats.elevs.forEach(function (e) {
      if (e > target) cut += (e - target) * demStats.cellM2;
      else fill += (target - e) * demStats.cellM2;
    });
    document.getElementById('ms-cf-out').innerHTML =
      '<div class="res-grid">' +
      '<div class="res"><span>Elevasi rencana</span><b>' + G.fmtNum(target, 1) + ' m</b></div>' +
      '<div class="res"><span>Volume galian (cut)</span><b>' + G.fmtNum(cut, 0) + ' m³</b></div>' +
      '<div class="res"><span>Volume timbunan (fill)</span><b>' + G.fmtNum(fill, 0) + ' m³</b></div>' +
      '<div class="res"><span>Selisih bersih</span><b>' + G.fmtNum(cut - fill, 0) + ' m³</b></div>' +
      '</div>' +
      '<p class="hint">Estimasi kasar dari DEM satelit (±30 m). Untuk RAB final tetap perlu survei topografi lapangan.</p>';
  }

  function downloadKML() {
    if (!polyLL) return;
    var area = G.ringArea(polyLL);
    K.download('lahan.kml', K.build('Pengukuran Lahan', [{
      kind: 'polygon', name: 'Lahan (' + G.fmtArea(area) + ')',
      coords: polyLL,
      desc: 'Luas: ' + G.fmtArea(area) + ' (' + G.fmtNum(area, 1) + ' m²)'
    }]), 'application/vnd.google-earth.kml+xml');
  }

  window.ToolMeasure = { init: init, activate: activate, deactivate: deactivate };
})();
