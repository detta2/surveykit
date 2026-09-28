/* quickmeasure.js — ukur jarak cepat 2 tap di mode Jelajah.
   Alur: ketuk peta → popup → "Ukur jarak dari titik ini" (titik A) → ketuk titik B → garis + label jarak.
   Ketuk "Ukur jarak…" lagi untuk mulai pengukuran baru. */
(function () {
  'use strict';
  var G = window.Geo; // ikut konvensi modul lain (measure.js, profile.js, ...)
  var map = null, armed = false, layer = null;

  function init(m) { map = m; }

  function clear() {
    armed = false;
    if (layer) { map.removeLayer(layer); layer = null; }
    if (map) map.getContainer().style.cursor = '';
  }

  // dipanggil dari tombol di popup Jelajah: jadikan titik ini sebagai titik A
  function arm(latlng) {
    if (!map) return;
    clear();
    armed = true;
    map.getContainer().style.cursor = 'crosshair';
    layer = L.layerGroup([
      L.circleMarker(latlng, { radius: 6, color: '#ffffff', weight: 2, fillColor: '#38bdf8', fillOpacity: 1 })
    ]).addTo(map);
    layer._aPt = latlng;
    if (window.GMap && window.GMap.toast) window.GMap.toast('Ketuk titik kedua untuk mengukur jarak');
  }

  function finish(bPt) {
    var aPt = layer._aPt;
    var d = G.haversine(aPt.lat, aPt.lng, bPt.lat, bPt.lng);
    // casing gelap di bawah garis terang: tetap kebaca di citra satelit
    layer.addLayer(L.polyline([aPt, bPt], { color: '#0b1220', weight: 7, opacity: 0.55, interactive: false }));
    var line = L.polyline([aPt, bPt], { color: '#38bdf8', weight: 3.5, dashArray: '9 6' });
    line.bindTooltip(G.fmtDist(d), { permanent: true, direction: 'center', className: 'qm-tip' });
    layer.addLayer(line);
    layer.addLayer(L.circleMarker(bPt, { radius: 6, color: '#ffffff', weight: 2, fillColor: '#38bdf8', fillOpacity: 1 }));
    armed = false;
    map.getContainer().style.cursor = '';
  }

  // return true kalau klik peta dikonsumsi (jangan tampilkan popup koordinat)
  function handleClick(latlng) {
    if (!map || !armed || !layer) return false;
    finish(latlng);
    return true;
  }

  window.QuickMeasure = {
    init: init,
    arm: arm,
    handleClick: handleClick,
    clear: clear,
    isArmed: function () { return armed; }
  };
})();
