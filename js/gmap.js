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
    L.control.scale({ imperial: false }).addTo(map);
    setTimeout(function () { map.invalidateSize(); }, 120);
    return map;
  }

  window.GMap = {
    init: init,
    getMap: function () { return map; }
  };
})();
