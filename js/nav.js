/* nav.js — Navigasi Pancang: tuntun ke titik tersimpan ala GPS handheld Garmin.
   Panah besar muter nunjukin arah target (bearing − heading kompas),
   jarak live via haversine, status "Sampai!" kalau < 5 meter. */
(function () {
  'use strict';
  var G = window.Geo;

  var map = null;
  var active = false;
  var target = null;          // {name, lat, lon}
  var watchId = null;
  var lastPos = null;         // {lat, lon}
  var heading = null;         // derajat 0..360 dari utara, null = kompas nggak tersedia
  var compassTimer = null;
  var navLayer = null;

  var ARRIVED_M = 5;

  var ARROW_SVG = '<svg viewBox="0 0 100 100" aria-hidden="true">' +
    '<circle cx="50" cy="50" r="46" fill="rgba(52,211,153,.08)" stroke="rgba(52,211,153,.45)" stroke-width="2"/>' +
    '<polygon points="50,14 74,66 50,56 26,66" fill="#34d399" stroke="#0b1220" stroke-width="2"/>' +
    '<text x="50" y="90" text-anchor="middle" font-size="11" font-weight="800" fill="#93a1b0">N</text></svg>';

  function el(id) { return document.getElementById(id); }
  function toast(m) { if (window.GMap) GMap.toast(m); }

  function init(m) {
    if (map) return;
    map = m;
    buildPanel();
  }

  function buildPanel() {
    if (el('nav-panel')) return;
    var p = document.createElement('div');
    p.id = 'nav-panel';
    p.className = 'glass';
    p.hidden = true;
    p.innerHTML =
      '<div class="nav-target"><span class="nav-flag">🎯</span><b id="nav-name">–</b></div>' +
      '<div class="nav-arrow-wrap" id="nav-arrow-wrap">' + ARROW_SVG + '</div>' +
      '<div id="nav-noarrow" class="nav-noarrow" hidden>' +
      '<b id="nav-bearing-big">–°</b><span>dari utara</span></div>' +
      '<div id="nav-dist" class="nav-dist">Mencari GPS…</div>' +
      '<div id="nav-sub" class="nav-sub">akurasi <b id="nav-acc">–</b></div>' +
      '<div id="nav-arrived" class="nav-arrived" hidden>🎉 Sampai! Titiknya di sekitar sini.</div>' +
      '<p id="nav-note" class="nav-note" hidden>Kompas nggak tersedia di perangkat ini — pakai angka bearing di atas sebagai patokan arah dari utara.</p>' +
      '<button id="nav-stop" class="btn btn-block">Berhenti</button>';
    document.body.appendChild(p);
    el('nav-stop').addEventListener('click', stop);
  }

  /* ---------- kompas ---------- */

  function onHeading(h) {
    if (h == null || isNaN(h)) return;
    heading = ((h % 360) + 360) % 360;
    updateArrow();
  }
  function handleOrientation(e) {
    // iOS Safari: webkitCompassHeading (0 = utara, searah jarum jam)
    if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) {
      onHeading(e.webkitCompassHeading);
      return;
    }
    // Android Chrome: deviceorientationabsolute, alpha absolut thd utara
    if (e.absolute === true && typeof e.alpha === 'number') onHeading(360 - e.alpha);
  }
  function startCompass() {
    heading = null;
    // iOS 13+: minta izin dulu, harus dari gestur pengguna (ketukan tombol Navigasi)
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().catch(function () { /* ditolak -> fallback */ });
      }
    } catch (e) { /* abaikan */ }
    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    window.addEventListener('deviceorientation', handleOrientation, true);
    // kalau 4 detik nggak ada data kompas -> mode fallback
    clearTimeout(compassTimer);
    compassTimer = setTimeout(function () {
      if (heading == null && active) showNoCompass();
    }, 4000);
  }
  function stopCompass() {
    window.removeEventListener('deviceorientationabsolute', handleOrientation, true);
    window.removeEventListener('deviceorientation', handleOrientation, true);
    clearTimeout(compassTimer);
  }
  function showNoCompass() {
    el('nav-arrow-wrap').hidden = true;
    el('nav-noarrow').hidden = false;
    el('nav-note').hidden = false;
  }

  /* ---------- GPS ---------- */

  function gpsError(err) {
    var msg = 'GPS-nya lama banget. Coba lagi di tempat terbuka.';
    if (err && err.code === 1) msg = 'Izin lokasi ditolak. Aktifkan GPS & izin lokasi dulu.';
    else if (err && err.code === 2) msg = 'Posisinya nggak kedapetan. Pastikan GPS nyala.';
    toast(msg);
    el('nav-dist').textContent = 'GPS bermasalah';
  }

  function onPos(pos) {
    var c = pos.coords;
    lastPos = { lat: c.latitude, lon: c.longitude };
    el('nav-acc').textContent = '±' + Math.round(c.accuracy || 0) + ' m';

    var d = G.haversine(lastPos.lat, lastPos.lon, target.lat, target.lon);
    var b = G.bearing(lastPos.lat, lastPos.lon, target.lat, target.lon);

    el('nav-dist').textContent = G.fmtDist(d);
    el('nav-bearing-big').textContent = Math.round(b) + '°';

    var arrived = el('nav-arrived');
    var wasArrived = !arrived.hidden;
    arrived.hidden = d >= ARRIVED_M;
    if (d < ARRIVED_M && !wasArrived && navigator.vibrate) {
      try { navigator.vibrate(200); } catch (e) {}
    }

    updateArrow(b);
    drawNavLayer();
    followUser();
  }

  function updateArrow(bearingDeg) {
    if (heading == null || lastPos == null || !target) return;
    var b = (bearingDeg == null)
      ? G.bearing(lastPos.lat, lastPos.lon, target.lat, target.lon)
      : bearingDeg;
    var rot = ((b - heading) % 360 + 360) % 360;
    var wrap = el('nav-arrow-wrap');
    if (wrap) wrap.style.transform = 'rotate(' + rot + 'deg)';
  }

  /* ---------- layer peta: titik user + garis putus-putus ke target ---------- */

  function drawNavLayer() {
    if (!map || !lastPos) return;
    if (!navLayer) {
      navLayer = L.layerGroup().addTo(map);
      navLayer._tMarker = L.circleMarker([target.lat, target.lon], {
        radius: 9, color: '#0b1220', weight: 2, fillColor: '#34d399', fillOpacity: 1
      }).addTo(navLayer);
      navLayer._uMarker = L.circleMarker([lastPos.lat, lastPos.lon], {
        radius: 7, color: '#fff', weight: 2.5, fillColor: '#3b82f6', fillOpacity: 1
      }).addTo(navLayer);
      navLayer._line = L.polyline([[lastPos.lat, lastPos.lon], [target.lat, target.lon]], {
        color: '#34d399', weight: 2.5, dashArray: '8 7', opacity: 0.85, interactive: false
      }).addTo(navLayer);
    } else {
      navLayer._uMarker.setLatLng([lastPos.lat, lastPos.lon]);
      navLayer._line.setLatLngs([[lastPos.lat, lastPos.lon], [target.lat, target.lon]]);
    }
  }

  function followUser() {
    if (!map || !lastPos) return;
    try {
      var b = map.getBounds().pad(-0.15);
      if (!b.contains([lastPos.lat, lastPos.lon])) map.panTo([lastPos.lat, lastPos.lon]);
    } catch (e) {}
  }

  /* ---------- publik ---------- */

  function start(bm) {
    if (!bm || !map) return;
    if (!navigator.geolocation) { toast('Perangkat ini nggak mendukung GPS'); return; }
    if (active) stop(true); // ganti target tanpa ribet
    active = true;
    target = { name: bm.name, lat: +bm.lat, lon: +bm.lon };
    lastPos = null;

    el('nav-name').textContent = target.name;
    el('nav-dist').textContent = 'Mencari GPS…';
    el('nav-acc').textContent = '–';
    el('nav-bearing-big').textContent = '–°';
    el('nav-arrived').hidden = true;
    el('nav-arrow-wrap').hidden = false;
    el('nav-arrow-wrap').style.transform = 'rotate(0deg)';
    el('nav-noarrow').hidden = true;
    el('nav-note').hidden = true;
    el('nav-panel').hidden = false;
    if (window.AppSheet) AppSheet.close();

    startCompass();
    watchId = navigator.geolocation.watchPosition(onPos, gpsError, {
      enableHighAccuracy: true, timeout: 15000, maximumAge: 2000
    });
    try { map.flyTo([target.lat, target.lon], Math.max(map.getZoom(), 16), { duration: 1 }); } catch (e) {}
  }

  function stop(silent) {
    if (!active && !silent) return;
    active = false;
    target = null;
    lastPos = null;
    heading = null;
    if (watchId != null && navigator.geolocation) {
      try { navigator.geolocation.clearWatch(watchId); } catch (e) {}
      watchId = null;
    }
    stopCompass();
    if (navLayer && map) { try { map.removeLayer(navLayer); } catch (e) {} navLayer = null; }
    var p = el('nav-panel');
    if (p) p.hidden = true;
    if (!silent) toast('Navigasi berhenti');
  }

  window.NavPancang = { init: init, start: start, stop: stop, isActive: function () { return active; } };
})();
