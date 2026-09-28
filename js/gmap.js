/* gmap.js — SATU peta Leaflet bersama untuk semua tool SurveyKit */
(function () {
  'use strict';
  var map = null;

  function init() {
    if (map) return map;
    var layers = {
      'Satelit': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Citra: Esri World Imagery', maxZoom: 19
      }),
      'Topo': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Esri World Topo', maxZoom: 19
      }),
      'Peta': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap', maxZoom: 19
      })
    };
    map = L.map('map', { layers: [layers['Satelit']], zoomControl: true })
      .setView([-2.9, 104.7], 5);
    // overlay: nama daerah + batas wilayah (Esri), dan garis lintang/bujur
    var refLabels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Esri', maxZoom: 19
    });
    var grat = window.Graticule.make(map);
    L.control.layers(layers, {
      '🏷️ Nama daerah & batas': refLabels,
      '🌐 Garis lintang/bujur': grat
    }).addTo(map);
    refLabels.addTo(map);
    grat.addTo(map);
    // kompas arah (utara selalu ke atas di Leaflet)
    var Compass = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function () {
        var el = L.DomUtil.create('div', 'compass-ctl');
        el.title = 'Arah utara';
        el.innerHTML =
          '<svg viewBox="0 0 44 44" width="28" height="28" aria-hidden="true">' +
          '<circle cx="22" cy="22" r="19" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="1.5"/>' +
          '<text x="22" y="12.5" text-anchor="middle" font-size="8.5" font-weight="800" fill="#f87171" font-family="Inter,system-ui">N</text>' +
          '<text x="34.5" y="25" text-anchor="middle" font-size="7" fill="#93a1b0" font-family="Inter,system-ui">E</text>' +
          '<text x="22" y="37.5" text-anchor="middle" font-size="7" fill="#93a1b0" font-family="Inter,system-ui">S</text>' +
          '<text x="9.5" y="25" text-anchor="middle" font-size="7" fill="#93a1b0" font-family="Inter,system-ui">W</text>' +
          '<polygon points="22,15 25.5,24 22,22.4 18.5,24" fill="#f87171"/>' +
          '<polygon points="22,31 25.5,24 22,25.6 18.5,24" fill="#cbd5e1"/>' +
          '<circle cx="22" cy="24" r="2.4" fill="#0b1220" stroke="#e9f0f4" stroke-width="1.2"/>' +
          '</svg>';
        L.DomEvent.disableClickPropagation(el);
        return el;
      }
    });
    map.addControl(new Compass());
    L.control.scale({ imperial: false }).addTo(map);
    initSearch(map);
    initLocate(map);
    setTimeout(function () { map.invalidateSize(); }, 120);
    return map;
  }

  // ---- toast kecil untuk pesan singkat ----
  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById('sk-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'sk-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  // ---- tombol "Lokasi saya": 1 tap ke posisi GPS ----
  var gpsLayer = null, gpsRegId = null;
  function initLocate(map) {
    var Locate = L.Control.extend({
      options: { position: 'bottomright' },
      onAdd: function () {
        var el = L.DomUtil.create('div', 'locate-ctl glass');
        el.title = 'Ke lokasi saya';
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        el.setAttribute('aria-label', 'Ke lokasi saya');
        el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/></svg>';
        function go() { locateMe(map); }
        L.DomEvent.on(el, 'click', function (e) { L.DomEvent.stopPropagation(e); go(); });
        L.DomEvent.on(el, 'keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
        });
        L.DomEvent.disableClickPropagation(el);
        L.DomEvent.disableScrollPropagation(el);
        return el;
      }
    });
    map.addControl(new Locate());
  }
  function locateMe(map) {
    if (!navigator.geolocation) { toast('Perangkat tidak mendukung GPS'); return; }
    toast('Mencari lokasi…');
    navigator.geolocation.getCurrentPosition(function (pos) {
      var ll = [pos.coords.latitude, pos.coords.longitude];
      if (gpsRegId && window.LayerManager) LayerManager.unregister(gpsRegId);
      if (gpsLayer) map.removeLayer(gpsLayer);
      gpsLayer = L.layerGroup([
        L.circle(ll, {
          radius: pos.coords.accuracy || 30, color: '#3b82f6', weight: 1.5,
          opacity: 0.6, fillColor: '#3b82f6', fillOpacity: 0.12, interactive: false
        }),
        L.marker(ll, {
          icon: L.divIcon({ className: 'gps-wrap', html: '<div class="gps-dot"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
          interactive: false, keyboard: false
        })
      ]).addTo(map);
      if (window.LayerManager) gpsRegId = LayerManager.register('Lokasi saya', gpsLayer);
      map.flyTo(ll, Math.max(map.getZoom(), 15), { duration: 1.2 });
    }, function (err) {
      toast(err.code === 1
        ? 'Izin lokasi ditolak. Aktifkan GPS & izin lokasi dulu.'
        : 'Lokasinya nggak kedapetan. Coba lagi.');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---- pencarian daerah (Nominatim OSM, gratis, khusus Indonesia) — UI di dalam toolbar ----
  function initSearch(map) {
    var wrap = document.getElementById('tool-search');
    var toggle = document.getElementById('sk-search-toggle');
    var input = document.getElementById('sk-search');
    var resBox = document.getElementById('sk-search-res');
    if (!wrap || !input) return;
    var markLayer = L.layerGroup().addTo(map);
    if (window.LayerManager) LayerManager.register('Penanda pencarian', markLayer);
    var timer = null;

    function shortName(dn) { return String(dn).split(',')[0].trim(); }

    // "Go to XY" ala ArcGIS: ketik koordinat desimal ("-6.2, 106.8") atau UTM ("48S 702305 9317059")
    function parseCoord(q) {
      var s = String(q || '').trim();
      var m = s.match(/^(-?\d+(?:[.,]\d+)?)\s*[,;]\s*(-?\d+(?:[.,]\d+)?)$/) ||
              s.match(/^(-?\d+(?:[.,]\d+)?)\s+(-?\d+(?:[.,]\d+)?)$/);
      if (m) {
        var lat = parseFloat(m[1].replace(',', '.')), lon = parseFloat(m[2].replace(',', '.'));
        if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180)
          return { lat: lat, lon: lon, label: lat.toFixed(5) + ', ' + lon.toFixed(5) };
      }
      m = s.match(/^(\d{1,2})\s*([NSns])\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)$/);
      if (m && typeof proj4 === 'function') {
        var zone = parseInt(m[1], 10), south = /s/i.test(m[2]);
        var e = parseFloat(m[3].replace(',', '.')), n = parseFloat(m[4].replace(',', '.'));
        if (zone >= 1 && zone <= 60 && e >= 0 && e <= 1000000 && n >= 0 && n <= 10000000) {
          try {
            var def = '+proj=utm +zone=' + zone + (south ? ' +south' : '') + ' +datum=WGS84 +units=m +no_defs';
            var p = proj4(def, 'WGS84', [e, n]);
            if (p && Math.abs(p[1]) <= 90 && Math.abs(p[0]) <= 180)
              return { lat: p[1], lon: p[0], label: 'UTM ' + zone + m[2].toUpperCase() + ' ' + m[3] + ' ' + m[4] };
          } catch (err) {}
        }
      }
      return null;
    }
    function goToCoord(lat, lon, label) {
      markLayer.clearLayers();
      L.marker([lat, lon]).addTo(markLayer)
        .bindTooltip(esc(label), { permanent: true, direction: 'top', offset: [0, -12], className: 'place-tip' });
      map.flyTo([lat, lon], Math.max(map.getZoom(), 15), { duration: 1.2 });
      resBox.style.display = 'none';
      wrap.classList.remove('open');
      input.blur();
      toast('Koordinat: ' + label);
    }

    function doSearch(q) {
      var c = parseCoord(q);
      if (c) {
        resBox.innerHTML = '<div class="s-item" data-coord="1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:13px;height:13px;vertical-align:-2px;margin-right:5px;color:var(--acc)"><circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/></svg><b>' + esc(c.label) + '</b><span>Ketuk buat ke sana</span></div>';
        resBox.style.display = 'block';
        resBox.querySelector('[data-coord]').onclick = function () { goToCoord(c.lat, c.lon, c.label); };
        return;
      }
      if (q.length < 3) { resBox.style.display = 'none'; resBox.innerHTML = ''; return; }
      resBox.innerHTML = '<div class="s-item s-loading">Mencari…</div>';
      resBox.style.display = 'block';
      fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=id&limit=6&accept-language=id&q=' + encodeURIComponent(q))
        .then(function (r) { return r.json(); })
        .then(function (arr) {
          if (!arr || !arr.length) {
            resBox.innerHTML = '<div class="s-item s-loading">Tidak ketemu. Coba kata kunci lain.</div>';
            return;
          }
          resBox.innerHTML = arr.map(function (p, i) {
            var rest = String(p.display_name).split(',').slice(1, 3).join(',').trim();
            return '<div class="s-item" data-i="' + i + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:13px;height:13px;vertical-align:-2px;margin-right:5px;color:var(--acc)"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg><b>' + esc(shortName(p.display_name)) + '</b>' +
              (rest ? '<span>' + esc(rest) + '</span>' : '') + '</div>';
          }).join('');
          Array.prototype.forEach.call(resBox.querySelectorAll('.s-item'), function (node) {
            node.onclick = function () {
              var p = arr[+node.getAttribute('data-i')];
              var lat = parseFloat(p.lat), lon = parseFloat(p.lon);
              markLayer.clearLayers();
              L.marker([lat, lon]).addTo(markLayer)
                .bindTooltip(esc(shortName(p.display_name)), { permanent: true, direction: 'top', offset: [0, -12], className: 'place-tip' });
              var z = p.addresstype === 'county' || p.addresstype === 'state' ? 10 : 13;
              map.flyTo([lat, lon], Math.max(map.getZoom(), z), { duration: 1.2 });
              resBox.style.display = 'none';
              wrap.classList.remove('open');
              input.blur();
            };
          });
        })
        .catch(function () {
          resBox.innerHTML = '<div class="s-item s-loading">Pencariannya gagal. Coba lagi.</div>';
        });
    }

    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { doSearch(input.value.trim()); }, 450);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { clearTimeout(timer); doSearch(input.value.trim()); }
      if (e.key === 'Escape') { resBox.style.display = 'none'; wrap.classList.remove('open'); input.blur(); }
    });
    input.addEventListener('focus', function () {
      if (resBox.innerHTML) resBox.style.display = 'block';
    });
    // di layar kecil: ikon kaca pembesar membuka/menutup kolom cari
    toggle.addEventListener('click', function () {
      if (window.matchMedia('(max-width: 760px)').matches) {
        wrap.classList.toggle('open');
        if (wrap.classList.contains('open')) input.focus();
        else { resBox.style.display = 'none'; input.blur(); }
      } else {
        input.focus();
      }
    });
    // klik di luar menutup hasil (mode mobile)
    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) { resBox.style.display = 'none'; wrap.classList.remove('open'); }
    });
  }

  window.GMap = {
    init: init,
    getMap: function () { return map; },
    toast: toast
  };
})();
