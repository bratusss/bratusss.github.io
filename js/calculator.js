// js/calculator.js — interaktīvs 3D cenas kalkulators (cenas.html)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { computeBBox, computeVolume, computeSurfaceArea, sliceMesh, macroLayers, estimatePrint } from './slicer.js';

const LAYER_HEIGHT = 0.2;
const MAX_TRIANGLES_FOR_SLICE = 350000; // virs šī — makro aprēķins
const PRINTER_ID = 'p1s';   // printeris nav izvēlējams
const HOURLY_RATE = 3;      // €/h
const PROCESSING_FEE = 10;  // € — faila apstrāde

// Nebula Premium PLA krāsu palete (presets).
const PALETTE = [
  { name: 'Pure White', hex: '#ffffff' },
  { name: 'Natural', hex: '#eae0c8' },
  { name: 'Beige', hex: '#ffdea1' },
  { name: 'Latte Brown', hex: '#c79577' },
  { name: 'Chocolate Brown', hex: '#473936' },
  { name: 'Carbon Black', hex: '#0e0e0c' },
  { name: 'Gray', hex: '#808080' },
  { name: 'Fancy Gray', hex: '#737979' },
  { name: 'Silver', hex: '#c0c0c0' },
  { name: 'Pearl Silver', hex: '#c9cdcc' },
  { name: 'Metallic Silver', hex: '#a0acac' },
  { name: 'Metallic Black', hex: '#2c3031' },
  { name: 'Gold', hex: '#fcce06' },
  { name: 'Majestic Gold', hex: '#e3c200' },
  { name: 'Old Gold', hex: '#77560f' },
  { name: 'Copper', hex: '#ea8945' },
  { name: 'Red', hex: '#ff0000' },
  { name: 'Scarlet Red', hex: '#d4433e' },
  { name: 'Fire Red', hex: '#f14017' },
  { name: 'Red Fluo', hex: '#fb1909' },
  { name: 'Orange', hex: '#ffa500' },
  { name: 'Pumpkin Orange', hex: '#ffb406' },
  { name: 'Orange Fluo', hex: '#f87300' },
  { name: 'Sunny Yellow', hex: '#fcce09' },
  { name: 'Yellow Fluo', hex: '#ccff00' },
  { name: 'Fresh Green', hex: '#ade50a' },
  { name: 'Green Fluo', hex: '#05fa09' },
  { name: 'Bright Green', hex: '#09ae48' },
  { name: 'Green Grass', hex: '#138732' },
  { name: 'Green Pistachio', hex: '#b7ff71' },
  { name: 'Light Green', hex: '#90ee90' },
  { name: 'Military Green', hex: '#5b6d53' },
  { name: 'Aqua Blue', hex: '#1ed2ff' },
  { name: 'Mermaid Blue', hex: '#3bd6d0' },
  { name: 'Light Blue', hex: '#06ccfb' },
  { name: 'Blue Sky', hex: '#0087cd' },
  { name: 'Storm Blue', hex: '#4b6d9c' },
  { name: 'Dark Blue', hex: '#0042d5' },
  { name: 'Liliac Violet', hex: '#64339e' },
  { name: 'Lavender Field', hex: '#d7d4ff' },
  { name: 'Plum', hex: '#ad4d73' },
  { name: 'Satin Rose', hex: '#d15b73' },
  { name: 'Mountain Fuchsia', hex: '#fb1b7e' },
  { name: 'Lolipop Pink', hex: '#f105a5' }
];

const DEFAULT_COLOR = '#4b6d9c'; // Storm Blue

const MATERIALS = {
  pla: { label: 'PLA', density: 1.24, price: 17 },
  petg: { label: 'PETG', density: 1.27, price: 17 },
  abs: { label: 'ABS', density: 1.04, price: 20 },
  tpu: { label: 'TPU', density: 1.21, price: 20 },
  pc: { label: 'PC', density: 1.20, price: 20 },
  nylon: { label: 'Nylon (PA)', density: 1.14, price: 20 },
  cf: { label: 'Carbon Fiber', density: 1.25, price: 20 }
};

// DOM elementi
const uploadScreen = document.getElementById('calc-upload-screen');
const workspaceScreen = document.getElementById('calc-workspace-screen');
const dropzone = document.getElementById('calc-dropzone');
const fileInput = document.getElementById('calc-file');
const fileInputMore = document.getElementById('calc-file-more');
const uploadStatus = document.getElementById('calc-upload-status');
const seePriceBtn = document.getElementById('calc-see-price');
const backBtn = document.getElementById('calc-back');
const addPartBtn = document.getElementById('calc-add-part');
const partsListEl = document.getElementById('calc-parts-list');
const viewerEl = document.getElementById('calc-viewer');
const hintEl = document.getElementById('calc-viewer-hint');
const materialSel = document.getElementById('calc-material');
const materialSelWs = document.getElementById('calc-material-ws');
const qtyEl = document.getElementById('calc-qty');
const qtyMinus = document.getElementById('calc-qty-minus');
const qtyPlus = document.getElementById('calc-qty-plus');
const colorSwatchesEl = document.getElementById('calc-color-swatches');
const colorLabelEl = document.getElementById('calc-color-label');
const partSummaryEl = document.getElementById('calc-part-summary');
const totalEl = document.getElementById('calc-total');

if ([
  uploadScreen, workspaceScreen, dropzone, fileInput, fileInputMore, uploadStatus,
  seePriceBtn, backBtn, addPartBtn, partsListEl, viewerEl, hintEl,
  materialSel, materialSelWs, qtyEl, qtyMinus, qtyPlus, colorSwatchesEl, colorLabelEl,
  partSummaryEl, totalEl
].some((el) => !el)) {
  throw new Error('Kalkulatora elementi nav atrasti.');
}

// ---------- Three.js aina ----------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
camera.position.set(90, 70, 130);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.domElement.style.display = 'block';
viewerEl.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 0, 0);
// Onshape stila peles vadība: kreisā = rotē, labā = panoramē, vidējā/ritenis = tuvināt.
controls.mouseButtons = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.PAN
};
controls.touches = {
  ONE: THREE.TOUCH.ROTATE,
  TWO: THREE.TOUCH.DOLLY_PAN
};
controls.zoomToCursor = true;
controls.screenSpacePanning = true;

scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.7);
keyLight.position.set(1, 1.6, 1);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xffffff, 0.45);
fillLight.position.set(-1, -0.5, -1);
scene.add(fillLight);

let modelGroup = null;

function createPartMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.55,
    metalness: 0.08,
    flatShading: true,
    side: THREE.DoubleSide
  });
}

const EDGE_MATERIAL = new THREE.LineBasicMaterial({ color: 0x000000 });
const MAX_TRIANGLES_FOR_EDGES = 200000;

// Uzliek melnas šķautņu līnijas, lai forma vairāk izceltos.
function addEdges(object, triangleCount) {
  if (triangleCount > MAX_TRIANGLES_FOR_EDGES) return;
  object.traverse((o) => {
    if (o.isMesh && o.geometry) {
      const edges = new THREE.EdgesGeometry(o.geometry, 24);
      const line = new THREE.LineSegments(edges, EDGE_MATERIAL);
      o.add(line);
    }
  });
}

function clearModel() {
  if (modelGroup) {
    scene.remove(modelGroup);
    modelGroup = null;
  }
}

function resize() {
  const w = viewerEl.clientWidth || 1;
  const h = viewerEl.clientHeight || 1;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

const ro = new ResizeObserver(resize);
ro.observe(viewerEl);
resize();

renderer.setAnimationLoop((time) => {
  if (fly) {
    const t = Math.min(1, (time - fly.startTime) / fly.duration);
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    camera.position.lerpVectors(fly.fromPos, fly.toPos, e);
    camera.up.lerpVectors(fly.fromUp, fly.toUp, e).normalize();
    if (t >= 1) fly = null;
  }
  controls.update();
  updateViewCube();
  renderer.render(scene, camera);
});

// ---------- Ģeometrijas iegūšana ----------
function flattenTriangles(geoms) {
  let total = 0;
  for (let i = 0; i < geoms.length; i++) {
    total += geoms[i].geometry.attributes.position.count;
  }
  const out = new Float32Array(total * 3);
  let o = 0;
  const v = new THREE.Vector3();
  for (let i = 0; i < geoms.length; i++) {
    const g = geoms[i];
    const pos = g.geometry.attributes.position;
    for (let j = 0; j < pos.count; j++) {
      v.fromBufferAttribute(pos, j).applyMatrix4(g.matrix);
      out[o++] = v.x;
      out[o++] = v.y;
      out[o++] = v.z;
    }
  }
  return out;
}

// ---------- Stāvoklis ----------
let parts = [];      // {id, fileName, object, material, result, color, quantity}
let activeId = null;
let materialKey = 'pla';
let seq = 0;

// ---------- Failu ielāde un analīze ----------
function fileExt(name) {
  return (name.split('.').pop() || '').toLowerCase();
}

async function loadFiles(files) {
  for (const file of Array.from(files || [])) {
    await addPart(file);
  }
}

async function addPart(file) {
  const ext = fileExt(file.name);
  if (['stl', 'obj', '3mf'].indexOf(ext) === -1) {
    showError('Neatbalstīts formāts: ' + file.name + '. Lūdzu izvēlies STL, OBJ vai 3MF failu.');
    return;
  }

  setStatus('Ielādē ' + file.name + '…');
  let object;
  try {
    if (ext === 'stl') {
      const buf = await file.arrayBuffer();
      object = new THREE.Mesh(new STLLoader().parse(buf));
    } else if (ext === 'obj') {
      const text = await file.text();
      object = new OBJLoader().parse(text);
    } else {
      const buf = await file.arrayBuffer();
      object = new ThreeMFLoader().parse(buf);
    }
  } catch (err) {
    showError('Neizdevās nolasīt failu: ' + err.message);
    return;
  }

  setStatus('Aprēķina…');
  // Ļauj pārzīmēt UI pirms sinhronā aprēķina.
  await new Promise((r) => setTimeout(r, 30));

  try {
    const result = analyze(object, file.name);
    const color = DEFAULT_COLOR;
    const material = createPartMaterial(color);
    object.traverse((o) => {
      if (o.isMesh && o.geometry) o.material = material;
    });
    addEdges(object, result.triangleCount);

    const part = {
      id: ++seq,
      fileName: file.name,
      object: object,
      material: material,
      result: result,
      color: color,
      quantity: 1
    };
    parts.push(part);
    renderPartsList();
    setActivePart(part.id);
    setStatus(null);
    updateUploadStatus();
  } catch (err) {
    showError('Aprēķina kļūda: ' + err.message);
  }
}

function analyze(object, fileName) {
  object.updateMatrixWorld(true);

  const geoms = [];
  object.traverse((o) => {
    if (o.isMesh && o.geometry) {
      if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
      geoms.push({ geometry: g, matrix: o.matrixWorld.clone() });
    }
  });

  if (!geoms.length) throw new Error('Modelī netika atrasta ģeometrija.');

  const tris = flattenTriangles(geoms);
  const triangleCount = tris.length / 9;
  const bbox = computeBBox(tris);
  const volumeMm3 = computeVolume(tris);
  const surfaceMm2 = computeSurfaceArea(tris);
  const sizeX = bbox.maxX - bbox.minX;
  const sizeY = bbox.maxY - bbox.minY;
  const sizeZ = bbox.maxZ - bbox.minZ;

  // Sagriešana slāņos (laiks tiek rēķināts renderPrice).
  let layers;
  let precise = true;
  if (triangleCount <= MAX_TRIANGLES_FOR_SLICE) {
    layers = sliceMesh(tris, LAYER_HEIGHT);
  } else {
    layers = macroLayers(tris, LAYER_HEIGHT);
    precise = false;
  }

  return {
    fileName, triangleCount, bbox, sizeX, sizeY, sizeZ,
    volumeMm3, surfaceMm2, layers, precise
  };
}

// ---------- Aktīvā detaļa ----------
function getActive() {
  for (const p of parts) if (p.id === activeId) return p;
  return parts[0] || null;
}

function setActivePart(id) {
  activeId = id;
  renderPartsList();
  const part = getActive();
  if (!part) {
    clearModel();
    hintEl.style.display = 'flex';
    partSummaryEl.innerHTML = '';
    return;
  }
  hintEl.style.display = 'none';
  showModel(part);
  updateControls(part);
  renderPrice();
}

function showModel(part) {
  clearModel();
  modelGroup = new THREE.Group();
  const b = part.result.bbox;
  const maxDim = Math.max(part.result.sizeX, part.result.sizeY, part.result.sizeZ, 1e-6);
  const scale = 80 / maxDim;
  modelGroup.scale.setScalar(scale);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  modelGroup.add(part.object);
  modelGroup.position.set(-cx * scale, -cy * scale, -cz * scale);
  scene.add(modelGroup);
  controls.target.set(0, 0, 0);
  controls.update();
}

// ---------- UI atjauninājumi ----------
function formatDims(result) {
  return [result.sizeX, result.sizeY, result.sizeZ]
    .sort((a, b) => b - a)
    .map((d) => d.toFixed(1))
    .join(' × ') + ' mm';
}

function renderPartsList() {
  partsListEl.innerHTML = '';
  parts.forEach((p) => {
    const li = document.createElement('li');
    li.className = 'calc-part' + (p.id === activeId ? ' is-active' : '');
    li.innerHTML =
      '<button type="button" class="calc-part-btn" data-id="' + p.id + '">' +
        '<span class="calc-part-name">' + escapeHtml(p.fileName) + '</span>' +
        '<span class="calc-part-dims">' + formatDims(p.result) + '</span>' +
        '<span class="calc-part-qty">Daudzums: ' + p.quantity + '</span>' +
      '</button>' +
      '<button type="button" class="calc-part-remove" data-id="' + p.id + '" aria-label="Noņemt detaļu">×</button>';
    li.querySelector('.calc-part-btn').addEventListener('click', () => setActivePart(p.id));
    li.querySelector('.calc-part-remove').addEventListener('click', () => removePart(p.id));
    partsListEl.appendChild(li);
  });
}

function removePart(id) {
  const idx = parts.findIndex((p) => p.id === id);
  if (idx === -1) return;
  const [removed] = parts.splice(idx, 1);
  disposePart(removed);
  if (activeId === id) activeId = parts.length ? parts[0].id : null;
  renderPartsList();
  setActivePart(activeId);
  updateUploadStatus();
}

function disposePart(part) {
  part.object.traverse((o) => {
    if (o.isMesh) {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material !== part.material) o.material.dispose();
    }
    if (o.isLineSegments && o.geometry) o.geometry.dispose();
  });
  if (part.material) part.material.dispose();
}

function updateControls(part) {
  qtyEl.value = part.quantity;
  updateColorSelection(part.color);
}

function updateUploadStatus() {
  if (!parts.length) {
    uploadStatus.textContent = '';
    seePriceBtn.disabled = true;
    return;
  }
  uploadStatus.textContent = 'Pievienotas detaļas: ' + parts.map((p) => p.fileName).join(', ');
  seePriceBtn.disabled = false;
}

// ---------- Cena ----------
function estimatePart(part) {
  const mat = MATERIALS[materialKey] || MATERIALS.pla;
  const print = estimatePrint(part.result.layers, PRINTER_ID);
  const weightG = print.extrudedVolumeMm3 * mat.density * 0.001;
  const weightKg = weightG / 1000;
  const timeCost = print.hours * HOURLY_RATE;
  const materialCost = weightKg * mat.price;
  const processingCost = PROCESSING_FEE;
  return {
    total: timeCost + materialCost + processingCost,
    timeCost, materialCost, processingCost,
    weightG, hours: print.hours, timeSeconds: print.timeSeconds,
    layerCount: print.layerCount, label: mat.label
  };
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return (h > 0 ? h + ' h ' : '') + m + ' min';
}

function renderPrice() {
  let total = 0;
  for (const p of parts) {
    total += estimatePart(p).total * p.quantity;
  }
  totalEl.textContent = total.toFixed(2) + ' €';

  const part = getActive();
  if (!part) { partSummaryEl.innerHTML = ''; return; }
  const e = estimatePart(part);
  partSummaryEl.innerHTML =
    '<div class="calc-sum-title">Aktīvā detaļa</div>' +
    '<div class="calc-sum-row"><span>Drukas laiks</span><strong>' + formatTime(e.timeSeconds) + '</strong></div>' +
    '<div class="calc-sum-row"><span>Svars</span><strong>' + e.weightG.toFixed(1) + ' g</strong></div>' +
    '<div class="calc-sum-row"><span>Materiāls</span><strong>' + e.label + '</strong></div>' +
    '<div class="calc-sum-row"><span>Detaļas cena</span><strong>' + e.total.toFixed(2) + ' €</strong></div>' +
    '<div class="calc-sum-row"><span>× ' + part.quantity + '</span><strong>' + (e.total * part.quantity).toFixed(2) + ' €</strong></div>';
}

// ---------- Status / kļūdas ----------
function setStatus(text) {
  if (text) {
    hintEl.textContent = text;
    hintEl.style.display = 'flex';
    uploadStatus.textContent = text;
  } else {
    hintEl.style.display = 'none';
  }
}

function showError(msg) {
  setStatus(msg);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ---------- Skata navigācijas kubs ----------
const VIEW_DIST = 110;
const SVG_NS = 'http://www.w3.org/2000/svg';
let fly = null;
let viewCube = null;
let cubeDirs = { front: [0, 0, 1], right: [1, 0, 0], top: [0, 1, 0] };
const HOME_POS = new THREE.Vector3(90, 70, 130);

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

function initViewCube() {
  viewCube = {};
  const svg = svgEl('svg', { 'class': 'calc-view-cube', 'viewBox': '0 0 100 100', 'aria-label': 'Skata navigācijas kubs' });

  const faceTop = svgEl('polygon', { 'class': 'cube-face', 'data-face': 'top', 'points': '50,8 84,26 50,42 16,26' });
  const faceFront = svgEl('polygon', { 'class': 'cube-face', 'data-face': 'front', 'points': '16,26 50,42 50,76 16,58' });
  const faceRight = svgEl('polygon', { 'class': 'cube-face', 'data-face': 'right', 'points': '84,26 84,58 50,76 50,42' });

  const corner1 = svgEl('circle', { 'class': 'cube-corner', 'data-corner': 'c1', 'cx': '84', 'cy': '26', 'r': '10' });
  const corner2 = svgEl('circle', { 'class': 'cube-corner', 'data-corner': 'c2', 'cx': '16', 'cy': '26', 'r': '10' });
  const corner3 = svgEl('circle', { 'class': 'cube-corner', 'data-corner': 'c3', 'cx': '50', 'cy': '76', 'r': '10' });
  const center = svgEl('circle', { 'class': 'cube-center', 'data-center': 'home', 'cx': '50', 'cy': '42', 'r': '8' });

  const labelTop = svgEl('text', { 'class': 'cube-label', 'x': '50', 'y': '27', 'text-anchor': 'middle' });
  const labelFront = svgEl('text', { 'class': 'cube-label', 'x': '33', 'y': '52', 'text-anchor': 'middle' });
  const labelRight = svgEl('text', { 'class': 'cube-label', 'x': '67', 'y': '52', 'text-anchor': 'middle' });

  [faceTop, faceFront, faceRight, corner1, corner2, corner3, labelTop, labelFront, labelRight, center]
    .forEach((el) => svg.appendChild(el));

  viewerEl.appendChild(svg);

  faceTop.addEventListener('click', () => flyToFace('top'));
  faceFront.addEventListener('click', () => flyToFace('front'));
  faceRight.addEventListener('click', () => flyToFace('right'));
  corner1.addEventListener('click', () => flyToCorner('c1'));
  corner2.addEventListener('click', () => flyToCorner('c2'));
  corner3.addEventListener('click', () => flyToCorner('c3'));
  center.addEventListener('click', () => flyToPos(HOME_POS, [0, 1, 0]));

  viewCube.labels = { top: labelTop, front: labelFront, right: labelRight };
  updateViewCube();
}

function cubeState() {
  const d = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  const az = Math.atan2(d.x, d.z);
  const idx = ((Math.round(az / (Math.PI / 2)) % 4) + 4) % 4;
  const H = [
    { name: 'FRONT', n: [0, 0, 1] },
    { name: 'RIGHT', n: [1, 0, 0] },
    { name: 'BACK', n: [0, 0, -1] },
    { name: 'LEFT', n: [-1, 0, 0] }
  ];
  return {
    front: H[idx],
    right: H[(idx + 1) % 4],
    top: d.y >= 0 ? { name: 'TOP', n: [0, 1, 0] } : { name: 'BOTTOM', n: [0, -1, 0] }
  };
}

function updateViewCube() {
  if (!viewCube) return;
  const s = cubeState();
  viewCube.labels.top.textContent = s.top.name;
  viewCube.labels.front.textContent = s.front.name;
  viewCube.labels.right.textContent = s.right.name;
  cubeDirs = { front: s.front.n, right: s.right.n, top: s.top.n };
}

function flyToDir(dir, up) {
  const v = new THREE.Vector3(dir[0], dir[1], dir[2]);
  if (v.lengthSq() < 1e-6) return;
  // Saglabā esošo attālumu (bez zoom efekta).
  const dist = camera.position.distanceTo(controls.target) || VIEW_DIST;
  v.normalize().multiplyScalar(dist);
  // Izvairās no degenerācijas, kad skats ir tieši virs/apakš.
  if (Math.hypot(v.x, v.z) < 0.001) v.x = 0.0001 * dist;
  fly = {
    fromPos: camera.position.clone(),
    toPos: v,
    fromUp: camera.up.clone(),
    toUp: new THREE.Vector3(up[0], up[1], up[2]).normalize(),
    startTime: performance.now(),
    duration: 380
  };
}

function flyToPos(pos, up) {
  const dist = camera.position.distanceTo(controls.target) || VIEW_DIST;
  const to = new THREE.Vector3().copy(pos).normalize().multiplyScalar(dist);
  fly = {
    fromPos: camera.position.clone(),
    toPos: to,
    fromUp: camera.up.clone(),
    toUp: new THREE.Vector3(up[0], up[1], up[2]).normalize(),
    startTime: performance.now(),
    duration: 380
  };
}

function flyToFace(which) {
  flyToDir(cubeDirs[which], [0, 1, 0]);
}

function flyToCorner(which) {
  const f = cubeDirs.front;
  const r = cubeDirs.right;
  const t = cubeDirs.top;
  let dir;
  if (which === 'c1') dir = [f[0] + r[0] + t[0], f[1] + r[1] + t[1], f[2] + r[2] + t[2]];
  else if (which === 'c2') dir = [f[0] - r[0] + t[0], f[1] - r[1] + t[1], f[2] - r[2] + t[2]];
  else dir = [f[0] - t[0], f[1] - t[1], f[2] - t[2]];
  flyToDir(dir, [0, 1, 0]);
}

// ---------- Ekrānu pārslēgšana ----------
function showWorkspace() {
  if (!parts.length) return;
  uploadScreen.classList.remove('is-active');
  workspaceScreen.classList.add('is-active');
  requestAnimationFrame(() => {
    resize();
    renderer.render(scene, camera);
  });
  workspaceScreen.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showUpload() {
  workspaceScreen.classList.remove('is-active');
  uploadScreen.classList.add('is-active');
  uploadScreen.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- Notikumi ----------
function bindDropzone(zone, input) {
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
  });
  ['dragenter', 'dragover'].forEach((ev) => {
    zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('drag'); });
  });
  ['dragleave', 'drop'].forEach((ev) => {
    zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('drag'); });
  });
  zone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files.length) {
      e.preventDefault();
      loadFiles(e.dataTransfer.files);
    }
  });
  input.addEventListener('change', () => {
    if (input.files && input.files.length) {
      loadFiles(input.files);
      input.value = '';
    }
  });
}

bindDropzone(dropzone, fileInput);

addPartBtn.addEventListener('click', () => fileInputMore.click());
fileInputMore.addEventListener('change', () => {
  if (fileInputMore.files && fileInputMore.files.length) {
    loadFiles(fileInputMore.files);
    fileInputMore.value = '';
  }
});

seePriceBtn.addEventListener('click', showWorkspace);
backBtn.addEventListener('click', showUpload);

materialSel.addEventListener('change', () => {
  materialKey = materialSel.value;
  materialSelWs.value = materialKey;
  renderPrice();
});

materialSelWs.addEventListener('change', () => {
  materialKey = materialSelWs.value;
  materialSel.value = materialKey;
  renderPrice();
});

qtyMinus.addEventListener('click', () => setQuantity((getActive() ? getActive().quantity : 1) - 1));
qtyPlus.addEventListener('click', () => setQuantity((getActive() ? getActive().quantity : 1) + 1));
qtyEl.addEventListener('change', () => setQuantity(parseInt(qtyEl.value, 10) || 1));

function setQuantity(value) {
  const part = getActive();
  if (!part) return;
  part.quantity = Math.min(999, Math.max(1, value));
  qtyEl.value = part.quantity;
  renderPartsList();
  renderPrice();
}

function renderSwatches() {
  colorSwatchesEl.innerHTML = '';
  PALETTE.forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'calc-color-swatch';
    b.style.background = c.hex;
    b.title = c.name;
    b.setAttribute('aria-label', c.name);
    b.dataset.hex = c.hex;
    b.dataset.name = c.name;
    b.addEventListener('click', () => setColor(c));
    colorSwatchesEl.appendChild(b);
  });
}

function updateColorSelection(hex) {
  colorSwatchesEl.querySelectorAll('.calc-color-swatch').forEach((s) => {
    s.classList.toggle('is-active', s.dataset.hex.toUpperCase() === hex.toUpperCase());
  });
  const found = PALETTE.find((c) => c.hex.toUpperCase() === hex.toUpperCase());
  colorLabelEl.textContent = found ? found.name : '';
}

function setColor(c) {
  const part = getActive();
  if (!part) return;
  part.color = c.hex;
  part.material.color.set(c.hex);
  updateColorSelection(c.hex);
}

// Sākotnējais stāvoklis
renderSwatches();
initViewCube();
updateUploadStatus();
renderPartsList();
renderPrice();
