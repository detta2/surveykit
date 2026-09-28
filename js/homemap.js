/* homemap.js — Tab "Peta": peta satelit full sebagai tampilan awal (ala Google Earth) */
(function () {
  'use strict';
  var map = null, inited = false, readout = null;

  function utmZone(lon) { return Math.floor((lon + 180) / 6) + 1; }
  function latLonToUtm(lat, lon) {
    var zone = utmZone(lon), south = lat < 0;
    var def = '+proj=utm +zone=' + zone + (south ? ' +south' : '') + ' +datum=WGS84 +units=m +no_defs';
    var p = proj4('WGS84', def, [lon, lat]);
    return { e: p[0], n: p[1], zone: zone, hemi: south ? 'S' : 'N' };
  }
  function fmt(n, d) {
    return Number(n).toLocaleString('id-ID', { maximumFractionDigits: d == null ? 5 : d });
  }

  function init() {
    if (inited) { refresh(); return; }
    inited = true;

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

    map = L.map('map-home', { layers: [layers['Satelit']], zoomControl: true })
      .setView([-2.9, 104.7], 5);
    L.control.layers(layers).addTo(map);
    L.control.scale({ imperial: false }).addTo(map);

    readout = document.getElementById('home-coords');
    map.on('mousemove', function (e) {
      readout.innerHTML = 'Lat <b>' + fmt(e.latlng.lat) + '</b> &nbsp; Lon <b>' + fmt(e.latlng.lng) + '</b>';
    });

    map.on('click', function (e) {
      var u = latLonToUtm(e.latlng.lat, e.latlng.lng);
      L.popup()
        .setLatLng(e.latlng)
        .setContent(
          '<b>LatLon:</b> ' + fmt(e.latlng.lat) + ', ' + fmt(e.latlng.lng) +
          '<br><b>UTM:</b> ' + fmt(u.e, 1) + ' E, ' + fmt(u.n, 1) + ' N' +
          '<br><span style="color:#6b7280;font-size:12px">Zona ' + u.zone + u.hemi + '</span>'
        )
        .openOn(map);
    });
  }

  function refresh() {
    if (map) setTimeout(function () { map.invalidateSize(); }, 60);
  }

  window.ToolHome = { init: init, refresh: refresh };
})();
