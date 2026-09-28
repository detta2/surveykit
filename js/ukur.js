/* ukur.js — Ukur gabungan: ketuk titik-titik DI PETA.
   2 titik + Selesai = jarak + profil tanah · 3+ titik + Selesai = luas lahan + DEM + cut/fill.
   Mesin profil (ToolProfile) & luas (ToolMeasure) dipakai ulang, tanpa Leaflet.Draw. */
(function () {
  'use strict';
  var G = window.Geo;
  var map = null, inited = false, active = false;
  var pts = [];      // [L.LatLng]
  var layer = null;  // titik + garis sementara

  function el(id) { return document.getElementById(id); }
  function toast(m) { if (window.GMap) GMap.toast(m); }

  function init(m) {
    if (inited) return; inited = true;
    map = m;
    layer = L.layerGroup().addTo(map);
    if (window.LayerManager) LayerManager.register('Ukur', layer);
    el('uk-finish').onclick = finish;
    el('uk-undo').onclick = undo;
    el('uk-clear').onclick = function () { clearAll(); };
  }

  function liveDist() {
    var d = 0;
    for (var i = 1; i < pts.length; i++) d += G.haversine(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng);
    return d;
  }

  function redraw() {
    layer.clearLayers();
    pts.forEach(function (p) {
      layer.addLayer(L.circleMarker(p, { radius: 6, color: '#ffffff', weight: 2, fillColor: '#34d399', fillOpacity: 1 }));
    });
    if (pts.length >= 2) layer.addLayer(L.polyline(pts, { color: '#34d399', weight: 3.5, dashArray: '9 6' }));
  }

  function setStatus(html) { el('uk-status').innerHTML = html; }

  function hideResults() {
    el('uk-profile').style.display = 'none';
    el('uk-area').style.display = 'none';
    el('uk-result').innerHTML = '';
  }

  function activate() {
    active = true;
    map.getContainer().style.cursor = 'crosshair';
    if (!pts.length) setStatus('<p class="hint">Ketuk titik pertama di peta…</p>');
    if (window.AppHint) AppHint('Ketuk titik-titik di peta — 2 titik jadi <b>jarak</b>, 3+ titik jadi <b>luas</b>.');
  }

  function deactivate() {
    active = false;
    map.getContainer().style.cursor = '';
    if (window.AppHint) AppHint(null);
  }

  // return true kalau klik dikonsumsi
  function handleClick(latlng) {
    if (!active) return false;
    hideResults();
    pts.push(latlng);
    redraw();
    if (pts.length === 1) {
      setStatus('<p class="hint">Titik 1 oke. Ketuk titik ke-2 buat jarak, atau tambah lagi buat luas lahan.</p>');
    } else {
      setStatus('<p class="hint">' + pts.length + ' titik · ' + G.fmtDist(liveDist()) +
        ' — ketuk <b>✓ Selesai</b> kalau udah, atau tambah titik lagi.</p>');
    }
    return true;
  }

  // dipanggil dari kartu koordinat ("Ukur dari titik ini")
  function seed(latlng) {
    clearAll(true);
    pts.push(latlng);
    redraw();
    setStatus('<p class="hint">Titik 1 oke (dari peta). Ketuk titik berikutnya…</p>');
  }

  function undo() {
    if (!pts.length) return;
    pts.pop();
    redraw();
    hideResults();
    setStatus(pts.length
      ? '<p class="hint">' + pts.length + ' titik · ' + G.fmtDist(liveDist()) + '</p>'
      : '<p class="hint">Ketuk titik pertama di peta…</p>');
  }

  function clearAll(silent) {
    pts = [];
    layer.clearLayers();
    hideResults();
    if (window.ToolMeasure) ToolMeasure.clear();
    if (window.ToolProfile) ToolProfile.reset();
    if (!silent) setStatus('<p class="hint">Ketuk titik pertama di peta…</p>');
  }

  function finish() {
    if (pts.length < 2) { toast('Ketuk minimal 2 titik dulu'); return; }
    hideResults();
    if (pts.length === 2) {
      el('uk-result').innerHTML = '<div class="res-grid"><div class="res"><span>Jarak</span><b>' +
        G.fmtDist(liveDist()) + '</b></div></div>';
      el('uk-profile').style.display = '';
      if (window.ToolProfile) ToolProfile.analyzePair([pts[0], pts[1]]);
    } else {
      var ll = pts.map(function (p) { return [p.lng, p.lat]; });
      el('uk-area').style.display = '';
      if (window.ToolMeasure) ToolMeasure.showPolygon(ll);
    }
    if (window.AppSheet) AppSheet.open(); // pastikan hasilnya kelihatan
  }

  window.ToolUkur = {
    init: init, activate: activate, deactivate: deactivate,
    handleClick: handleClick, seed: seed, clear: clearAll
  };
})();
