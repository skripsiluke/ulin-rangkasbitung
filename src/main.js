import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';

// Pusat area: Alun-Alun Rangkasbitung. Satuan dunia = meter.
const CENTER = { lat: -6.36026, lon: 106.24616 };
const METERS_PER_DEG_LAT = 110540;
const METERS_PER_DEG_LON = 111320 * Math.cos(CENTER.lat * Math.PI / 180);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bc5d3);
scene.fog = new THREE.Fog(0x9bc5d3, 900, 2400);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 5000);
camera.position.set(650, 620, 760);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.querySelector('#app').appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 80;
controls.maxDistance = 1800;

scene.add(new THREE.HemisphereLight(0xe5f5ff, 0x64734f, 2.0));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
sun.position.set(-450, 800, 350);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -700;
sun.shadow.camera.right = 700;
sun.shadow.camera.top = 700;
sun.shadow.camera.bottom = -700;
scene.add(sun);

// Area dasar 1 km x 1 km
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(1000, 1000),
  new THREE.MeshStandardMaterial({ color: 0x78966a, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1;
ground.receiveShadow = true;
scene.add(ground);

// Garis batas area
const borderPoints = [
  new THREE.Vector3(-500, 0.2, -500), new THREE.Vector3(500, 0.2, -500),
  new THREE.Vector3(500, 0.2, 500), new THREE.Vector3(-500, 0.2, 500),
  new THREE.Vector3(-500, 0.2, -500)
];
const border = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints(borderPoints),
  new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 })
);
scene.add(border);

function toWorld(lon, lat) {
  const x = (lon - CENTER.lon) * METERS_PER_DEG_LON;
  const z = -(lat - CENTER.lat) * METERS_PER_DEG_LAT;
  return { x, z };
}

function getHeight(properties = {}) {
  const explicit = Number.parseFloat(properties.height);
  if (Number.isFinite(explicit) && explicit > 0) return Math.min(explicit, 100);
  const levels = Number.parseFloat(properties['building:levels']);
  if (Number.isFinite(levels) && levels > 0) return Math.min(levels * 3.2, 80);
  const type = String(properties.building || '').toLowerCase();
  if (['apartments', 'commercial', 'office', 'retail'].includes(type)) return 12;
  return 5 + ((String(properties['@id'] || '').length % 4) * 1.3);
}

function polygonToBuilding(rings, props) {
  if (!rings || !rings[0] || rings[0].length < 4) return null;
  const outer = rings[0].map(([lon, lat]) => {
    const p = toWorld(lon, lat);
    return new THREE.Vector2(p.x, -p.z);
  });
  const shape = new THREE.Shape();
  shape.moveTo(outer[0].x, outer[0].y);
  for (let i = 1; i < outer.length; i++) shape.lineTo(outer[i].x, outer[i].y);
  shape.closePath();

  // Lubang pada polygon (misalnya halaman dalam) dibuat sebagai holes.
  for (const ring of rings.slice(1)) {
    if (ring.length < 4) continue;
    const hole = new THREE.Path();
    const first = toWorld(ring[0][0], ring[0][1]);
    hole.moveTo(first.x, -first.z);
    for (let i = 1; i < ring.length; i++) {
      const p = toWorld(ring[i][0], ring[i][1]);
      hole.lineTo(p.x, -p.z);
    }
    hole.closePath();
    shape.holes.push(hole);
  }

  const height = getHeight(props);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 1 });
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: props.name ? 0xd8c8aa : 0xc8b99f,
    roughness: 0.92
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 0.15;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.name = props.name || 'Bangunan';
  return mesh;
}

function addRoad(coords, props = {}) {
  if (!coords || coords.length < 2) return null;
  const points = coords.map(([lon, lat]) => {
    const p = toWorld(lon, lat);
    return new THREE.Vector3(p.x, 0.65, p.z);
  });
  const highway = String(props.highway || 'road');
  const widths = {
    motorway: 8, trunk: 7, primary: 6.5, secondary: 5.5,
    tertiary: 4.5, residential: 3.2, unclassified: 3,
    service: 2.2, footway: 1.1, path: 1, track: 2
  };
  const radius = (widths[highway] || 2.6) / 2;
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const geometry = new THREE.TubeGeometry(curve, Math.max(8, points.length * 3), radius, 5, false);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x59636b, roughness: 1 }));
  mesh.receiveShadow = true;
  mesh.userData.name = props.name || `Jalan ${highway}`;
  return mesh;
}

function addWaterPolygon(rings) {
  if (!rings || !rings[0] || rings[0].length < 4) return null;
  const pts = rings[0].map(([lon, lat]) => {
    const p = toWorld(lon, lat);
    return new THREE.Vector2(p.x, -p.z);
  });
  const shape = new THREE.Shape();
  shape.moveTo(pts[0].x, pts[0].y);
  pts.slice(1).forEach(p => shape.lineTo(p.x, p.y));
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: 0x3c9bc5, roughness: 0.35, side: THREE.DoubleSide
  }));
  mesh.position.y = 0.12;
  return mesh;
}

function addGreenPolygon(rings) {
  if (!rings || !rings[0] || rings[0].length < 4) return null;
  const pts = rings[0].map(([lon, lat]) => {
    const p = toWorld(lon, lat);
    return new THREE.Vector2(p.x, -p.z);
  });
  const shape = new THREE.Shape();
  shape.moveTo(pts[0].x, pts[0].y);
  pts.slice(1).forEach(p => shape.lineTo(p.x, p.y));
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: 0x6caa72, side: THREE.DoubleSide, roughness: 1
  }));
  mesh.position.y = 0.08;
  return mesh;
}

function processFeature(feature, counts) {
  const g = feature.geometry;
  const p = feature.properties || {};
  if (!g) return;

  if (g.type === 'LineString') {
    if (p.highway) {
      const road = addRoad(g.coordinates, p);
      if (road) { scene.add(road); counts.roads++; }
    }
    return;
  }

  if (g.type === 'MultiLineString') {
    if (p.highway) g.coordinates.forEach(line => {
      const road = addRoad(line, p);
      if (road) { scene.add(road); counts.roads++; }
    });
    return;
  }

  if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
    const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const rings of polygons) {
      if (p.building) {
        const b = polygonToBuilding(rings, p);
        if (b) { scene.add(b); counts.buildings++; }
      } else if (p.natural === 'water' || p.water || p.landuse === 'reservoir') {
        const w = addWaterPolygon(rings);
        if (w) { scene.add(w); counts.water++; }
      } else if (p.leisure === 'park' || p.leisure === 'garden' ||
                 ['forest', 'grass', 'meadow', 'farmland', 'orchard'].includes(p.landuse)) {
        const gr = addGreenPolygon(rings);
        if (gr) { scene.add(gr); counts.green++; }
      }
    }
  }
}

async function loadMap() {
  const response = await fetch(
  `${import.meta.env.BASE_URL}data/rangkasbitung.geojson`
);
  if (!response.ok) throw new Error('File GeoJSON tidak ditemukan di folder data.');
  const geojson = await response.json();
  const counts = { roads: 0, buildings: 0, water: 0, green: 0 };
  geojson.features.forEach(feature => processFeature(feature, counts));

  // Penanda pusat area/alun-alun (titik referensi, bukan model alun-alun detail).
  const marker = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 3, 2, 20),
    new THREE.MeshStandardMaterial({ color: 0xffd34e })
  );
  marker.position.set(0, 1.5, 0);
  marker.castShadow = true;
  scene.add(marker);

  document.querySelector('#stats').textContent =
    `${counts.roads} segmen jalan • ${counts.buildings} bangunan • ${counts.water} area air • ${counts.green} area hijau`;
  document.querySelector('#loading').classList.add('done');
}

loadMap().catch(error => {
  console.error(error);
  document.querySelector('#loading').textContent = `Gagal memuat peta: ${error.message}`;
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
