/* graticule.js — garis lintang/bujur + label ala Indonesia (LS/LU/BT/BB) */
(function () {
  'use strict';

  function fmtNum(a) {
    var r = Math.round(a * 100) / 100;
    return (r % 1 === 0) ? String(r) : String(r);
  }
  function fmtLat(lat) {
    var t = fmtNum(Math.abs(lat)) + '°';
    if (lat < 0) t += 'LS'; else if (lat > 0) t += 'LU';
    return t;
  }
  function fmtLon(lon) {
    var t = fmtNum(Math.abs(lon)) + '°';
    if (lon < 0) t += 'BB'; else if (lon > 0) t += 'BT';
    return t;
  }

  var INTERVALS = [30, 20, 10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002];

  function make(map) {
    var group = L.layerGroup();

    function redraw() {
      if (!map.hasLayer(group)) return;
      group.clearLayers();
      var b = map.getBounds();
      if (!b) return;
      // interval: target jarak antar garis ~100px
      var p1 = map.containerPointToLatLng([0, 0]);
      var p2 = map.containerPointToLatLng([100, 0]);
      var deg = Math.abs(p2.lng - p1.lng) || 1;
      var iv = INTERVALS[0];
      for (var i = 0; i < INTERVALS.length; i++) {
        if (INTERVALS[i] <= deg) { iv = INTERVALS[i]; break; }
        iv = INTERVALS[i];
      }
      var south = b.getSouth(), north = b.getNorth(), west = b.getWest(), east = b.getEast();
      var lat, lon;

      for (lat = Math.ceil(south / iv) * iv; lat <= north + 1e-9; lat += iv) {
        lat = Math.round(lat * 1e6) / 1e6;
        group.addLayer(L.polyline([[lat, west - iv], [lat, east + iv]], {
          color: '#ffffff', weight: 1, opacity: 0.35, interactive: false
        }));
        group.addLayer(L.marker([lat, west], {
          icon: L.divIcon({ className: 'grat-label', html: fmtLat(lat) }),
          interactive: false, keyboard: false
        }));
      }
      for (lon = Math.ceil(west / iv) * iv; lon <= east + 1e-9; lon += iv) {
        lon = Math.round(lon * 1e6) / 1e6;
        group.addLayer(L.polyline([[south - iv, lon], [north + iv, lon]], {
          color: '#ffffff', weight: 1, opacity: 0.35, interactive: false
        }));
        group.addLayer(L.marker([north, lon], {
          icon: L.divIcon({ className: 'grat-label', html: fmtLon(lon) }),
          interactive: false, keyboard: false
        }));
      }
    }

    map.on('moveend zoomend', redraw);
    // gambar perdana saat layer ditambahkan
    var origOnAdd = group.onAdd;
    group.onAdd = function (m) { origOnAdd.call(this, m); setTimeout(redraw, 30); };
    group.redraw = redraw;
    return group;
  }

  window.Graticule = { make: make };
})();
