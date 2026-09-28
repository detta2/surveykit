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

  /* ---------- format koordinat tambahan (murni JS, tanpa API) ---------- */

  // MGRS presisi 1 m: "48M YN 12345 67890"
  function fmtMGRS(lat, lon) {
    if (lat < -80 || lat > 84) return 'di luar jangkauan';
    var u = latLonToUtm(lat, lon);
    var bands = 'CDEFGHJKLMNPQRSTUVWX';
    var band = bands[Math.floor((lat + 80) / 8)];
    var eSets = ['ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ'];
    var nSets = ['ABCDEFGHJKLMNPQRSTUV', 'FGHJKLMNPQRSTUVABCDE'];
    var e100k = eSets[(u.zone - 1) % 3][Math.floor(u.easting / 100000) - 1];
    var n100k = nSets[u.zone % 2][Math.floor(u.northing / 100000) % 20];
    function p5(v) { var s = String(Math.floor(v % 100000)); while (s.length < 5) s = '0' + s; return s; }
    return u.zone + band + ' ' + e100k + n100k + ' ' + p5(u.easting) + ' ' + p5(u.northing);
  }

  // Plus Code (Open Location Code) 10 digit, cth: "6P3W2HMJ+MX"
  function fmtPlus(lat, lon) {
    var A = '23456789CFGHJMPQRVWX';
    lat = Math.max(-90, Math.min(90, lat));
    lon = ((lon + 180) % 360 + 360) % 360 - 180;
    if (lat >= 90) lat = 90 - 1e-9;
    var latN = lat + 90, lonN = lon + 180, code = '';
    var latR = 20, lonR = 20, i, dLa, dLo;
    for (i = 0; i < 5; i++) {
      dLa = Math.min(19, Math.floor(latN / latR));
      dLo = Math.min(19, Math.floor(lonN / lonR));
      code += A[dLa] + A[dLo];
      latN -= dLa * latR; lonN -= dLo * lonR;
      latR /= 20; lonR /= 20;
    }
    return code.slice(0, 8) + '+' + code.slice(8);
  }

  // Geohash presisi 8 karakter
  function fmtGeohash(lat, lon) {
    var B32 = '0123456789bcdefghjkmnpqrstuvwxyz';
    var latI = [-90, 90], lonI = [-180, 180];
    var hash = '', even = true, bit = 0, ch = 0, mid;
    while (hash.length < 8) {
      if (even) {
        mid = (lonI[0] + lonI[1]) / 2;
        if (lon > mid) { ch |= (1 << (4 - bit)); lonI[0] = mid; } else { lonI[1] = mid; }
      } else {
        mid = (latI[0] + latI[1]) / 2;
        if (lat > mid) { ch |= (1 << (4 - bit)); latI[0] = mid; } else { latI[1] = mid; }
      }
      even = !even;
      if (bit < 4) { bit++; } else { hash += B32[ch]; bit = 0; ch = 0; }
    }
    return hash;
  }

  /* ---------- registry format + preferensi user ---------- */
  var FORMATS = [
    { id: 'dd', label: 'Desimal', fn: function (la, lo) { return fmt(la, 6) + '°, ' + fmt(lo, 6) + '°'; } },
    { id: 'dms', label: 'DMS', fn: function (la, lo) { return toDMS(la, true) + ', ' + toDMS(lo, false); } },
    {
      id: 'utm', label: 'UTM', fn: function (la, lo) {
        var u = latLonToUtm(la, lo);
        return u.zone + (u.south ? 'S' : 'N') + ' · ' + fmt(u.easting, 1) + ' E / ' + fmt(u.northing, 1) + ' N';
      }
    },
    { id: 'mgrs', label: 'MGRS', fn: fmtMGRS },
    { id: 'plus', label: 'Plus Code', fn: fmtPlus },
    { id: 'geohash', label: 'Geohash', fn: fmtGeohash }
  ];
  var LS_KEY = 'sk_cfmt';
  function enabled() {
    try {
      var s = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (Array.isArray(s)) {
        var ok = s.filter(function (id) { return FORMATS.some(function (f) { return f.id === id; }); });
        if (ok.length) return ok;
      }
    } catch (e) { /* abaikan */ }
    return ['dd', 'dms', 'utm'];
  }
  function saveEnabled(ids) { try { localStorage.setItem(LS_KEY, JSON.stringify(ids)); } catch (e) { /* abaikan */ } }
  function byId(id) { return FORMATS.filter(function (f) { return f.id === id; })[0]; }

  function cardsHTML(lat, lon) {
    var html = '<div class="res-grid">';
    enabled().forEach(function (id) {
      var f = byId(id);
      if (f) html += '<div class="res"><span>' + f.label + '</span><b>' + f.fn(lat, lon) + '</b></div>';
    });
    return html + '</div>';
  }
  function popupHTML(lat, lon) {
    return enabled().map(function (id) {
      var f = byId(id);
      return f ? '<b>' + f.label + ':</b> ' + f.fn(lat, lon) : '';
    }).filter(Boolean).join('<br>');
  }

  var lastSingle = null, lastReverse = null;

  function renderChips() {
    var el = document.getElementById('cv-fmts');
    if (!el) return;
    var en = enabled();
    el.innerHTML = FORMATS.map(function (f) {
      return '<button type="button" class="fmt-chip' + (en.indexOf(f.id) >= 0 ? ' on' : '') + '" data-fmt="' + f.id + '">' + f.label + '</button>';
    }).join('');
    Array.prototype.forEach.call(el.querySelectorAll('.fmt-chip'), function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-fmt'), cur = enabled(), i = cur.indexOf(id);
        if (i >= 0) { if (cur.length > 1) cur.splice(i, 1); } // minimal 1 format aktif
        else cur.push(id);
        saveEnabled(cur);
        renderChips();
        if (lastSingle) renderSingle();
        if (lastReverse) renderReverse();
      };
    });
  }

  window.CoordFmt = { enabled: enabled, cardsHTML: cardsHTML, popupHTML: popupHTML, renderChips: renderChips };

  /* ---------- UI titik tunggal ---------- */
  function renderSingle() {
    var lat = parseCoord(document.getElementById('cv-lat').value);
    var lon = parseCoord(document.getElementById('cv-lon').value);
    var out = document.getElementById('cv-out');
    if (isNaN(lat) || isNaN(lon)) { out.innerHTML = '<p class="hint">Isi lintang & bujur yang bener.</p>'; return; }
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) { out.innerHTML = '<p class="hint err-text">Lintang maks ±90, bujur maks ±180.</p>'; return; }
    lastSingle = { lat: lat, lon: lon }; lastReverse = null;
    var u = latLonToUtm(lat, lon);
    out.innerHTML = cardsHTML(lat, lon) +
      '<button class="btn secondary" id="cv-kml1">⬇ Simpan KML titik ini</button>';
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
    if (isNaN(e) || isNaN(n)) { out.innerHTML = '<p class="hint">Isi easting & northing yang bener.</p>'; return; }
    var zone = parseInt(zsel, 10), south = zsel.slice(-1) === 'S';
    var ll = utmToLatLon(e, n, zone, south);
    lastReverse = { lat: ll.lat, lon: ll.lon }; lastSingle = null;
    out.innerHTML = cardsHTML(ll.lat, ll.lon) +
      '<button class="btn secondary" id="cv-kml2">⬇ Simpan KML titik ini</button>';
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
    if (!batchRows.length) { out.innerHTML = '<p class="hint err-text">Nggak ada baris yang valid. Format: nama;lintang;bujur atau nama;easting;northing;zona</p>'; return; }
    var html = '<p class="ok-text">✔ ' + batchRows.length + ' titik beres' + (errs ? ', ' + errs + ' baris dilewati' : '') + '</p>';
    html += '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nama</th><th>Lintang</th><th>Bujur</th><th>Easting</th><th>Northing</th><th>Zona</th></tr></thead><tbody>';
    batchRows.slice(0, 100).forEach(function (r) {
      html += '<tr><td>' + K.esc(r.name) + '</td><td>' + fmt(r.lat, 6) + '</td><td>' + fmt(r.lon, 6) + '</td><td>' + fmt(r.e) + '</td><td>' + fmt(r.n) + '</td><td>' + r.z + '</td></tr>';
    });
    html += '</tbody></table></div>';
    if (batchRows.length > 100) html += '<p class="hint">Menampilkan 100 dari ' + batchRows.length + ' baris.</p>';
    html += '<div class="btn-row"><button class="btn secondary" id="cv-dl-csv">⬇ Simpan CSV</button>' +
      '<button class="btn secondary" id="cv-dl-kml">⬇ Simpan KML</button></div>';
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
    renderChips();
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
