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
const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xqpaqkkk';

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
const orderBtn = document.getElementById('calc-order-btn');
const orderModal = document.getElementById('calc-order-modal');
const orderClose = document.getElementById('calc-order-close');
const orderForm = document.getElementById('calc-order-form');
const orderSummaryEl = document.getElementById('calc-order-summary');
const orderStatusEl = document.getElementById('calc-order-status');
const orderSubmit = document.getElementById('calc-order-submit');
const orderName = document.getElementById('calc-order-name');
const orderEmail = document.getElementById('calc-order-email');
const orderPhone = document.getElementById('calc-order-phone');
const orderLink = document.getElementById('calc-order-link');
const orderMessage = document.getElementById('calc-order-message');

if ([
  uploadScreen, workspaceScreen, dropzone, fileInput, fileInputMore, uploadStatus,
  seePriceBtn, backBtn, addPartBtn, partsListEl, viewerEl, hintEl,
  materialSel, materialSelWs, qtyEl, qtyMinus, qtyPlus, colorSwatchesEl, colorLabelEl,
  partSummaryEl, totalEl, orderBtn, orderModal, orderClose, orderForm, orderSummaryEl,
  orderStatusEl, orderSubmit, orderName, orderEmail, orderPhone, orderLink, orderMessage
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
controls.zoomToCursor = false;
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
  renderer.render(scene, camera);
  renderViewCube();
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
      file: file,
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

// ---------- 3D skata navigācijas kubs ----------
const VIEW_DIST = 110;
const HOME_POS = new THREE.Vector3(90, 70, 130);
let fly = null;
let helperRenderer = null;

const HELPER_SIZE = 96;   // CSS px
const HELPER_PAD = 16;    // CSS px

const FACE_DIRS = {
  posX: [1, 0, 0], negX: [-1, 0, 0],
  posY: [0, 1, 0], negY: [0, -1, 0],
  posZ: [0, 0, 1], negZ: [0, 0, -1]
};
const FACE_LABELS = {
  posX: 'RIGHT', negX: 'LEFT',
  posY: 'TOP', negY: 'BOTTOM',
  posZ: 'FRONT', negZ: 'BACK'
};

const viewCubeScene = new THREE.Scene();
const viewCubeCamera = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.1, 10);
viewCubeCamera.up.set(0, 1, 0);
viewCubeCamera.position.set(0, 0, 3);
viewCubeCamera.lookAt(0, 0, 0);
viewCubeCamera.updateMatrixWorld(true);

const viewCubeGroup = new THREE.Group();
viewCubeScene.add(viewCubeGroup);

const helperRaycaster = new THREE.Raycaster();
const helperMouse = new THREE.Vector2();
const helperViewDir = new THREE.Vector3();
const interactiveObjects = [];

function makeFaceSprite(type) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 34px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1f1501';
  ctx.fillText(FACE_LABELS[type], 64, 64);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas),
    transparent: true,
    depthTest: true,
    depthWrite: false
  }));
  sprite.scale.setScalar(0.78);
  sprite.userData.type = type;
  const d = FACE_DIRS[type];
  sprite.position.set(d[0], d[1], d[2]);
  return sprite;
}

function initViewCube() {
  // Kubs ar gaišām skaldnēm un tumšām šķautnēm.
  const cubeGeo = new THREE.BoxGeometry(1.4, 1.4, 1.4);
  const cube = new THREE.Mesh(cubeGeo, new THREE.MeshBasicMaterial({ color: 0xf3e9d9 }));
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(cubeGeo),
    new THREE.LineBasicMaterial({ color: 0x2b1d0e })
  );
  viewCubeGroup.add(cube);
  viewCubeGroup.add(edges);

  // Seju etiķetes.
  Object.keys(FACE_DIRS).forEach((t) => {
    const s = makeFaceSprite(t);
    viewCubeGroup.add(s);
    interactiveObjects.push(s);
  });

  // Stūri (izo skati).
  const cornerGeo = new THREE.SphereGeometry(0.13, 12, 12);
  const cornerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  [-1, 1].forEach((sx) => [-1, 1].forEach((sy) => [-1, 1].forEach((sz) => {
    const c = new THREE.Mesh(cornerGeo, cornerMat);
    c.position.set(sx * 0.72, sy * 0.72, sz * 0.72);
    c.userData.dir = [sx, sy, sz];
    viewCubeGroup.add(c);
    interactiveObjects.push(c);
  })));

  // Centra mājas punkts.
  const home = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0x940fbd, transparent: true, depthTest: false, depthWrite: false })
  );
  home.renderOrder = 10;
  home.userData.home = true;
  viewCubeGroup.add(home);
  interactiveObjects.push(home);

  // Atsevišķs mazs canvas kuba zīmēšanai.
  const helperCanvas = document.createElement('canvas');
  helperCanvas.className = 'calc-view-cube-canvas';
  viewerEl.appendChild(helperCanvas);
  helperRenderer = new THREE.WebGLRenderer({ canvas: helperCanvas, antialias: true, alpha: true });
  helperRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  helperRenderer.setSize(HELPER_SIZE, HELPER_SIZE, false);

  helperCanvas.addEventListener('pointerdown', (event) => {
    const rect = helperCanvas.getBoundingClientRect();
    helperMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    helperMouse.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    helperRaycaster.setFromCamera(helperMouse, viewCubeCamera);
    const hits = helperRaycaster.intersectObjects(interactiveObjects);
    if (hits.length) {
      event.stopPropagation();
      handleViewCubeHit(hits[0].object);
    }
  });
}

function handleViewCubeHit(obj) {
  if (obj.userData.home) {
    flyToPos(HOME_POS, [0, 1, 0]);
  } else if (obj.userData.type) {
    flyToDir(FACE_DIRS[obj.userData.type], [0, 1, 0]);
  } else if (obj.userData.dir) {
    flyToDir(obj.userData.dir, [0, 1, 0]);
  }
}

function renderViewCube() {
  helperViewDir.subVectors(camera.position, controls.target).normalize();
  if (Math.hypot(helperViewDir.x, helperViewDir.z) < 0.01) helperViewDir.x = 0.01;
  viewCubeCamera.position.copy(helperViewDir).multiplyScalar(3);
  viewCubeCamera.lookAt(0, 0, 0);
  viewCubeCamera.updateMatrixWorld(true);
  if (helperRenderer) helperRenderer.render(viewCubeScene, viewCubeCamera);
}

function flyToDir(dir, up) {
  const v = new THREE.Vector3(dir[0], dir[1], dir[2]);
  if (v.lengthSq() < 1e-6) return;
  // Vienmēr centrē skatu uz objekta centru (oriģināli).
  controls.target.set(0, 0, 0);
  // Saglabā esošo attālumu (bez zoom efekta).
  const dist = camera.position.length() || VIEW_DIST;
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
  controls.target.set(0, 0, 0);
  const dist = camera.position.length() || VIEW_DIST;
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

// ---------- Pasūtījuma modāls ----------
function colorName(hex) {
  const c = PALETTE.find((x) => x.hex.toUpperCase() === hex.toUpperCase());
  return (c ? c.name : hex) + ' (' + hex.toUpperCase() + ')';
}

function buildOrderText(link) {
  const lines = ['3D drukas pasūtījums — 3dpakalpojumi.lv', ''];
  parts.forEach((p, i) => {
    const e = estimatePart(p);
    lines.push((i + 1) + '. ' + p.fileName);
    lines.push('   Izmēri: ' + formatDims(p.result));
    lines.push('   Krāsa: ' + colorName(p.color));
    lines.push('   Materiāls: ' + e.label);
    lines.push('   Daudzums: ' + p.quantity);
    lines.push('   Cena: ' + (e.total * p.quantity).toFixed(2) + ' €');
    lines.push('');
  });
  if (link) {
    lines.push('3D modeļa saite: ' + link);
    lines.push('');
  }
  const total = parts.reduce((s, p) => s + estimatePart(p).total * p.quantity, 0);
  lines.push('KOPĀ (bez PVN): ' + total.toFixed(2) + ' €');
  return lines.join('\n');
}

function renderOrderSummary() {
  const items = parts.map((p) => {
    const e = estimatePart(p);
    return '<div class="calc-order-item">' +
      '<div><strong>' + escapeHtml(p.fileName) + '</strong> · ×' + p.quantity + '</div>' +
      '<div>' + formatDims(p.result) + ' · ' + colorName(p.color) + ' · ' + e.label + '</div>' +
      '<div>' + (e.total * p.quantity).toFixed(2) + ' €</div>' +
      '</div>';
  }).join('');
  const total = parts.reduce((s, p) => s + estimatePart(p).total * p.quantity, 0);
  orderSummaryEl.innerHTML = items +
    '<div class="calc-order-total">Kopā: <strong>' + total.toFixed(2) + ' €</strong> <span>· bez PVN</span></div>';
}

function openOrderModal() {
  if (!parts.length) return;
  renderOrderSummary();
  orderModal.hidden = false;
  document.body.style.overflow = 'hidden';
  orderStatusEl.className = 'calc-form-status';
  orderStatusEl.textContent = '';
  orderForm.reset();
}

function closeOrderModal() {
  orderModal.hidden = true;
  document.body.style.overflow = '';
}

orderBtn.addEventListener('click', openOrderModal);
orderClose.addEventListener('click', closeOrderModal);
orderModal.addEventListener('click', (e) => {
  if (e.target === orderModal) closeOrderModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !orderModal.hidden) closeOrderModal();
});

orderForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData();
  fd.append('name', orderName.value.trim());
  fd.append('email', orderEmail.value.trim());
  fd.append('phone', orderPhone.value.trim());
  const link = orderLink.value.trim();
  fd.append('link', link);
  fd.append('message', orderMessage.value.trim());
  fd.append('order', buildOrderText(link));
  parts.forEach((p) => {
    if (p.file) fd.append('file', p.file, p.fileName);
  });

  orderSubmit.disabled = true;
  orderSubmit.textContent = 'Sūta…';
  orderStatusEl.className = 'calc-form-status';
  orderStatusEl.textContent = '';

  try {
    const res = await fetch(FORMSPREE_ENDPOINT, {
      method: 'POST',
      body: fd,
      headers: { 'Accept': 'application/json' }
    });
    if (res.ok) {
      orderStatusEl.className = 'calc-form-status ok';
      orderStatusEl.textContent = 'Paldies! Pasūtījums nosūtīts — atbildēsim 24h laikā.';
      orderForm.reset();
    } else {
      throw new Error('HTTP ' + res.status);
    }
  } catch (err) {
    orderStatusEl.className = 'calc-form-status err';
    orderStatusEl.textContent = 'Kļūda nosūtot. Raksti tieši: razosana@bratus.lv';
  }

  orderSubmit.disabled = false;
  orderSubmit.textContent = 'Nosūtīt pasūtījumu';
});

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
  zone.addEventListener('click', (e) => {
    // Ignorē klikšķus uz pogām, selectiem u.c. (lai tie paši neatvērtu failu izvēli).
    if (e.target.closest('button, select, input, a, label')) return;
    input.click();
  });
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      if (e.target.closest('button, select, input, a, label')) return;
      e.preventDefault();
      input.click();
    }
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
