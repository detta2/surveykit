/* geo.js — matematika GIS murni + pengambilan data ketinggian (DEM)
 * Sumber DEM: AWS Terrain Tiles (Terrarium encoding), gratis tanpa API key.
 * File ini bisa di-load di browser (window.Geo) maupun diuji di Node.
 */
(function (root, factory) {
  var Geo = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = Geo;
  else root.Geo = Geo;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TILE = 256;
  var TERRA_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
  var R_EARTH = 6378137;

  /* ---------- Web Mercator tile math ---------- */

  function lonToTileX(lon, z) {
    return Math.floor((lon + 180) / 360 * Math.pow(2, z));
  }
  function latToTileY(lat, z) {
    var r = clampLat(lat) * Math.PI / 180;
    return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z));
  }
  function tileXToLon(x, z) { return x / Math.pow(2, z) * 360 - 180; }
  function tileYToLat(y, z) {
    var n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }
  function clampLat(lat) { return Math.max(-85.05112878, Math.min(85.05112878, lat)); }

  // resolusi meter per pixel pada latitude & zoom tertentu
  function metersPerPixel(lat, z) {
    return 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z);
  }
  // pilih zoom DEM berdasarkan panjang garis (meter)
  function chooseZoomForLength(lenM) {
    if (lenM < 5000) return 14;
    if (lenM < 30000) return 13;
    if (lenM < 150000) return 12;
    return 11;
  }
  // pilih zoom agar lebar grid (pixel) tidak melebihi maxPx
  function chooseZoomForBbox(bbox, maxPx) {
    maxPx = maxPx || 480;
    for (var z = 14; z >= 10; z--) {
      var wDeg = bbox.east - bbox.west;
      var px = wDeg / 360 * Math.pow(2, z) * TILE;
      if (px <= maxPx) return z;
    }
    return 10;
  }

  /* ---------- Terrarium decode ---------- */

  // satu pixel -> meter. Terrarium: elev = R*256 + G + B/256 - 32768
  function terrariumPixel(r, g, b) {
    return r * 256 + g + b / 256 - 32768;
  }
  function clampElev(v) {
    return v < -1000 ? -1000 : (v > 9000 ? 9000 : v);
  }
  function decodeImageData(imgData) {
    var d = imgData.data, n = imgData.width * imgData.height;
    var out = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      out[i] = clampElev(terrariumPixel(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]));
    }
    return out;
  }

  function loadTile(tx, ty, z) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        try {
          var c = document.createElement('canvas');
          c.width = c.height = TILE;
          var ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0);
          resolve(decodeImageData(ctx.getImageData(0, 0, TILE, TILE)));
        } catch (e) { reject(e); }
      };
      img.onerror = function () { reject(new Error('Gagal memuat tile elevasi z' + z)); };
      img.src = TERRA_URL.replace('{z}', z).replace('{x}', tx).replace('{y}', ty);
    });
  }

  // Ambil grid elevasi yang menutupi bbox. bbox: {west,south,east,north} (derajat)
  // return Promise<{data:Float32Array,w,h,west,north,east,south,z}>
  function fetchElevationGrid(bbox, z) {
    var x0 = lonToTileX(bbox.west, z), x1 = lonToTileX(bbox.east, z);
    var y0 = latToTileY(bbox.north, z), y1 = latToTileY(bbox.south, z);
    var nx = x1 - x0 + 1, ny = y1 - y0 + 1;
    if (nx * ny > 64) return Promise.reject(new Error('Area terlalu luas untuk analisis DEM. Perkecil area.'));
    var west = tileXToLon(x0, z), east = tileXToLon(x1 + 1, z);
    var north = tileYToLat(y0, z), south = tileYToLat(y1 + 1, z);
    var w = nx * TILE, h = ny * TILE;
    var grid = new Float32Array(w * h);
    var jobs = [];
    for (var ty = y0; ty <= y1; ty++) {
      for (var tx = x0; tx <= x1; tx++) {
        (function (tx, ty) {
          jobs.push(loadTile(tx, ty, z).then(function (tile) {
            var ox = (tx - x0) * TILE, oy = (ty - y0) * TILE;
            for (var r = 0; r < TILE; r++) {
              grid.set(tile.subarray(r * TILE, r * TILE + TILE), (oy + r) * w + ox);
            }
          }));
        })(tx, ty);
      }
    }
    return Promise.all(jobs).then(function () {
      return { data: grid, w: w, h: h, west: west, north: north, east: east, south: south, z: z };
    });
  }

  // interpolasi bilinear pada grid
  function sampleGrid(g, lon, lat) {
    var resX = (g.east - g.west) / g.w, resY = (g.north - g.south) / g.h;
    var px = (lon - g.west) / resX, py = (g.north - lat) / resY;
    var x0 = Math.floor(px), y0 = Math.floor(py);
    var x1 = Math.min(x0 + 1, g.w - 1), y1 = Math.min(y0 + 1, g.h - 1);
    x0 = Math.max(0, x0); y0 = Math.max(0, y0);
    var fx = px - x0, fy = py - y0;
    var d = g.data;
    var a = d[y0 * g.w + x0], b = d[y0 * g.w + x1];
    var c = d[y1 * g.w + x0], e = d[y1 * g.w + x1];
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + e * fx * fy;
  }

  /* ---------- Geodesi dasar ---------- */

  function toRad(d) { return d * Math.PI / 180; }

  function haversine(lat1, lon1, lat2, lon2) {
    var dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R_EARTH * Math.asin(Math.sqrt(a));
  }

  // luas polygon di atas bola bumi (Chamberlain-Duquette). coords: [[lon,lat],...]
  function ringArea(coords) {
    var area = 0, len = coords.length;
    if (len < 3) return 0;
    for (var i = 0; i < len; i++) {
      var p1 = coords[i], p2 = coords[(i + 1) % len];
      var x1 = toRad(p1[0]), y1 = toRad(p1[1]);
      var x2 = toRad(p2[0]), y2 = toRad(p2[1]);
      area += (x2 - x1) * (2 + Math.sin(y1) + Math.sin(y2));
    }
    return Math.abs(area * R_EARTH * R_EARTH / 2);
  }

  function polylineLength(latlngs) {
    var s = 0;
    for (var i = 1; i < latlngs.length; i++) {
      s += haversine(latlngs[i - 1].lat, latlngs[i - 1].lng, latlngs[i].lat, latlngs[i].lng);
    }
    return s;
  }

  // titik di dalam polygon? point:[lon,lat], poly:[[lon,lat],...]
  function pointInPolygon(point, poly) {
    var x = point[0], y = point[1], inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  // luas sel grid (m2) pada latitude tertentu. resXDeg/resYDeg: resolusi derajat/pixel
  function cellAreaM2(lat, resXDeg, resYDeg) {
    return resXDeg * 111320 * Math.cos(toRad(lat)) * resYDeg * 110540;
  }

  function fmtNum(n, digits) {
    return Number(n).toLocaleString('id-ID', { maximumFractionDigits: digits == null ? 2 : digits });
  }
  function fmtArea(m2) {
    if (m2 >= 10000) return fmtNum(m2 / 10000, 2) + ' ha';
    return fmtNum(m2, 1) + ' m²';
  }
  function fmtDist(m) {
    if (m >= 1000) return fmtNum(m / 1000, 2) + ' km';
    return fmtNum(m, 1) + ' m';
  }

  return {
    TILE: TILE,
    lonToTileX: lonToTileX, latToTileY: latToTileY,
    tileXToLon: tileXToLon, tileYToLat: tileYToLat,
    metersPerPixel: metersPerPixel,
    chooseZoomForLength: chooseZoomForLength,
    chooseZoomForBbox: chooseZoomForBbox,
    terrariumPixel: terrariumPixel,
    fetchElevationGrid: fetchElevationGrid,
    sampleGrid: sampleGrid,
    haversine: haversine,
    ringArea: ringArea,
    polylineLength: polylineLength,
    pointInPolygon: pointInPolygon,
    cellAreaM2: cellAreaM2,
    fmtNum: fmtNum, fmtArea: fmtArea, fmtDist: fmtDist
  };
});
