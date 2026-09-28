# 📐 SurveyKit

Toolkit web gratis untuk **surveyor, engineering, dan pemilik lahan**: konversi koordinat, profil ketinggian, peta kontur otomatis, dan pengukuran lahan + estimasi cut & fill — langsung di browser, tanpa install.

## 🧰 Fitur

| Tab | Fungsi |
|-----|--------|
| 📍 Konverter Koordinat | LatLon (desimal/DMS) ↔ UTM zona otomatis (48–54), batch CSV, export KML |
| ⛰️ Profil Ketinggian | Gambar garis di peta → grafik elevasi, kemiringan, export CSV/KML |
| 🗺️ Kontur Otomatis | Gambar kotak → garis kontur dari DEM (interval 1–25 m), export GeoJSON/KML |
| 📐 Ukur Lahan & Cut-Fill | Gambar polygon di citra satelit → luas (ha/m²), keliling, statistik DEM, estimasi volume galian/timbunan |

## 📦 Teknologi

- **Peta**: Leaflet + leaflet-draw (gambar garis/kotak/polygon)
- **Basemap**: Esri World Imagery (satelit), Esri World Topo, OpenStreetMap
- **DEM**: AWS Terrain Tiles / SRTM (Terrarium encoding, gratis tanpa API key)
- **Kontur**: d3-contour (marching squares)
- **Koordinat**: proj4js (UTM 48–54 N/S)
- 100% client-side — tanpa backend, tanpa API key

## 🚀 Deploy

Situs statis. Push ke `main` → auto-deploy via Vercel (hubungkan repo di dashboard Vercel).

## ⚠️ Catatan akurasi

Data DEM satelit beresolusi ±30 m — hasil bersifat **estimasi untuk survei awal**. Untuk keperluan legal/teknis final (RAB, sertifikat, IMB), verifikasi dengan pengukuran lapangan & surveyor berlisensi.
