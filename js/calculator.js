// js/calculator.js — interaktīvs 3D cenas kalkulators (cenas.html)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { computeBBox, computeVolume, computeSurfaceArea, sliceMesh, macroLayers, estimatePrint, PROFILES } from './slicer.js';

const LAYER_HEIGHT = 0.2;
const MAX_TRIANGLES_FOR_SLICE = 350000; // virs šī — makro aprēķins

const MATERIALS = {
  pla: { label: 'PLA', density: 1.24, price: 17 },
  petg: { label: 'PETG', density: 1.27, price: 17 },
  abs: { label: 'ABS', density: 1.04, price: 20 },
  tpu: { label: 'TPU', density: 1.21, price: 20 },
  pc: { label: 'PC', density: 1.20, price: 20 },
  nylon: { label: 'Nylon (PA)', density: 1.14, price: 20 },
  cf: { label: 'Carbon Fiber', density: 1.25, price: 20 }
};

const dropzone = document.getElementById('calc-dropzone');
const fileInput = document.getElementById('calc-file');
const viewerEl = document.getElementById('calc-viewer');
const hintEl = document.getElementById('calc-viewer-hint');
const resultsEl = document.getElementById('calc-results');
const materialSel = document.getElementById('calc-material');
const printerSel = document.getElementById('calc-printer');

if (!dropzone || !fileInput || !viewerEl || !resultsEl || !materialSel || !printerSel) {
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

scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.7);
keyLight.position.set(1, 1.6, 1);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xffffff, 0.45);
fillLight.position.set(-1, -0.5, -1);
scene.add(fillLight);

const displayMaterial = new THREE.MeshStandardMaterial({
  color: 0x940fbd,
  roughness: 0.55,
  metalness: 0.08,
  flatShading: true,
  side: THREE.DoubleSide
});

let modelGroup = null;

function clearModel() {
  if (modelGroup) {
    scene.remove(modelGroup);
    modelGroup.traverse((o) => {
      if (o.isMesh) {
        if (o.geometry) o.geometry.dispose();
        if (o.material && o.material !== displayMaterial) o.material.dispose();
      }
    });
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

renderer.setAnimationLoop(() => {
  controls.update();
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

// ---------- Modela ielāde un aprēķins ----------
async function handleFile(file) {
  if (!file) return;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (['stl', 'obj', '3mf'].indexOf(ext) === -1) {
    showError('Neatbalstīts formāts. Lūdzu izvēlies STL, OBJ vai 3MF failu.');
    return;
  }

  setStatus('Ielādē…');
  let object;
  try {
    if (ext === 'stl') {
      const buf = await file.arrayBuffer();
      object = new THREE.Mesh(new STLLoader().parse(buf), displayMaterial);
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
    lastResult = result;
    renderResults(result);
    setStatus(null);
  } catch (err) {
    showError('Aprēķina kļūda: ' + err.message);
  }
}

function analyze(object, fileName) {
  object.updateMatrixWorld(true);

  const geoms = [];
  object.traverse((o) => {
    if (o.isMesh && o.geometry) {
      o.material = displayMaterial;
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

  // Displejs: centrē un mērogo.
  clearModel();
  modelGroup = new THREE.Group();
  modelGroup.add(object);

  const sizeX = bbox.maxX - bbox.minX;
  const sizeY = bbox.maxY - bbox.minY;
  const sizeZ = bbox.maxZ - bbox.minZ;
  const maxDim = Math.max(sizeX, sizeY, sizeZ, 1e-6);
  const scale = 80 / maxDim;
  modelGroup.scale.setScalar(scale);
  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;
  const cz = (bbox.minZ + bbox.maxZ) / 2;
  modelGroup.position.set(-cx * scale, -cy * scale, -cz * scale);
  scene.add(modelGroup);
  controls.target.set(0, 0, 0);
  controls.update();

  // Sagriešana slāņos (laiks tiek rēķināts renderResults, jo atkarīgs no printera).
  let layers;
  let precise = true;
  if (triangleCount <= MAX_TRIANGLES_FOR_SLICE) {
    layers = sliceMesh(tris, LAYER_HEIGHT);
  } else {
    layers = macroLayers(tris, LAYER_HEIGHT);
    precise = false;
  }

  return {
    fileName: fileName,
    triangleCount: triangleCount,
    sizeX: sizeX,
    sizeY: sizeY,
    sizeZ: sizeZ,
    volumeMm3: volumeMm3,
    surfaceMm2: surfaceMm2,
    layers: layers,
    precise: precise
  };
}

// ---------- Rezultātu attēlošana ----------
function renderResults(r) {
  const mat = MATERIALS[materialSel.value] || MATERIALS.pla;
  const prof = PROFILES[printerSel.value] || PROFILES.p1s;
  const print = estimatePrint(r.layers, printerSel.value);

  const weightG = print.extrudedVolumeMm3 * mat.density * 0.001;
  const weightKg = weightG / 1000;
  const dims = [r.sizeX, r.sizeY, r.sizeZ]
    .sort((a, b) => b - a)
    .map((d) => d.toFixed(1))
    .join(' × ');

  const h = Math.floor(print.timeSeconds / 3600);
  const m = Math.floor((print.timeSeconds % 3600) / 60);
  const timeLabel = (h > 0 ? h + ' h ' : '') + m + ' min';

  const timeCost = print.hours * 3;        // 3 €/h
  const materialCost = weightKg * mat.price; // €/kg
  const processingCost = 10;                 // faila apstrāde
  const total = timeCost + materialCost + processingCost;

  const note = r.precise
    ? 'Aprēķins pēc slāņu sagriešanas (Bambu Studio 0.20mm Standard · 15% infill · ' + prof.label + ' profils).'
    : 'Liels modelis — aprēķins pēc tilpuma/virsmas (aptuvens).';

  resultsEl.innerHTML =
    '<div class="calc-price"><strong>' + total.toFixed(2) + '</strong> <small>€ <em>bez PVN</em></small></div>' +
    '<div class="calc-price-sub">Aptuvenais printēšanas laiks: <strong>' + timeLabel + '</strong></div>' +
    '<div class="calc-result-grid">' +
      stat('Izmēri', dims + ' mm') +
      stat('Detaļas tilpums', (r.volumeMm3 / 1000).toFixed(2) + ' cm³') +
      stat('Aptuvenais svars', weightG.toFixed(1) + ' g') +
      stat('Slāņu skaits', String(print.layerCount)) +
    '</div>' +
    '<div class="calc-breakdown">' +
      '<div class="calc-row"><span>Printēšana (' + prof.label + ', ' + timeLabel + ' × 3 €/h)</span><strong>' + timeCost.toFixed(2) + ' €</strong></div>' +
      '<div class="calc-row"><span>Materiāls (' + mat.label + ', ' + weightG.toFixed(1) + ' g × ' + mat.price + ' €/kg)</span><strong>' + materialCost.toFixed(2) + ' €</strong></div>' +
      '<div class="calc-row"><span>Faila apstrāde</span><strong>10.00 €</strong></div>' +
      '<div class="calc-row calc-row-total"><span>Kopā</span><strong>' + total.toFixed(2) + ' €</strong></div>' +
    '</div>' +
    '<p class="calc-note-min">Cena bez PVN · galīgā cena tiek precizēta pēc faila pārbaudes.</p>' +
    '<p class="calc-note">' + note + '</p>' +
    '<p class="calc-file-name">' + escapeHtml(r.fileName) + ' · ' +
      r.triangleCount.toLocaleString('lv-LV') + ' trijstūri</p>';
}

function stat(label, value) {
  return '<div class="calc-stat"><span class="calc-stat-label">' + label +
    '</span><strong>' + value + '</strong></div>';
}

function setStatus(text) {
  if (text) {
    hintEl.textContent = text;
    hintEl.style.display = 'flex';
  } else {
    hintEl.style.display = 'none';
  }
}

function showError(msg) {
  setStatus(null);
  resultsEl.innerHTML = '<div class="calc-err">' + escapeHtml(msg) + '</div>';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ---------- Notikumi ----------
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});
fileInput.addEventListener('change', () => {
  if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
});

['dragenter', 'dragover'].forEach((ev) => {
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('drag'); });
});
['dragleave', 'drop'].forEach((ev) => {
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove('drag'); });
});
dropzone.addEventListener('drop', (e) => {
  if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});

materialSel.addEventListener('change', () => {
  // Pārrēķina svaru, ja modelis jau ielādēts.
  const current = lastResult;
  if (current) renderResults(current);
});

printerSel.addEventListener('change', () => {
  // Pārrēķina laiku un cenu, ja modelis jau ielādēts.
  if (lastResult) renderResults(lastResult);
});

let lastResult = null;
