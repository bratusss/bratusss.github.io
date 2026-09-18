// js/slicer.js — tīra matemātika (bez ārējām atkarībām)
// Aprēķina tilpumu, virsmas laukumu, sagriež modeli slāņos un
// novērtē printēšanas laiku pēc Bambu Lab 0.20mm Standard profila.

export function computeBBox(tris) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < tris.length; i += 3) {
    const x = tris[i], y = tris[i + 1], z = tris[i + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

export function computeVolume(tris) {
  let v = 0;
  for (let i = 0; i < tris.length; i += 9) {
    const ax = tris[i], ay = tris[i + 1], az = tris[i + 2];
    const bx = tris[i + 3], by = tris[i + 4], bz = tris[i + 5];
    const cx = tris[i + 6], cy = tris[i + 7], cz = tris[i + 8];
    v += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  return Math.abs(v) / 6;
}

export function computeSurfaceArea(tris) {
  let area = 0;
  for (let i = 0; i < tris.length; i += 9) {
    const ax = tris[i], ay = tris[i + 1], az = tris[i + 2];
    const bx = tris[i + 3], by = tris[i + 4], bz = tris[i + 5];
    const cx = tris[i + 6], cy = tris[i + 7], cz = tris[i + 8];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    area += 0.5 * Math.sqrt(nx * nx + ny * ny + nz * nz);
  }
  return area;
}

// Trijstūra–plaknes krustpunkts gar vienu malu.
function addIntersect(tris, iA, iB, z, dA, dB, out) {
  if (dA === 0) { out.push([tris[iA], tris[iA + 1]]); return; }
  if (dB === 0) { out.push([tris[iB], tris[iB + 1]]); return; }
  if ((dA > 0 && dB > 0) || (dA < 0 && dB < 0)) return;
  const t = dA / (dA - dB);
  const x = tris[iA] + (tris[iB] - tris[iA]) * t;
  const y = tris[iA + 1] + (tris[iB + 1] - tris[iA + 1]) * t;
  out.push([x, y]);
}

// Saskaita šķērsgriezuma kontūru laukumus (chaining pēc gala punktiem).
function loopArea(segs) {
  const eps = 1e-4;
  const nodes = new Map();

  function key(x, y) { return Math.round(x / eps) + ',' + Math.round(y / eps); }
  function node(x, y) {
    const k = key(x, y);
    let n = nodes.get(k);
    if (!n) { n = { x: x, y: y, edges: [] }; nodes.set(k, n); }
    return n;
  }

  const edges = [];
  for (let s = 0; s < segs.length; s++) {
    const sg = segs[s];
    const n1 = node(sg[0], sg[1]);
    const n2 = node(sg[2], sg[3]);
    if (n1 === n2) continue;
    const e = { n1: n1, n2: n2, used: false };
    n1.edges.push(e);
    n2.edges.push(e);
    edges.push(e);
  }

  let totalArea = 0;
  for (let i = 0; i < edges.length; i++) {
    const e0 = edges[i];
    if (e0.used) continue;

    const pts = [];
    let cur = e0;
    let prevNode = e0.n1;
    const startNode = e0.n1;
    let guard = 0;

    while (cur && !cur.used && guard < edges.length + 2) {
      guard++;
      cur.used = true;
      const nextNode = cur.n1 === prevNode ? cur.n2 : cur.n1;
      pts.push([nextNode.x, nextNode.y]);
      if (nextNode === startNode) break;
      prevNode = nextNode;
      let next = null;
      for (let j = 0; j < nextNode.edges.length; j++) {
        if (!nextNode.edges[j].used) { next = nextNode.edges[j]; break; }
      }
      cur = next;
    }

    if (pts.length >= 3) {
      totalArea += Math.abs(shoelace(pts));
    }
  }
  return totalArea;
}

function shoelace(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

// Sagriež modeli slāņos. Atgriež [{z, perimeter, area}].
export function sliceMesh(tris, layerHeight) {
  const bbox = computeBBox(tris);
  const zmin = bbox.minZ;
  const zmax = bbox.maxZ;
  const nLayers = Math.max(1, Math.ceil((zmax - zmin) / layerHeight));
  const layers = [];

  for (let i = 0; i < nLayers; i++) {
    let z = zmin + (i + 0.5) * layerHeight;
    if (z > zmax) z = zmax;

    const segs = [];
    for (let t = 0; t < tris.length; t += 9) {
      const z0 = tris[t + 2], z1 = tris[t + 5], z2 = tris[t + 8];
      const d0 = z0 - z, d1 = z1 - z, d2 = z2 - z;
      const above = (d0 > 0 ? 1 : 0) + (d1 > 0 ? 1 : 0) + (d2 > 0 ? 1 : 0);
      if (above === 0 || above === 3) continue;

      const pts = [];
      addIntersect(tris, t, t + 3, z, d0, d1, pts);
      addIntersect(tris, t + 3, t + 6, z, d1, d2, pts);
      addIntersect(tris, t + 6, t, z, d2, d0, pts);

      if (pts.length === 2) {
        segs.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]]);
      } else if (pts.length > 2) {
        const uniq = [];
        for (let k = 0; k < pts.length; k++) {
          const p = pts[k];
          let dup = false;
          for (let m = 0; m < uniq.length; m++) {
            if (Math.hypot(uniq[m][0] - p[0], uniq[m][1] - p[1]) < 1e-6) { dup = true; break; }
          }
          if (!dup) uniq.push(p);
        }
        if (uniq.length >= 2) segs.push([uniq[0][0], uniq[0][1], uniq[1][0], uniq[1][1]]);
      }
    }

    let perimeter = 0;
    for (let s = 0; s < segs.length; s++) {
      const sg = segs[s];
      perimeter += Math.hypot(sg[2] - sg[0], sg[3] - sg[1]);
    }
    layers.push({ z: z, perimeter: perimeter, area: loopArea(segs) });
  }
  return layers;
}

// Makro aprēķins ļoti lieliem modeļiem (bez pilnas sagriešanas).
export function macroLayers(tris, layerHeight) {
  const V = computeVolume(tris);
  const A = computeSurfaceArea(tris);
  const bbox = computeBBox(tris);
  const H = Math.max(bbox.maxZ - bbox.minZ, 0.01);
  const n = Math.max(1, Math.ceil(H / layerHeight));
  const avgArea = V / H;
  const avgPerim = Math.max((A - 2 * avgArea) / H, 0);
  const layers = [];
  for (let i = 0; i < n; i++) layers.push({ z: 0, perimeter: avgPerim, area: avgArea });
  return layers;
}

// Kopējie slāņošanas parametri (Bambu Studio 0.20mm Standard, 0.4 mm sprausla).
const COMMON = {
  layerHeight: 0.2,     // mm
  lineWidth: 0.42,      // mm
  wallLoops: 2,         // ārējā + iekšējā siena
  infillDensity: 0.15,  // 15% aizpildījums
  bottomShell: 3,       // 3 cieti slāņi apakšā
  topShell: 3,          // 3 cieti slāņi augšā
  overheadPerLayer: 0.45, // s (pārvietošanās, z ass kustība, retract)
  startupTime: 300        // s (sagatavošanās: uzsilšana, homing, kalibrācija)
};

// Printeru ātrumu profili (efektīvie ātrumi, ņemot vērā paātrinājumu).
export const PROFILES = {
  a1mini: { label: 'A1 Mini', maxSpeed: 500,  maxAccel: 10000, speeds: { wall: 180, sparseInfill: 200, solidInfill: 180, firstLayer: 50 } },
  a2l:    { label: 'A2L',     maxSpeed: 500,  maxAccel: 10000, speeds: { wall: 180, sparseInfill: 200, solidInfill: 180, firstLayer: 50 } },
  p1s:    { label: 'P1S',     maxSpeed: 500,  maxAccel: 20000, speeds: { wall: 200, sparseInfill: 220, solidInfill: 200, firstLayer: 50 } },
  x2d:    { label: 'X2D',     maxSpeed: 1000, maxAccel: 20000, speeds: { wall: 250, sparseInfill: 280, solidInfill: 250, firstLayer: 50 } }
};

// Novērtē printēšanas laiku (cena tiek rēķināta kalkulatorā).
export function estimatePrint(layers, profileId) {
  const profile = PROFILES[profileId] || PROFILES.p1s;
  const speeds = profile.speeds;
  const n = layers.length;
  let time = COMMON.startupTime;
  let extrudedVolumeMm3 = 0;

  for (let i = 0; i < n; i++) {
    const layer = layers[i];
    const isFirst = i === 0;
    const isSolid = isFirst || i < COMMON.bottomShell || i >= n - COMMON.topShell;

    const perimeterPath = layer.perimeter * COMMON.wallLoops;
    const shellArea = layer.perimeter * COMMON.lineWidth * COMMON.wallLoops;
    const innerArea = Math.max(layer.area - shellArea, 0);

    const fillRatio = isSolid ? 1 : COMMON.infillDensity;
    const fillPath = (innerArea * fillRatio) / COMMON.lineWidth;

    const wallSpeed = isFirst ? speeds.firstLayer : speeds.wall;
    const fillSpeed = isFirst ? speeds.firstLayer
      : (isSolid ? speeds.solidInfill : speeds.sparseInfill);

    time += perimeterPath / wallSpeed + fillPath / fillSpeed + COMMON.overheadPerLayer;
    extrudedVolumeMm3 += (perimeterPath * COMMON.lineWidth + innerArea * fillRatio) * COMMON.layerHeight;
  }

  const hours = time / 3600;

  return {
    timeSeconds: time,
    hours: hours,
    extrudedVolumeMm3: extrudedVolumeMm3,
    layerCount: n
  };
}
