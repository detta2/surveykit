/* converter.js — Tool 1: Konverter Koordinat (LatLon <-> UTM) */
(function () {
  'use strict';
  var G = window.Geo, K = window.Kml;
  var inited = false;

  function utmZone(lon) { return Math.floor((lon + 180) / 6) + 1; }
  function isSouth(lat) { return lat < 0; }
  function utmDef(zone, south) {
    return '+proj=utm +zone=' + zone + (south ? ' +south' : '') + ' +datum=WGS84 +units=m +no_defs';
  }

  function latLonToUtm(lat, lon, forceZone) {
    var zone = forceZone || utmZone(lon);
    var south = isSouth(lat);
    var p = proj4('WGS84', utmDef(zone, south), [lon, lat]);
    return { easting: p[0], northing: p[1], zone: zone, south: south };
  }
  function utmToLatLon(e, n, zone, south) {
    var p = proj4(utmDef(zone, south), 'WGS84', [e, n]);
    return { lat: p[1], lon: p[0] };
  }

  // parse DMS: 6°12'34.5"S | 6 12 34.5 S | -6.2097 | 106°49'BT
  function parseCoord(str) {
    if (str == null) return NaN;
    str = String(str).trim();
    if (str === '') return NaN;
    var m = str.match(/^([+-]?\d+(?:[.,]\d+)?)\s*°?\s*(?:(\d+(?:[.,]\d+)?)\s*['′]?\s*)?(?:(\d+(?:[.,]\d+)?)\s*["″]?\s*)?\s*([NSEWTBnsewtb]|UT|US|TS|BT|BB)?$/);
    if (!m) return NaN;
    var deg = parseFloat(m[1].replace(',', '.'));
    var min = m[2] ? parseFloat(m[2].replace(',', '.')) : 0;
    var sec = m[3] ? parseFloat(m[3].replace(',', '.')) : 0;
    var hemi = (m[4] || '').toUpperCase();
    var dec = Math.abs(deg) + min / 60 + sec / 3600;
    if (deg < 0) dec = -dec;
    if (hemi === 'S' || hemi === 'W' || hemi === 'B' || hemi === 'US' || hemi === 'BB' || hemi === 'TS') dec = -Math.abs(dec);
    if (hemi === 'N' || hemi === 'E' || hemi === 'T' || hemi === 'UT' || hemi === 'BT') dec = Math.abs(dec);
    return dec;
  }

  function toDMS(dec, isLat) {
    var hemi = isLat ? (dec < 0 ? 'S' : 'U') : (dec < 0 ? 'B' : 'T');
    var a = Math.abs(dec);
    var d = Math.floor(a), m = Math.floor((a - d) * 60), s = ((a - d) * 60 - m) * 60;
    return d + '°' + m + "'" + s.toFixed(1) + '"' + hemi;
  }

  function fmt(v, d) { return G.fmtNum(v, d == null ? 3 : d); }

  /* ---------- UI titik tunggal ---------- */
  function renderSingle() {
    var lat = parseCoord(document.getElementById('cv-lat').value);
    var lon = parseCoord(document.getElementById('cv-lon').value);
    var out = document.getElementById('cv-out');
    if (isNaN(lat) || isNaN(lon)) { out.innerHTML = '<p class="hint">Masukkan lintang & bujur yang valid.</p>'; return; }
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) { out.innerHTML = '<p class="hint err-text">Lintang maks ±90, bujur maks ±180.</p>'; return; }
    var u = latLonToUtm(lat, lon);
    out.innerHTML =
      '<div class="res-grid">' +
      '<div class="res"><span>UTM Zone</span><b>' + u.zone + (u.south ? 'S' : 'N') + '</b></div>' +
      '<div class="res"><span>Easting (m)</span><b>' + fmt(u.easting) + '</b></div>' +
      '<div class="res"><span>Northing (m)</span><b>' + fmt(u.northing) + '</b></div>' +
      '<div class="res"><span>DMS</span><b>' + toDMS(lat, true) + ', ' + toDMS(lon, false) + '</b></div>' +
      '</div>' +
      '<button class="btn secondary" id="cv-kml1">⬇ Unduh KML titik ini</button>';
    document.getElementById('cv-kml1').onclick = function () {
      K.download('titik.kml', K.build('Titik Konversi', [{
        kind: 'point', name: 'Titik', coords: [lon, lat],
        desc: 'LatLon: ' + lat + ', ' + lon + ' | UTM ' + u.zone + (u.south ? 'S' : 'N') + ': ' + fmt(u.easting) + ', ' + fmt(u.northing)
      }]), 'application/vnd.google-earth.kml+xml');
    };
  }

  function renderReverse() {
    var e = parseFloat(String(document.getElementById('cv-e').value).replace(',', '.'));
    var n = parseFloat(String(document.getElementById('cv-n').value).replace(',', '.'));
    var zsel = document.getElementById('cv-zone').value; // "48S"
    var out = document.getElementById('cv-out2');
    if (isNaN(e) || isNaN(n)) { out.innerHTML = '<p class="hint">Masukkan easting & northing yang valid.</p>'; return; }
    var zone = parseInt(zsel, 10), south = zsel.slice(-1) === 'S';
    var ll = utmToLatLon(e, n, zone, south);
    out.innerHTML =
      '<div class="res-grid">' +
      '<div class="res"><span>Lintang</span><b>' + fmt(ll.lat, 6) + '°</b></div>' +
      '<div class="res"><span>Bujur</span><b>' + fmt(ll.lon, 6) + '°</b></div>' +
      '<div class="res"><span>DMS</span><b>' + toDMS(ll.lat, true) + ', ' + toDMS(ll.lon, false) + '</b></div>' +
      '</div>' +
      '<button class="btn secondary" id="cv-kml2">⬇ Unduh KML titik ini</button>';
    document.getElementById('cv-kml2').onclick = function () {
      K.download('titik.kml', K.build('Titik Konversi', [{
        kind: 'point', name: 'Titik', coords: [ll.lon, ll.lat],
        desc: 'UTM ' + zone + (south ? 'S' : 'N') + ': ' + fmt(e) + ', ' + fmt(n)
      }]), 'application/vnd.google-earth.kml+xml');
    };
  }

  /* ---------- UI batch CSV ---------- */
  var batchRows = [];

  function detectDelim(line) {
    var c = { ';': 0, ',': 0, '\t': 0 };
    for (var i = 0; i < line.length; i++) if (c[line[i]] !== undefined) c[line[i]]++;
    var best = ';', bv = -1;
    Object.keys(c).forEach(function (k) { if (c[k] > bv) { bv = c[k]; best = k; } });
    return best;
  }

  function runBatch() {
    var txt = document.getElementById('cv-csv').value.trim();
    var dir = document.getElementById('cv-dir').value; // ll2utm | utm2ll
    var out = document.getElementById('cv-batch-out');
    batchRows = [];
    if (!txt) { out.innerHTML = '<p class="hint">Tempel/pilih data CSV dulu.</p>'; return; }
    var lines = txt.split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
    if (!lines.length) return;
    var delim = detectDelim(lines[0]);
    var start = 0;
    // lewati header bila baris pertama non-numerik di kolom angka
    var first = lines[0].split(delim);
    if (dir === 'll2utm' && (isNaN(parseCoord(first[1])) || isNaN(parseCoord(first[2])))) start = 1;
    if (dir === 'utm2ll' && (isNaN(parseFloat(first[1])) || isNaN(parseFloat(first[2])))) start = 1;

    var errs = 0;
    for (var i = start; i < lines.length; i++) {
      var c = lines[i].split(delim).map(function (s) { return s.trim(); });
      if (dir === 'll2utm') {
        var lat = parseCoord(c[1]), lon = parseCoord(c[2]);
        if (isNaN(lat) || isNaN(lon)) { errs++; continue; }
        var u = latLonToUtm(lat, lon);
        batchRows.push({ name: c[0] || ('T' + (i + 1)), lat: lat, lon: lon, e: u.easting, n: u.northing, z: u.zone + (u.south ? 'S' : 'N') });
      } else {
        var e = parseFloat(String(c[1]).replace(',', '.')), nn = parseFloat(String(c[2]).replace(',', '.'));
        var zs = (c[3] || '48S').toUpperCase().replace(/\s/g, '');
        var zone = parseInt(zs, 10) || 48, south = zs.slice(-1) !== 'N';
        if (isNaN(e) || isNaN(nn)) { errs++; continue; }
        var ll = utmToLatLon(e, nn, zone, south);
        batchRows.push({ name: c[0] || ('T' + (i + 1)), lat: ll.lat, lon: ll.lon, e: e, n: nn, z: zone + (south ? 'S' : 'N') });
      }
    }
    if (!batchRows.length) { out.innerHTML = '<p class="hint err-text">Tidak ada baris valid. Format: nama;lintang;bujur atau nama;easting;northing;zona</p>'; return; }
    var html = '<p class="ok-text">✔ ' + batchRows.length + ' titik berhasil' + (errs ? ', ' + errs + ' baris dilewati' : '') + '</p>';
    html += '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nama</th><th>Lintang</th><th>Bujur</th><th>Easting</th><th>Northing</th><th>Zona</th></tr></thead><tbody>';
    batchRows.slice(0, 100).forEach(function (r) {
      html += '<tr><td>' + K.esc(r.name) + '</td><td>' + fmt(r.lat, 6) + '</td><td>' + fmt(r.lon, 6) + '</td><td>' + fmt(r.e) + '</td><td>' + fmt(r.n) + '</td><td>' + r.z + '</td></tr>';
    });
    html += '</tbody></table></div>';
    if (batchRows.length > 100) html += '<p class="hint">Menampilkan 100 dari ' + batchRows.length + ' baris.</p>';
    html += '<div class="btn-row"><button class="btn secondary" id="cv-dl-csv">⬇ Unduh CSV</button>' +
      '<button class="btn secondary" id="cv-dl-kml">⬇ Unduh KML</button></div>';
    out.innerHTML = html;
    document.getElementById('cv-dl-csv').onclick = downloadBatchCSV;
    document.getElementById('cv-dl-kml').onclick = downloadBatchKML;
  }

  function downloadBatchCSV() {
    var s = 'nama;lintang;bujur;easting;northing;zona_utm\n';
    batchRows.forEach(function (r) {
      s += [r.name, r.lat.toFixed(6), r.lon.toFixed(6), r.e.toFixed(3), r.n.toFixed(3), r.z].join(';') + '\n';
    });
    K.download('konversi_koordinat.csv', s, 'text/csv;charset=utf-8');
  }
  function downloadBatchKML() {
    var pm = batchRows.map(function (r) {
      return {
        kind: 'point', name: r.name, coords: [r.lon, r.lat],
        desc: 'LatLon: ' + r.lat.toFixed(6) + ', ' + r.lon.toFixed(6) + ' | UTM ' + r.z + ': ' + G.fmtNum(r.e) + ', ' + G.fmtNum(r.n)
      };
    });
    K.download('konversi_koordinat.kml', K.build('Konversi Koordinat', pm), 'application/vnd.google-earth.kml+xml');
  }

  function init() {
    if (inited) return; inited = true;
    // isi dropdown zona UTM 48-54
    var zsel = document.getElementById('cv-zone');
    for (var z = 48; z <= 54; z++) {
      [['S', 'Selatan'], ['N', 'Utara']].forEach(function (h) {
        var o = document.createElement('option');
        o.value = z + h[0]; o.textContent = z + h[0] + ' (' + h[1] + ')';
        if (z === 48 && h[0] === 'S') o.selected = true;
        zsel.appendChild(o);
      });
    }
    document.getElementById('cv-go1').onclick = renderSingle;
    document.getElementById('cv-go2').onclick = renderReverse;
    var pickBtn = document.getElementById('cv-pick');
    if (pickBtn) pickBtn.onclick = function () { if (window.AppPickCoord) window.AppPickCoord(); };
    document.getElementById('cv-run').onclick = runBatch;
    document.getElementById('cv-file').addEventListener('change', function (ev) {
      var f = ev.target.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { document.getElementById('cv-csv').value = rd.result; };
      rd.readAsText(f);
    });
  }

  window.ToolConverter = { init: init };
  // ekspor untuk pengujian
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseCoord: parseCoord, toDMS: toDMS, latLonToUtm: latLonToUtm, utmToLatLon: utmToLatLon };
  }
})();
