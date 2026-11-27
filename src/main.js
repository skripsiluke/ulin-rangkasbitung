import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import '../style.css';

// Pusat area: Alun-Alun Rangkasbitung. Satuan dunia = meter.
const CENTER = { lat: -6.36026, lon: 106.24616 };
const METERS_PER_DEG_LAT = 110540;
const METERS_PER_DEG_LON = 111320 * Math.cos(CENTER.lat * Math.PI / 180);
const BASE_URL = import.meta.env.BASE_URL;
const HEIGHTMAP_URL = `${BASE_URL}data/ulin-rangkasbitung-heightmap.json`;
const GEOJSON_URL = `${BASE_URL}data/rangkasbitung.geojson`;
const VERTICAL_EXAGGERATION = 1.5;

let heightmap = null;
let minElevation = 0;

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
controls.target.set(0, 12, 0);
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

function toWorld(lon, lat) {
  const x = (lon - CENTER.lon) * METERS_PER_DEG_LON;
  const z = -(lat - CENTER.lat) * METERS_PER_DEG_LAT;
  return { x, z };
}

function terrainHeightAt(lon, lat) {
  if (!heightmap) return 0;
  const b = heightmap.bounds;
  const raster = heightmap.raster;
  const values = heightmap.elevation_m;

  const col = THREE.MathUtils.clamp(
    ((lon - b.west) / (b.east - b.west)) * (raster.width - 1),
    0, raster.width - 1
  );
  const row = THREE.MathUtils.clamp(
    ((b.north - lat) / (b.north - b.south)) * (raster.height - 1),
    0, raster.height - 1
  );

  const x0 = Math.floor(col), x1 = Math.min(x0 + 1, raster.width - 1);
  const y0 = Math.floor(row), y1 = Math.min(y0 + 1, raster.height - 1);
  const tx = col - x0, ty = row - y0;

  const samples = [
    values[y0]?.[x0], values[y0]?.[x1],
    values[y1]?.[x0], values[y1]?.[x1]
  ];
  const valid = samples.filter(v => Number.isFinite(v));
  if (!valid.length) return 0;

  const a = Number.isFinite(values[y0]?.[x0]) ? values[y0][x0] : valid[0];
  const b1 = Number.isFinite(values[y0]?.[x1]) ? values[y0][x1] : a;
  const c = Number.isFinite(values[y1]?.[x0]) ? values[y1][x0] : a;
  const d = Number.isFinite(values[y1]?.[x1]) ? values[y1][x1] : c;
  const elevation = THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(a, b1, tx),
    THREE.MathUtils.lerp(c, d, tx),
    ty
  );
  return Math.max(0, (elevation - minElevation) * VERTICAL_EXAGGERATION);
}


function createGrassTexture() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  let seed = 9137;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < size * size; i++) {
    const n = (random() - 0.5) * 26;
    const patch = random() > 0.985 ? 12 : 0;
    data[i * 4] = Math.max(0, Math.min(255, 105 + n + patch));
    data[i * 4 + 1] = Math.max(0, Math.min(255, 139 + n + patch));
    data[i * 4 + 2] = Math.max(0, Math.min(255, 83 + n));
    data[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(22, 22);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.needsUpdate = true;
  return texture;
}
const grassTexture = createGrassTexture();

async function loadTerrain() {
  const response = await fetch(HEIGHTMAP_URL);
  if (!response.ok) throw new Error(`Heightmap tidak ditemukan (${response.status})`);
  heightmap = await response.json();
  minElevation = Math.min(...heightmap.elevation_m.flat().filter(Number.isFinite));

  // Heightmap 33 x 32: 32 segmen X dan 31 segmen Z.
  const geometry = new THREE.PlaneGeometry(
    1000, 1000,
    heightmap.raster.width - 1,
    heightmap.raster.height - 1
  );
  const position = geometry.attributes.position;
  let index = 0;
  for (let row = 0; row < heightmap.raster.height; row++) {
    for (let col = 0; col < heightmap.raster.width; col++) {
      const elevation = heightmap.elevation_m[row][col];
      const y = Number.isFinite(elevation)
        ? Math.max(0, (elevation - minElevation) * VERTICAL_EXAGGERATION)
        : 0;
      // PlaneGeometry sebelum rotasi: z menjadi sumbu vertikal setelah rotasi X.
      position.setZ(index, y);
      index++;
    }
  }
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: grassTexture,
    roughness: 1,
    side: THREE.DoubleSide
  });
  const terrain = new THREE.Mesh(geometry, material);
  terrain.receiveShadow = true;
  terrain.name = 'Terrain SRTM Rangkasbitung';
  scene.add(terrain);

  // Batas area mengikuti tinggi terrain di tiap sudut.
  const corners = [
    [-500, -500, 106.24163, -6.35575],
    [500, -500, 106.25069, -6.35575],
    [500, 500, 106.25069, -6.36477],
    [-500, 500, 106.24163, -6.36477],
    [-500, -500, 106.24163, -6.35575]
  ];
  const borderPoints = corners.map(([x, z, lon, lat]) =>
    new THREE.Vector3(x, terrainHeightAt(lon, lat) + 0.5, z)
  );
  const border = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(borderPoints),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 })
  );
  scene.add(border);
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

function averageCoordinate(ring) {
  const sum = ring.reduce((acc, point) => {
    acc.lon += point[0];
    acc.lat += point[1];
    return acc;
  }, { lon: 0, lat: 0 });
  return { lon: sum.lon / ring.length, lat: sum.lat / ring.length };
}

function polygonToBuilding(rings, props) {
  if (!rings || !rings[0] || rings[0].length < 4) return null;
  const outerGeo = rings[0].map(([lon, lat]) => {
    const p = toWorld(lon, lat);
    return new THREE.Vector2(p.x, -p.z);
  });

  const shape = new THREE.Shape();
  shape.moveTo(outerGeo[0].x, outerGeo[0].y);
  for (let i = 1; i < outerGeo.length; i++) shape.lineTo(outerGeo[i].x, outerGeo[i].y);
  shape.closePath();

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
  const type = String(props.building || 'yes').toLowerCase();
  const palette = {
    house: [0xd9cbb3, 0xcdbda2, 0xe1d6c2, 0xc8b99f],
    residential: [0xd8c9b1, 0xc9b89d, 0xe1d6c4],
    commercial: [0xd0c5b1, 0xc2b9a8, 0xded4c2],
    retail: [0xd8c7ae, 0xc9b89f, 0xe0d3bd],
    industrial: [0xb9b8ae, 0xc4c2b8, 0xaead9f],
    apartments: [0xc9c6b9, 0xd5d0c2, 0xbeb9aa],
    office: [0xc2c8c5, 0xd0d5d1, 0xb5c1c0]
  };
  const colors = palette[type] || [0xd5c9b5, 0xc9bda9, 0xe0d5c3];
  const hash = String(props['@id'] || props.name || `${outerGeo[0].x}`).split('')
    .reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height, bevelEnabled: false, curveSegments: 1
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();

  const group = new THREE.Group();
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: colors[hash % colors.length],
    roughness: 0.88,
    metalness: 0.02
  });
  const roofPalette = {
    house: [0x8f5944, 0x9b6348, 0x766b5a],
    residential: [0x8f5944, 0x9b6348, 0x766b5a],
    commercial: [0x777b79, 0x8c8980, 0x6e7778],
    retail: [0x8b6651, 0x777b79, 0x9a8064],
    industrial: [0x777c7b, 0x8d8d83, 0x6e7473],
    apartments: [0x777b79, 0x8c8980, 0x6e7778],
    office: [0x667a7c, 0x7e8987, 0x596c70]
  };
  const roofColors = roofPalette[type] || [0x8a7863, 0x777b79, 0x9a8064];
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: roofColors[hash % roofColors.length],
    roughness: 0.94,
    metalness: 0.01
  });
  const body = new THREE.Mesh(geometry, [wallMaterial, roofMaterial]);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const center = averageCoordinate(rings[0]);
  group.position.y = terrainHeightAt(center.lon, center.lat) + 0.18;
  group.userData.name = props.name || `Bangunan ${type}`;

  const glass = new THREE.MeshStandardMaterial({
    color: 0x46616b, roughness: 0.28, metalness: 0.18,
    emissive: 0x14252a, emissiveIntensity: 0.12
  });
  const trim = new THREE.MeshStandardMaterial({ color: 0xe6dfcf, roughness: 0.8 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x594b3d, roughness: 0.85 });

  const perimeter = outerGeo.slice(0, -1);
  for (let i = 0; i < perimeter.length; i++) {
    const a = perimeter[i], b = perimeter[(i + 1) % perimeter.length];
    const dx = b.x - a.x, dz = b.y - a.y;
    const length = Math.hypot(dx, dz);
    if (length < 4.5) continue;
    const angle = -Math.atan2(dz, dx);
    const count = Math.min(4, Math.max(1, Math.floor(length / 5.2)));
    const windowWidth = Math.min(1.15, (length / count) * 0.34);
    const rows = Math.min(4, Math.max(1, Math.floor((height - 2.5) / 2.9)));

    for (let row = 0; row < rows; row++) {
      const y = 1.55 + row * 2.7;
      if (y + 1.05 > height - 0.4) continue;
      for (let col = 0; col < count; col++) {
        const t = (col + 0.5) / count;
        const x = THREE.MathUtils.lerp(a.x, b.x, t);
        // Shape Y is stored as -worldZ; negate it after the -90° X rotation.
        const z = THREE.MathUtils.lerp(a.y, b.y, t);

        const windowMesh = new THREE.Mesh(
          new THREE.BoxGeometry(windowWidth, 1.05, 0.075), glass
        );
        windowMesh.position.set(x, y, -z);
        windowMesh.rotation.y = angle;
        group.add(windowMesh);

        const sill = new THREE.Mesh(
          new THREE.BoxGeometry(windowWidth + 0.12, 0.09, 0.11), trim
        );
        sill.position.set(x, y - 0.58, -z);
        sill.rotation.y = angle;
        group.add(sill);
      }
    }
  }

  const longest = perimeter.reduce((best, a, i) => {
    const b = perimeter[(i + 1) % perimeter.length];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    return length > best.length ? { a, b, length } : best;
  }, { length: 0, a: perimeter[0], b: perimeter[1] });

  if (longest.length > 5) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.05, 2.15, 0.10), doorMat);
    door.position.set((longest.a.x + longest.b.x) / 2, 1.08, -(longest.a.y + longest.b.y) / 2);
    door.rotation.y = -Math.atan2(longest.b.y - longest.a.y, longest.b.x - longest.a.x);
    group.add(door);
  }

  if (height >= 7) {
    const roofUnit = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.9, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x9b9a91, roughness: 1 })
    );
    roofUnit.position.set(outerGeo[0].x, height + 0.48, -outerGeo[0].y);
    roofUnit.castShadow = true;
    group.add(roofUnit);
  }
  return group;
}

function makeRoadRibbon(points, width, yOffset, material, name) {
  if (points.length < 2) return null;

  const positions = [];
  const indices = [];
  const half = width / 2;

  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];

    let dx = next.x - prev.x;
    let dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;

    // Vektor normal ke sisi kiri/kanan jalan.
    const nx = -dz;
    const nz = dx;

    const leftX = points[i].x + nx * half;
    const leftZ = points[i].z + nz * half;
    const rightX = points[i].x - nx * half;
    const rightZ = points[i].z - nz * half;

    positions.push(
      leftX, points[i].y + yOffset, leftZ,
      rightX, points[i].y + yOffset, rightZ
    );

    if (i < points.length - 1) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.material.side = THREE.DoubleSide;
  mesh.receiveShadow = true;
  mesh.userData.name = name;
  return mesh;
}

function addRoadsideTree(x, z, groundY, seed = 1, scale = 1) {
  const group = new THREE.Group();
  const trunkHeight = 3.2 * scale;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18 * scale, 0.32 * scale, trunkHeight, 8),
    new THREE.MeshStandardMaterial({ color: 0x68452e, roughness: 1 })
  );
  trunk.position.y = groundY + trunkHeight / 2;
  trunk.castShadow = true;
  group.add(trunk);

  const greens = [0x286b42, 0x397b49, 0x4d8750, 0x347454, 0x5a8b4a];
  const foliageMaterial = new THREE.MeshStandardMaterial({
    color: greens[Math.abs(seed) % greens.length], roughness: 1
  });
  const canopy = [
    [0, 0, 0, 1.65], [-0.95, 0.1, 0.15, 1.05],
    [0.9, 0.05, -0.2, 1.12], [0.1, 0.65, 0.75, 0.98],
    [-0.15, 0.8, -0.75, 0.95]
  ];
  canopy.forEach(([ox, oy, oz, radius], index) => {
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(radius * scale, 1), foliageMaterial);
    crown.position.set(ox * scale, groundY + trunkHeight + (2.0 + oy) * scale, oz * scale);
    crown.scale.set(1.08, 0.92 + (index % 2) * 0.12, 1);
    crown.castShadow = true;
    group.add(crown);
  });
  group.position.set(x, 0, z);
  group.userData.name = 'Pohon tropis';
  scene.add(group);
  return group;
}

function addStreetLamp(x, z, groundY, rotation = 0) {
  const group = new THREE.Group();
  const poleMaterial = new THREE.MeshStandardMaterial({
    color: 0x454b4d, metalness: 0.55, roughness: 0.42
  });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.11, 5.8, 8), poleMaterial);
  pole.position.y = groundY + 2.9;
  pole.castShadow = true;
  group.add(pole);

  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.25, 7), poleMaterial);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(0.55, groundY + 5.65, 0);
  group.add(arm);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.65, 0.16, 0.28),
    new THREE.MeshStandardMaterial({
      color: 0xd8d4c4, emissive: 0xffe5a8, emissiveIntensity: 0.35, roughness: 0.45
    })
  );
  head.position.set(1.12, groundY + 5.58, 0);
  group.add(head);
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  group.userData.name = 'Lampu jalan';
  scene.add(group);
}

function addRoadsideTrees(points, roadWidth, highway) {
  // Hindari jalan setapak dan jalan layanan kecil. Jarak cukup renggang
  // agar pohon tidak terlalu padat pada jaringan jalan yang saling berdekatan.
  if (!['primary', 'secondary', 'tertiary', 'residential'].includes(highway)) return;
  if (points.length < 2) return;

  const spacing = highway === 'primary' ? 42 : 34;
  const offset = roadWidth / 2 + 1.9;
  let distanceToNext = spacing * 0.55;
  let travelled = 0;
  let treeIndex = 0;
  let lampIndex = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const segmentLength = Math.hypot(dx, dz);
    if (segmentLength < 0.5) continue;

    while (distanceToNext <= segmentLength) {
      const t = distanceToNext / segmentLength;
      const x = THREE.MathUtils.lerp(a.x, b.x, t);
      const z = THREE.MathUtils.lerp(a.z, b.z, t);
      const y = THREE.MathUtils.lerp(a.y, b.y, t);

      const nx = -dz / segmentLength;
      const nz = dx / segmentLength;
      // Selang-seling kiri dan kanan untuk mengurangi risiko berhadapan
      // dengan bangunan pada ruas yang sempit.
      const side = treeIndex % 2 === 0 ? 1 : -1;
      const jitter = ((treeIndex * 17) % 5) * 0.25;
      const treeX = x + nx * side * (offset + jitter);
      const treeZ = z + nz * side * (offset + jitter);

      addRoadsideTree(treeX, treeZ, y, treeIndex + Math.round(travelled), 0.82 + (treeIndex % 3) * 0.12);

      if (treeIndex % 2 === 0) {
        const lampSide = lampIndex % 2 === 0 ? -1 : 1;
        addStreetLamp(
          x + nx * lampSide * (offset + 1.5),
          z + nz * lampSide * (offset + 1.5),
          y,
          Math.atan2(dz, dx)
        );
        lampIndex++;
      }
      treeIndex++;
      distanceToNext += spacing;
    }
    travelled += segmentLength;
    distanceToNext -= segmentLength;
  }
}

function addRoad(coords, props = {}) {
  if (!coords || coords.length < 2) return null;

  const highway = String(props.highway || 'road').toLowerCase();
  const widths = {
    motorway: 10, trunk: 9, primary: 8, secondary: 7,
    tertiary: 6, residential: 4.8, unclassified: 4.2,
    living_street: 4, service: 3.4, footway: 1.6,
    pedestrian: 2.8, path: 1.3, track: 2.6, cycleway: 1.8
  };
  const roadWidth = widths[highway] || 3.8;

  const points = coords.map(([lon, lat]) => {
    const p = toWorld(lon, lat);
    return {
      x: p.x,
      z: p.z,
      y: terrainHeightAt(lon, lat)
    };
  });

  addRoadsideTrees(points, roadWidth, highway);

  // Lapisan dasar bahu jalan agar tepi jalan tidak langsung bertemu tanah.
  const shoulder = makeRoadRibbon(
    points,
    roadWidth + 1.2,
    0.72,
    new THREE.MeshStandardMaterial({
      color: 0x9b9b8c,
      roughness: 1,
      side: THREE.DoubleSide
    }),
    `Bahu jalan ${highway}`
  );
  if (shoulder) scene.add(shoulder);

  // Permukaan aspal.
  const asphalt = makeRoadRibbon(
    points,
    roadWidth,
    0.92,
    new THREE.MeshStandardMaterial({
      color: highway === 'footway' || highway === 'path' ? 0xaaa18e : 0x343b40,
      roughness: 0.96,
      metalness: 0
    }),
    props.name || `Jalan ${highway}`
  );
  if (asphalt) scene.add(asphalt);

  // Trotoar dan drainase untuk jalan perkotaan.
  // Tidak diterapkan pada jalur kaki, jalan setapak, atau gang layanan sempit.
  const urbanRoads = [
    'primary', 'secondary', 'tertiary',
    'residential', 'unclassified', 'living_street'
  ];

  if (urbanRoads.includes(highway)) {
    const sidewalkWidth = ['primary', 'secondary'].includes(highway) ? 1.65 : 1.25;
    const curbWidth = 0.18;
    const drainWidth = 0.24;
    const sidewalkOffset = roadWidth / 2 + sidewalkWidth / 2 + 0.12;

    const offsetPoints = (side, distance) => points.map((p, i) => {
      const prev = points[Math.max(0, i - 1)];
      const next = points[Math.min(points.length - 1, i + 1)];
      let dx = next.x - prev.x;
      let dz = next.z - prev.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      const nx = -dz;
      const nz = dx;
      return {
        x: p.x + nx * side * distance,
        z: p.z + nz * side * distance,
        y: p.y
      };
    });

    for (const side of [-1, 1]) {
      const sidewalkCenter = offsetPoints(side, sidewalkOffset);
      const sidewalk = makeRoadRibbon(
        sidewalkCenter,
        sidewalkWidth,
        1.02,
        new THREE.MeshStandardMaterial({
          color: 0xb9b5a8,
          roughness: 1,
          side: THREE.DoubleSide
        }),
        `Trotoar ${highway}`
      );
      if (sidewalk) scene.add(sidewalk);

      // Kerb/bibir trotoar yang sedikit lebih tinggi dari permukaan trotoar.
      const curbCenter = offsetPoints(
        side,
        roadWidth / 2 + sidewalkWidth + 0.12
      );
      const curb = makeRoadRibbon(
        curbCenter,
        curbWidth,
        1.22,
        new THREE.MeshStandardMaterial({
          color: 0xd4d0c3,
          roughness: 1,
          side: THREE.DoubleSide
        }),
        `Kereb trotoar ${highway}`
      );
      if (curb) scene.add(curb);

      // Saluran drainase sempit di sisi luar trotoar.
      const drainCenter = offsetPoints(
        side,
        roadWidth / 2 + sidewalkWidth + 0.48
      );
      const drain = makeRoadRibbon(
        drainCenter,
        drainWidth,
        0.84,
        new THREE.MeshStandardMaterial({
          color: 0x59645f,
          roughness: 1,
          side: THREE.DoubleSide
        }),
        `Drainase tepi jalan ${highway}`
      );
      if (drain) scene.add(drain);
    }
  }

  // Garis tepi tipis pada jalan utama.
  if (['primary', 'secondary', 'tertiary'].includes(highway)) {
    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: 0xe6dfc9,
      roughness: 1,
      side: THREE.DoubleSide
    });
    const leftEdge = makeRoadRibbon(points, roadWidth - 0.35, 0.96, edgeMaterial, 'Garis tepi jalan');
    if (leftEdge) {
      // Garis tepi digambar sebagai dua garis tipis menggunakan Line.
      scene.remove(leftEdge);
      leftEdge.geometry.dispose();
    }

    const makeEdgeLine = (side) => {
      const edgePoints = points.map((p, i) => {
        const prev = points[Math.max(0, i - 1)];
        const next = points[Math.min(points.length - 1, i + 1)];
        let dx = next.x - prev.x, dz = next.z - prev.z;
        const len = Math.hypot(dx, dz) || 1;
        dx /= len; dz /= len;
        const nx = -dz, nz = dx;
        return new THREE.Vector3(
          p.x + nx * side * (roadWidth / 2 - 0.22),
          p.y + 1.01,
          p.z + nz * side * (roadWidth / 2 - 0.22)
        );
      });
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(edgePoints),
        new THREE.LineBasicMaterial({ color: 0xe8e0c9 })
      );
      scene.add(line);
    };
    makeEdgeLine(1);
    makeEdgeLine(-1);
  }

  // Marka tengah putus-putus untuk jalan arteri/kolektor.
  if (['primary', 'secondary'].includes(highway)) {
    const dashMaterial = new THREE.MeshStandardMaterial({
      color: 0xf4d66b,
      roughness: 1,
      side: THREE.DoubleSide
    });
    let distanceSinceDash = 0;
    let drawDash = true;
    const dashPoints = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      const steps = Math.max(1, Math.ceil(length / 2));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const x = THREE.MathUtils.lerp(a.x, b.x, t);
        const z = THREE.MathUtils.lerp(a.z, b.z, t);
        const y = THREE.MathUtils.lerp(a.y, b.y, t) + 1.04;
        if (drawDash) dashPoints.push(new THREE.Vector3(x, y, z));
        distanceSinceDash += length / steps;
        if (distanceSinceDash >= 5) {
          distanceSinceDash = 0;
          drawDash = !drawDash;
          if (!drawDash && dashPoints.length > 1) {
            const mark = new THREE.Line(
              new THREE.BufferGeometry().setFromPoints(dashPoints.splice(0)),
              new THREE.LineBasicMaterial({ color: 0xf4d66b })
            );
            scene.add(mark);
          }
        }
      }
    }
    if (dashPoints.length > 1) {
      scene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(dashPoints),
        new THREE.LineBasicMaterial({ color: 0xf4d66b })
      ));
    }
  }

  return asphalt;
}

function makeGroundPolygon(rings, color, yOffset) {
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
  const center = averageCoordinate(rings[0]);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color, roughness: color === 0x3c9bc5 ? 0.35 : 1,
      side: THREE.DoubleSide
    })
  );
  mesh.position.y = terrainHeightAt(center.lon, center.lat) + yOffset;
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
        const building = polygonToBuilding(rings, p);
        if (building) { scene.add(building); counts.buildings++; }
      } else if (p.natural === 'water' || p.water || p.landuse === 'reservoir') {
        const water = makeGroundPolygon(rings, 0x3c9bc5, 0.25);
        if (water) { scene.add(water); counts.water++; }
      } else if (p.leisure === 'park' || p.leisure === 'garden' ||
                 ['forest', 'grass', 'meadow', 'farmland', 'orchard'].includes(p.landuse)) {
        const green = makeGroundPolygon(rings, 0x6caa72, 0.18);
        if (green) { scene.add(green); counts.green++; }
      }
    }
  }
}

async function loadMap() {
  await loadTerrain();

  const response = await fetch(GEOJSON_URL);
  if (!response.ok) throw new Error(`File GeoJSON tidak ditemukan (${response.status})`);
  const geojson = await response.json();
  const counts = { roads: 0, buildings: 0, water: 0, green: 0 };
  geojson.features.forEach(feature => processFeature(feature, counts));

  const marker = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 3, 2, 20),
    new THREE.MeshStandardMaterial({ color: 0xffd34e })
  );
  marker.position.set(
    0,
    terrainHeightAt(CENTER.lon, CENTER.lat) + 1.5,
    0
  );
  marker.castShadow = true;
  scene.add(marker);

  document.querySelector('#stats').textContent =
    `${counts.roads} segmen jalan • ${counts.buildings} bangunan • ${counts.water} area air • ${counts.green} area hijau • Terrain SRTM • Detail kota 3D`;
  document.querySelector('#loading').classList.add('done');
}

loadMap().catch(error => {
  console.error(error);
  document.querySelector('#loading').textContent = `Gagal memuat peta/terrain: ${error.message}`;
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
