/* app.js — SATU peta, toolbar alat, panel samping */
(function () {
  'use strict';

  var map = null;
  var current = 'explore';
  var pickMode = false;
  var inited = {};
  var DRAW_TOOLS = { profile: 'ToolProfile', contour: 'ToolContour', measure: 'ToolMeasure' };

  var TITLES = {
    explore: 'Jelajah',
    converter: 'Konverter Koordinat',
    profile: 'Profil Ketinggian',
    contour: 'Kontur',
    measure: 'Ukur Lahan & Cut-Fill'
  };

  function fmt(n, d) {
    return Number(n).toLocaleString('id-ID', { maximumFractionDigits: d == null ? 5 : d });
  }
  function utmZone(lon) { return Math.floor((lon + 180) / 6) + 1; }

  function ensureInit(name) {
    if (inited[name]) return;
    inited[name] = true;
    if (name === 'converter') window.ToolConverter.init();
    else if (DRAW_TOOLS[name]) window[DRAW_TOOLS[name]].init(map);
  }

  function deactivateDraw() {
    Object.keys(DRAW_TOOLS).forEach(function (t) {
      if (inited[t]) window[DRAW_TOOLS[t]].deactivate();
    });
  }

  function openPanel(name) {
    document.querySelectorAll('.panel-sec').forEach(function (s) {
      s.classList.toggle('active', s.dataset.panel === name);
    });
    document.getElementById('panel-title').textContent = TITLES[name] || 'Alat';
    document.getElementById('panel').classList.add('open');
  }
  function closePanel() {
    document.getElementById('panel').classList.remove('open');
  }

  function setTool(name) {
    if (name === current) {
      // klik alat yang sama: untuk draw tools = mulai gambar baru; lainnya = buka/tutup panel
      if (DRAW_TOOLS[name]) {
        document.getElementById('panel').classList.add('open');
        window[DRAW_TOOLS[name]].activate();
      } else {
        document.getElementById('panel').classList.toggle('open');
      }
      return;
    }
    if (window.QuickMeasure) QuickMeasure.clear(); // bersihkan ukur cepat saat ganti alat
    deactivateDraw();
    pickMode = false;
    current = name;
    document.querySelectorAll('.tool-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tool === name);
    });
    ensureInit(name);
    if (DRAW_TOOLS[name]) window[DRAW_TOOLS[name]].activate();
    if (name === 'explore') {
      // reset konten aktif ke Jelajah supaya panel tidak menampilkan sisa tab sebelumnya
      document.querySelectorAll('.panel-sec').forEach(function (s) {
        s.classList.toggle('active', s.dataset.panel === 'explore');
      });
      document.getElementById('panel-title').textContent = TITLES.explore;
      closePanel();
    } else openPanel(name);
  }

  // dipanggil tombol "📍 Ambil dari peta" di konverter
  window.AppPickCoord = function () {
    pickMode = true;
    closePanel();
    var rc = document.getElementById('coords');
    rc.innerHTML = '👆 <b>Klik satu titik di peta</b> untuk mengisi koordinat…';
  };

  function explorePopup(latlng) {
    var html;
    if (window.CoordFmt) {
      html = window.CoordFmt.popupHTML(latlng.lat, latlng.lng) +
        '<br><span style="color:#6b7280;font-size:12px">Atur format di tab Koordinat</span>';
    } else {
      var zone = utmZone(latlng.lng), south = latlng.lat < 0;
      var def = '+proj=utm +zone=' + zone + (south ? ' +south' : '') + ' +datum=WGS84 +units=m +no_defs';
      var p = proj4('WGS84', def, [latlng.lng, latlng.lat]);
      html = '<b>LatLon:</b> ' + fmt(latlng.lat) + ', ' + fmt(latlng.lng) +
        '<br><b>UTM:</b> ' + fmt(p[0], 1) + ' E, ' + fmt(p[1], 1) + ' N' +
        '<br><span style="color:#6b7280;font-size:12px">Zona ' + zone + (south ? 'S' : 'N') + '</span>';
    }
    html += '<button class="qm-btn" type="button">Ukur jarak dari titik ini</button>';
    L.popup().setLatLng(latlng).setContent(html).openOn(map);
    var qbtn = document.querySelector('.leaflet-popup-content .qm-btn');
    if (qbtn) qbtn.addEventListener('click', function () {
      map.closePopup();
      if (window.QuickMeasure) QuickMeasure.arm(latlng);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    map = window.GMap.init();
    if (window.QuickMeasure) QuickMeasure.init(map);
    var readout = document.getElementById('coords');
    var defaultHint = readout.innerHTML;

    map.on('mousemove', function (e) {
      if (!pickMode) {
        readout.innerHTML = 'Lat <b>' + fmt(e.latlng.lat) + '</b> &nbsp; Lon <b>' + fmt(e.latlng.lng) + '</b>';
      }
    });

    map.on('click', function (e) {
      if (window.QuickMeasure && QuickMeasure.handleClick(e.latlng)) return; // ukur jarak cepat: titik B
      if (pickMode) {
        pickMode = false;
        document.getElementById('cv-lat').value = e.latlng.lat.toFixed(6);
        document.getElementById('cv-lon').value = e.latlng.lng.toFixed(6);
        readout.innerHTML = defaultHint;
        ensureInit('converter');
        openPanel('converter');
        document.getElementById('cv-go1').click();
        return;
      }
      if (current !== 'explore') return; // alat gambar sedang aktif
      explorePopup(e.latlng);
    });

    document.querySelectorAll('.tool-btn').forEach(function (b) {
      b.addEventListener('click', function () { setTool(b.dataset.tool); });
    });
    document.getElementById('panel-close').addEventListener('click', closePanel);

    // klik chip "SurveyKit" = sembunyikan/tampilkan toolbar (biar peta lega)
    var brand = document.getElementById('brand-chip');
    function toggleToolbar() {
      var hidden = document.body.classList.toggle('ui-hidden');
      brand.setAttribute('aria-pressed', hidden ? 'true' : 'false');
      brand.title = hidden ? 'Tampilkan toolbar' : 'Sembunyikan toolbar';
      if (hidden) {
        var ts = document.getElementById('tool-search');
        if (ts) ts.classList.remove('open'); // tutup kolom cari mobile
      }
    }
    brand.addEventListener('click', toggleToolbar);
    brand.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleToolbar(); }
    });

    // mulai dalam mode jelajah
    document.querySelector('.panel-sec[data-panel="explore"]').classList.add('active');
  });
})();
