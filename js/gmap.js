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
    setTimeout(function () { map.invalidateSize(); }, 120);
    return map;
  }

  window.GMap = {
    init: init,
    getMap: function () { return map; }
  };
})();
