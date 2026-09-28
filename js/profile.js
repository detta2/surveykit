/* profile.js — Tool 2: Profil Ketinggian (cross-section dari DEM) */
(function () {
  'use strict';
  var G = window.Geo, K = window.Kml;
  var inited = false, map = null, drawn = null, hoverMarker = null;
  var samples = []; // {d (meter), lat, lon, e (meter)}

  function baseLayers() {
    return {
      'Satelit': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Citra: Esri World Imagery', maxZoom: 19
      }),
      'Peta': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap', maxZoom: 19
      }),
      'Topo': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Esri World Topo', maxZoom: 19
      })
    };
  }

  function initMap() {
    var layers = baseLayers();
    map = L.map('map-profile', { layers: [layers['Satelit']] }).setView([-2.9, 104.7], 5);
    L.control.layers(layers).addTo(map);
    var drawCtl = new L.Control.Draw({
      draw: {
        polyline: { shapeOptions: { color: '#e11d48', weight: 4 } },
        polygon: false, rectangle: false, circle: false, marker: false, circlemarker: false
      },
      edit: { featureGroup: new L.FeatureGroup() }
    });
    map.addControl(drawCtl);
    drawn = drawCtl.options.edit.featureGroup;
    map.addLayer(drawn);
    map.on(L.Draw.Event.CREATED, function (e) {
      drawn.clearLayers();
      drawn.addLayer(e.layer);
      analyze(e.layer.getLatLngs());
    });
    map.on(L.Draw.Event.DELETED, function () { clearAll(); });
    setTimeout(function () { map.invalidateSize(); }, 100);
  }

  function clearAll() {
    samples = [];
    document.getElementById('pf-chart-wrap').style.display = 'none';
    document.getElementById('pf-stats').innerHTML = '<p class="hint">Gambar garis di peta untuk membuat profil ketinggian.</p>';
    document.getElementById('pf-dl').style.display = 'none';
    if (hoverMarker) { map.removeLayer(hoverMarker); hoverMarker = null; }
  }

  // titik-titik sampel sepanjang polyline (jarak antar titik ~ merata)
  function samplePoints(latlngs, n) {
    var cum = [0];
    for (var i = 1; i < latlngs.length; i++) {
      cum.push(cum[i - 1] + G.haversine(latlngs[i - 1].lat, latlngs[i - 1].lng, latlngs[i].lat, latlngs[i].lng));
    }
    var total = cum[cum.length - 1], pts = [];
    for (var k = 0; k < n; k++) {
      var d = total * k / (n - 1), j = 1;
      while (j < cum.length - 1 && cum[j] < d) j++;
      var segLen = cum[j] - cum[j - 1] || 1, f = (d - cum[j - 1]) / segLen;
      pts.push({
        d: d,
        lat: latlngs[j - 1].lat + (latlngs[j].lat - latlngs[j - 1].lat) * f,
        lon: latlngs[j - 1].lng + (latlngs[j].lng - latlngs[j - 1].lng) * f
      });
    }
    return { pts: pts, total: total };
  }

  function analyze(latlngs) {
    var status = document.getElementById('pf-stats');
    status.innerHTML = '<p class="hint">⏳ Mengambil data ketinggian…</p>';
    var total = G.polylineLength(latlngs);
    var n = Math.min(600, Math.max(80, Math.round(total / 30)));
    var sp = samplePoints(latlngs, n);
    var lats = latlngs.map(function (p) { return p.lat; }), lons = latlngs.map(function (p) { return p.lng; });
    var bbox = {
      west: Math.min.apply(null, lons) - 0.01, east: Math.max.apply(null, lons) + 0.01,
      south: Math.min.apply(null, lats) - 0.01, north: Math.max.apply(null, lats) + 0.01
    };
    var z = G.chooseZoomForLength(total);
    G.fetchElevationGrid(bbox, z).then(function (grid) {
      samples = sp.pts.map(function (p) {
        return { d: p.d, lat: p.lat, lon: p.lon, e: G.sampleGrid(grid, p.lon, p.lat) };
      });
      drawChart();
      renderStats(sp.total);
      document.getElementById('pf-chart-wrap').style.display = '';
      document.getElementById('pf-dl').style.display = '';
    }).catch(function (err) {
      status.innerHTML = '<p class="hint err-text">Gagal: ' + K.esc(err.message) + '</p>';
    });
  }

  function renderStats(total) {
    var es = samples.map(function (s) { return s.e; });
    var mn = Math.min.apply(null, es), mx = Math.max.apply(null, es);
    var maxSlope = 0;
    for (var i = 1; i < samples.length; i++) {
      var dd = samples[i].d - samples[i - 1].d;
      if (dd > 0) maxSlope = Math.max(maxSlope, Math.abs(samples[i].e - samples[i - 1].e) / dd * 100);
    }
    document.getElementById('pf-stats').innerHTML =
      '<div class="res-grid">' +
      '<div class="res"><span>Jarak total</span><b>' + G.fmtDist(total) + '</b></div>' +
      '<div class="res"><span>Elevasi min</span><b>' + G.fmtNum(mn, 1) + ' m</b></div>' +
      '<div class="res"><span>Elevasi maks</span><b>' + G.fmtNum(mx, 1) + ' m</b></div>' +
      '<div class="res"><span>Beda tinggi</span><b>' + G.fmtNum(mx - mn, 1) + ' m</b></div>' +
      '<div class="res"><span>Kemiringan maks</span><b>' + G.fmtNum(maxSlope, 1) + ' %</b></div>' +
      '</div>';
  }

  function drawChart() {
    var wrap = document.getElementById('pf-chart-wrap');
    var cv = document.getElementById('pf-chart');
    var W = wrap.clientWidth || 800, H = 260, dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    var ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
    var padL = 52, padR = 14, padT = 14, padB = 30;
    var iw = W - padL - padR, ih = H - padT - padB;
    var es = samples.map(function (s) { return s.e; });
    var ds = samples.map(function (s) { return s.d; });
    var mn = Math.min.apply(null, es), mx = Math.max.apply(null, es);
    if (mx - mn < 1) { mn -= 1; mx += 1; }
    var dMax = ds[ds.length - 1] || 1;
    function X(d) { return padL + d / dMax * iw; }
    function Y(e) { return padT + (1 - (e - mn) / (mx - mn)) * ih; }

    ctx.clearRect(0, 0, W, H);
    // grid horizontal
    ctx.strokeStyle = '#e5e7eb'; ctx.fillStyle = '#6b7280'; ctx.font = '11px system-ui';
    ctx.lineWidth = 1; ctx.textAlign = 'right';
    for (var gi = 0; gi <= 4; gi++) {
      var ev = mn + (mx - mn) * gi / 4, yy = Y(ev);
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke();
      ctx.fillText(G.fmtNum(ev, 0) + ' m', padL - 6, yy + 4);
    }
    // label jarak
    ctx.textAlign = 'center';
    for (var di = 0; di <= 4; di++) {
      var dv = dMax * di / 4;
      ctx.fillText(G.fmtDist(dv), X(dv), H - 10);
    }
    // area + garis profil
    var grad = ctx.createLinearGradient(0, padT, 0, padT + ih);
    grad.addColorStop(0, 'rgba(22,163,74,.45)'); grad.addColorStop(1, 'rgba(22,163,74,.05)');
    ctx.beginPath(); ctx.moveTo(X(ds[0]), Y(es[0]));
    for (var i = 1; i < samples.length; i++) ctx.lineTo(X(ds[i]), Y(es[i]));
    ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.lineTo(X(dMax), padT + ih); ctx.lineTo(X(0), padT + ih); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    // hover
    var tip = document.getElementById('pf-tip');
    cv.onmousemove = function (ev) {
      var r = cv.getBoundingClientRect(), mxp = ev.clientX - r.left;
      var best = 0, bd = 1e18;
      for (var i = 0; i < samples.length; i++) {
        var dd = Math.abs(X(samples[i].d) - mxp);
        if (dd < bd) { bd = dd; best = i; }
      }
      var s = samples[best];
      var slope = '';
      if (best > 0) {
        var dseg = s.d - samples[best - 1].d;
        if (dseg > 0) slope = ' · kemiringan ' + G.fmtNum((s.e - samples[best - 1].e) / dseg * 100, 1) + '%';
      }
      tip.style.display = 'block';
      tip.style.left = Math.min(W - 190, Math.max(4, X(s.d) - 90)) + 'px';
      tip.style.top = '8px';
      tip.innerHTML = '<b>' + G.fmtDist(s.d) + '</b> · ' + G.fmtNum(s.e, 1) + ' m' + slope;
      if (!hoverMarker) hoverMarker = L.circleMarker([s.lat, s.lon], { radius: 7, color: '#e11d48', weight: 3, fillOpacity: 0 }).addTo(map);
      hoverMarker.setLatLng([s.lat, s.lon]);
    };
    cv.onmouseleave = function () {
      tip.style.display = 'none';
      if (hoverMarker) { map.removeLayer(hoverMarker); hoverMarker = null; }
    };
  }

  function downloadCSV() {
    var s = 'jarak_m;elevasi_m;lintang;bujur\n';
    samples.forEach(function (p) {
      s += p.d.toFixed(1) + ';' + p.e.toFixed(2) + ';' + p.lat.toFixed(6) + ';' + p.lon.toFixed(6) + '\n';
    });
    K.download('profil_ketinggian.csv', s, 'text/csv;charset=utf-8');
  }
  function downloadKML() {
    K.download('profil_ketinggian.kml', K.build('Profil Ketinggian', [{
      kind: 'line', name: 'Jalur Profil',
      coords: samples.filter(function (_, i) { return i % 5 === 0; }).map(function (p) { return [p.lon, p.lat]; }),
      desc: samples.length + ' titik sampel'
    }]), 'application/vnd.google-earth.kml+xml');
  }

  function init() {
    if (inited) return; inited = true;
    initMap();
    document.getElementById('pf-csv').onclick = downloadCSV;
    document.getElementById('pf-kml').onclick = downloadKML;
    window.addEventListener('resize', function () { if (samples.length) drawChart(); });
  }

  function refresh() { if (map) setTimeout(function(){ map.invalidateSize(); }, 60); }
  window.ToolProfile = { init: init, refresh: refresh };
})();
