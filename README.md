# Ulin - Rangkasbitung — prototipe 3D

Proyek awal Three.js + Vite untuk menampilkan data OpenStreetMap di area sekitar Alun-Alun Rangkasbitung.

## Persiapan
1. Instal Node.js versi LTS dari https://nodejs.org/
2. Ekstrak ZIP ini.
3. Buka folder `Ulin-Rangkasbitung` di VS Code.
4. Buka Terminal > New Terminal.
5. Jalankan:

```bash
npm install
npm run dev
```

6. Buka alamat lokal yang muncul di terminal (biasanya http://localhost:5173).

## Kontrol
- Klik kiri + geser: putar kamera.
- Scroll: zoom.
- Klik kanan + geser: geser kamera.

## Isi prototipe
- Jalan: ditampilkan sebagai jalur 3D sederhana.
- Bangunan: footprint GeoJSON diekstrusi menjadi bentuk 3D sederhana.
- Air dan area hijau: ditampilkan jika tag tersedia di data sumber.
- Tanah: bidang datar 1 km x 1 km.

## Catatan akurasi
Ini masih prototipe visual. Elevasi DEM belum diterapkan sehingga tanah masih datar. Tinggi bangunan sebagian merupakan perkiraan apabila data `height` atau `building:levels` tidak tersedia. Geometri bangunan yang kompleks dapat membutuhkan penanganan tambahan.

Data OpenStreetMap © OpenStreetMap contributors, tersedia di bawah Open Database License (ODbL). Atribusi: https://www.openstreetmap.org/copyright
