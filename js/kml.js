/* kml.js — pembuat file KML + helper download */
(function (root, factory) {
  var K = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = K;
  else root.Kml = K;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }
  function coordPair(c) { return c[0] + ',' + c[1] + ',0'; }

  // placemarks: [{kind:'point'|'line'|'polygon', name, desc, coords}]
  //   point: coords = [lon,lat] | line/polygon: coords = [[lon,lat],...]
  function build(name, placemarks) {
    var s = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n' +
      '<name>' + esc(name) + '</name>\n';
    placemarks.forEach(function (p) {
      s += '<Placemark>\n<name>' + esc(p.name || '') + '</name>\n';
      if (p.desc) s += '<description>' + esc(p.desc) + '</description>\n';
      if (p.kind === 'point') {
        s += '<Point><coordinates>' + coordPair(p.coords) + '</coordinates></Point>\n';
      } else if (p.kind === 'line') {
        s += '<LineString><tessellate>1</tessellate><coordinates>' +
          p.coords.map(coordPair).join(' ') + '</coordinates></LineString>\n';
      } else if (p.kind === 'polygon') {
        var ring = p.coords.slice();
        var f = ring[0], l = ring[ring.length - 1];
        if (f[0] !== l[0] || f[1] !== l[1]) ring.push([f[0], f[1]]);
        s += '<Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>' +
          ring.map(coordPair).join(' ') + '</coordinates></LinearRing></outerBoundaryIs></Polygon>\n';
      }
      s += '</Placemark>\n';
    });
    return s + '</Document>\n</kml>';
  }

  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  return { esc: esc, build: build, download: download };
});
