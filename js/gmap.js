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
    setTimeout(function () { map.invalidateSize(); }, 120);
    return map;
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
    var timer = null;

    function shortName(dn) { return String(dn).split(',')[0].trim(); }

    function doSearch(q) {
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
            return '<div class="s-item" data-i="' + i + '">📍 <b>' + esc(shortName(p.display_name)) + '</b>' +
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
          resBox.innerHTML = '<div class="s-item s-loading">Gagal mencari. Coba lagi.</div>';
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
    getMap: function () { return map; }
  };
})();
