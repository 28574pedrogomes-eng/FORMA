import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Armchair, ArrowLeft, Check, ChevronDown, Copy, Crosshair, ExternalLink, Grid2X2, HelpCircle, Home, Lamp, Layers, Maximize2, Minus, Move3D, Plus, RotateCw, Ruler, Save, Search, ShoppingBag, Sofa, Trash2, X } from 'lucide-react';
import { api, money } from './api';
import { useStore } from './context';
import { ErrorNotice, Loading } from './ui';
import './room-planner.css';

const STORAGE_KEY = 'forma-room-projects-v1';
const DRAFT_KEY = 'forma-room-draft-v1';
const productModelLoader = new GLTFLoader();
const productModelCache = new Map();
const safeRead = () => { try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } };
const safeReadDraft = () => { try { const value = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); return value && typeof value === 'object' ? value : null; } catch { return null; } };
const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const kindOf = product => {
  const text = norm(`${product?.category_name || ''} ${product?.name || ''}`);
  if (/sofa|poltrona|cadeira|banco|banqueta/.test(text)) return 'seating';
  if (/almofada|manta|colcha|edredao|textil|tecido/.test(text)) return 'textile';
  if (/cama|colchao|cabeceira/.test(text)) return 'bed';
  if (/mesa e cozinha|caneca|chavena|copo|taca|prato|pires|servico/.test(text)) return 'tableware';
  if (/candeeiro|lampada|luz|iluminacao/.test(text)) return 'light';
  if (/mesa|secretaria|aparador|consola/.test(text)) return 'table';
  if (/estante|prateleira|armario|arrumacao|livro/.test(text)) return 'storage';
  if (/tapete|passadeira/.test(text)) return 'rug';
  if (/planta|vaso|jarr|decor|espelho|cesto|vela|castical|escultura|lanterna/.test(text)) return 'decor';
  return 'table';
};
const dimensions = product => {
  const kind = kindOf(product);
  const defaults = { seating: [190, 82, 82], table: [110, 68, 74], light: [42, 42, 100], storage: [105, 38, 105], rug: [160, 120, 3], textile: [45, 45, 9], bed: [180, 200, 48], decor: [26, 26, 34], tableware: [24, 24, 12] }[kind];
  const text = norm(`${product?.dimensions || ''} ${product?.description || ''}`);
  const number = '(\\d{1,3}(?:[.,]\\d+)?)';
  let parsed = null;
  const diameter = text.match(new RegExp(`(?:ø|diametro)\\s*${number}(?:\\s*[×x]\\s*${number})?\\s*cm`, 'i'));
  if (diameter) parsed = [Number(diameter[1].replace(',', '.')), Number(diameter[1].replace(',', '.')), diameter[2] ? Number(diameter[2].replace(',', '.')) : defaults[2]];
  const triple = !parsed && text.match(new RegExp(`${number}\\s*[×x]\\s*${number}\\s*[×x]\\s*${number}\\s*cm`, 'i'));
  const pair = !parsed && !triple && text.match(new RegExp(`${number}\\s*[×x]\\s*${number}\\s*cm`, 'i'));
  if (triple) parsed = triple.slice(1, 4).map(value => Number(value.replace(',', '.')));
  else if (pair) parsed = [Number(pair[1].replace(',', '.')), Number(pair[2].replace(',', '.')), defaults[2]];
  if (!parsed) {
    const plural = text.match(/alturas\s*:?\s*([\d.,\s e]+)\s*cm/i);
    if (plural) {
      const heights = plural[1].match(/\d+(?:[.,]\d+)?/g) || [];
      if (heights.length) {
        const height = Math.max(...heights.map(value => Number(value.replace(',', '.'))));
        parsed = [Math.min(60, Math.max(12, height * .33)), Math.min(60, Math.max(12, height * .30)), height];
      }
    }
  }
  if (!parsed) {
    const heights = [...text.matchAll(new RegExp(`altura(?:\\s+maxima)?s?\\s*:?\\s*${number}\\s*cm`, 'gi'))];
    if (heights.length) {
      const height = Number(heights.at(-1)[1].replace(',', '.'));
      parsed = [Math.min(60, Math.max(12, height * .33)), Math.min(60, Math.max(12, height * .30)), height];
    }
  }
  const width = Math.max(2, Number(product?.width_cm) || parsed?.[0] || defaults[0]);
  const depth = Math.max(2, Number(product?.depth_cm) || parsed?.[1] || defaults[1]);
  const height = Math.max(2, Number(product?.height_cm) || parsed?.[2] || defaults[2]);
  return { width, depth, height, kind };
};
const productSlug = name => norm(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const isSoftBlanket = product => kindOf(product) === 'textile' && /manta|colcha|edredao|cobertor|coberta|blanket/.test(norm(product?.name || ''));
function loadProductModel(product) {
  const url = new URL(`models/${productSlug(product.name)}.glb`, document.baseURI).href;
  if (!productModelCache.has(url)) productModelCache.set(url, productModelLoader.loadAsync(url).catch(error => { productModelCache.delete(url); throw error; }));
  return productModelCache.get(url).then(gltf => {
    const asset = gltf.scene.clone(true), { width, depth, height } = dimensions(product);
    asset.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = true; object.receiveShadow = true; object.userData.catalogAsset = true;
      object.material = Array.isArray(object.material) ? object.material.map(material => material.clone()) : object.material.clone();
    });
    const bounds = new THREE.Box3().setFromObject(asset), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    const scaleX = width / 100 / Math.max(.001, size.x), scaleY = height / 100 / Math.max(.001, size.y), scaleZ = depth / 100 / Math.max(.001, size.z);
    const model = new THREE.Group();
    asset.scale.set(scaleX, scaleY, scaleZ);
    asset.position.set(-center.x * scaleX, -bounds.min.y * scaleY, -center.z * scaleZ);
    model.add(asset);
    model.userData.productId = Number(product.id); model.userData.width = width / 100; model.userData.depth = depth / 100; model.userData.height = height / 100; model.userData.supportHeight = supportHeight(product) / 100; model.userData.kind = kindOf(product); model.userData.productName = product.name;
    model.traverse(object => { object.userData.productId = Number(product.id); });
    return model;
  });
}

function buildBlanketModel(product, savedState) {
  const { width, depth, height } = dimensions(product), w = width / 100, d = depth / 100;
  const columns = 27, rows = 33, count = columns * rows, positions = new Float32Array(count * 3), previous = new Float32Array(count * 3), uv = new Float32Array(count * 2), indices = [];
  const states = savedState?.positions?.length === positions.length && savedState?.previous?.length === previous.length;
  for (let row = 0; row < rows; row += 1) for (let col = 0; col < columns; col += 1) {
    const i = row * columns + col, u = col / (columns - 1), v = row / (rows - 1), p = i * 3;
    positions[p] = (u - .5) * w;
    positions[p + 1] = .052 + .018 * Math.sin(u * Math.PI * 8 + v * 5) * Math.sin(v * Math.PI * 2);
    positions[p + 2] = (v - .5) * d;
    uv[i * 2] = u; uv[i * 2 + 1] = 1 - v;
    if (col < columns - 1 && row < rows - 1) {
      const a = i, b = i + columns;
      indices.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  if (states) { positions.set(savedState.positions); previous.set(savedState.previous); }
  else previous.set(positions);
  const constraints = [];
  const link = (a, b, stiffness) => {
    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
    const bx = positions[b * 3], by = positions[b * 3 + 1], bz = positions[b * 3 + 2];
    constraints.push([a, b, Math.hypot(bx - ax, by - ay, bz - az), stiffness]);
  };
  for (let row = 0; row < rows; row += 1) for (let col = 0; col < columns; col += 1) {
    const i = row * columns + col;
    if (col < columns - 1) link(i, i + 1, .92);
    if (row < rows - 1) link(i, i + columns, .92);
    if (col < columns - 1 && row < rows - 1) { link(i, i + columns + 1, .55); link(i + 1, i + columns, .55); }
    if (col < columns - 2) link(i, i + 2, .24);
    if (row < rows - 2) link(i, i + columns * 2, .24);
  }
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d'), tones = ['#b8ad9c', '#8e998b', '#ad8979', '#9a8d7f'];
  const tone = tones[Math.abs(Number(product.id) || 0) % tones.length];
  ctx.fillStyle = tone; ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 32; i += 1) { ctx.strokeStyle = i % 4 === 0 ? 'rgba(255,255,255,.11)' : 'rgba(39,43,37,.035)'; ctx.lineWidth = i % 4 === 0 ? 2 : 1; ctx.beginPath(); ctx.moveTo(0, i * 16); ctx.lineTo(512, i * 16 + 5); ctx.stroke(); ctx.beginPath(); ctx.moveTo(i * 16, 0); ctx.lineTo(i * 16 + 3, 512); ctx.stroke(); }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: .96, side: THREE.DoubleSide });
  const cloth = new THREE.Mesh(geometry, material); cloth.name = 'Manta dinâmica'; cloth.castShadow = true; cloth.receiveShadow = true;
  const hemMaterial = new THREE.MeshStandardMaterial({ color: '#756b5f', roughness: .9 });
  const hem = new THREE.Group(), hemLines = [];
  for (const edge of [-1, 1]) {
    const points = [];
    for (let col = 0; col < columns; col += 1) { const p = (edge < 0 ? col : (rows - 1) * columns + col) * 3; points.push(new THREE.Vector3(positions[p], positions[p + 1] + .003, positions[p + 2])); }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#766d61' })); line.raycast = () => {}; hem.add(line); hemLines.push(line);
  }
  const group = new THREE.Group(); group.add(cloth, hem);
  cloth.userData.clothSurface = true;
  group.userData.clothSim = { columns, rows, positions, previous, constraints, hemLines, grabbedIndex: -1, grabTarget: new THREE.Vector3(), geometry, mesh: cloth };
  group.userData.productId = Number(product.id); group.userData.width = w; group.userData.depth = d; group.userData.height = height / 100; group.userData.supportHeight = supportHeight(product) / 100; group.userData.kind = 'textile'; group.userData.productName = product.name;
  group.traverse(object => { if (object.isMesh || object.isLine) object.userData.productId = Number(product.id); });
  return group;
}

function stepCloth(sim, dt) {
  const { positions: p, previous: old, constraints, grabbedIndex, grabTarget, columns, rows } = sim;
  const dt2 = dt * dt, damping = .992;
  for (let i = 0; i < columns * rows; i += 1) {
    const j = i * 3;
    if (i === grabbedIndex) { p[j] = grabTarget.x; p[j + 1] = grabTarget.y; p[j + 2] = grabTarget.z; old[j] = p[j]; old[j + 1] = p[j + 1]; old[j + 2] = p[j + 2]; continue; }
    const x = p[j], y = p[j + 1], z = p[j + 2];
    p[j] += (x - old[j]) * damping;
    p[j + 1] += (y - old[j + 1]) * damping - 9.81 * dt2;
    p[j + 2] += (z - old[j + 2]) * damping;
    old[j] = x; old[j + 1] = y; old[j + 2] = z;
    const floorY = sim.floorY ?? .028;
    if (p[j + 1] < floorY) { p[j + 1] = floorY; old[j + 1] = p[j + 1] + Math.max(0, old[j + 1] - y) * .08; }
  }
  for (let pass = 0; pass < 5; pass += 1) {
    for (const [a, b, rest, stiffness] of constraints) {
      const ai = a * 3, bi = b * 3, dx = p[bi] - p[ai], dy = p[bi + 1] - p[ai + 1], dz = p[bi + 2] - p[ai + 2];
      const distance = Math.hypot(dx, dy, dz) || .0001, correction = (distance - rest) / distance * stiffness;
      const aPinned = a === grabbedIndex, bPinned = b === grabbedIndex;
      if (!aPinned && !bPinned) { p[ai] += dx * correction * .5; p[ai + 1] += dy * correction * .5; p[ai + 2] += dz * correction * .5; p[bi] -= dx * correction * .5; p[bi + 1] -= dy * correction * .5; p[bi + 2] -= dz * correction * .5; }
      else if (aPinned) { p[bi] -= dx * correction; p[bi + 1] -= dy * correction; p[bi + 2] -= dz * correction; }
      else { p[ai] += dx * correction; p[ai + 1] += dy * correction; p[ai + 2] += dz * correction; }
    }
    for (let i = 0; i < columns * rows; i += 1) { const j = i * 3; if (i !== grabbedIndex && p[j + 1] < (sim.floorY ?? .028)) p[j + 1] = sim.floorY ?? .028; }
  }
  sim.geometry.attributes.position.needsUpdate = true; sim.geometry.computeVertexNormals();
  sim.hemLines?.forEach((line, edgeIndex) => {
    const attribute = line.geometry.attributes.position, row = edgeIndex === 0 ? 0 : rows - 1;
    for (let col = 0; col < columns; col += 1) { const source = (row * columns + col) * 3; attribute.setXYZ(col, p[source], p[source + 1] + .003, p[source + 2]); }
    attribute.needsUpdate = true; line.geometry.computeBoundingSphere();
  });
}

function snapshotCloth(sim) { return { positions: Array.from(sim.positions), previous: Array.from(sim.previous) }; }
function setModelSelection(group, instanceId, selectedId) {
  group.traverse(object => {
    if (!object.isMesh || !object.material?.emissive) return;
    if (object.userData.baseEmissive == null) object.userData.baseEmissive = object.material.emissive.getHex();
    object.material.emissive.setHex(instanceId === selectedId ? 0x334c38 : object.userData.baseEmissive);
    object.material.emissiveIntensity = instanceId === selectedId ? .16 : 0;
  });
}
function disposeModelGroup(group) {
  group.traverse(object => {
    if (object.geometry && !object.userData.catalogAsset) object.geometry.dispose();
    if (object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => { if (!object.userData.catalogAsset) material.map?.dispose(); material.dispose(); });
    }
  });
}
const makeUid = () => globalThis.crypto?.randomUUID?.() || `piece-${Date.now()}-${Math.random().toString(16).slice(2)}`;
function findOverlappingItems(items, products) {
  const overlaps = new Set();
  for (let i = 0; i < items.length; i += 1) for (let j = i + 1; j < items.length; j += 1) {
    const first = items[i], second = items[j];
    if (first.supportUid === second.uid || second.supportUid === first.uid) continue;
    const firstSize = dimensions(products.find(product => Number(product.id) === Number(first.productId)));
    const secondSize = dimensions(products.find(product => Number(product.id) === Number(second.productId)));
    const firstRotated = Number(first.rotation) % 180 !== 0, secondRotated = Number(second.rotation) % 180 !== 0;
    const firstWidth = firstRotated ? firstSize.depth : firstSize.width, firstDepth = firstRotated ? firstSize.width : firstSize.depth;
    const secondWidth = secondRotated ? secondSize.depth : secondSize.width, secondDepth = secondRotated ? secondSize.width : secondSize.depth;
    if (Math.abs(Number(first.x) - Number(second.x)) < (firstWidth + secondWidth) / 2 - 1 && Math.abs(Number(first.z) - Number(second.z)) < (firstDepth + secondDepth) / 2 - 1) { overlaps.add(first.uid); overlaps.add(second.uid); }
  }
  return overlaps;
}

function supportHeight(product) {
  const size = dimensions(product), name = norm(product?.name || '');
  if (size.kind === 'table') return /centro|cafe|lateral/.test(name) ? 43 : Math.min(82, size.height);
  if (size.kind === 'storage') return size.height;
  if (size.kind === 'bed') return Math.min(size.height, size.height * .82);
  return 0;
}

function findSupport(item, x, z, items, products) {
  const product = products.find(row => Number(row.id) === Number(item.productId));
  const kind = dimensions(product).kind;
  const stackable = ['decor', 'tableware', 'textile'].includes(kind) || (kind === 'light' && !/chao|pe|arco|suspens|aplique/.test(norm(product?.name || '')));
  if (!stackable) return null;
  return [...items].reverse().find(candidate => {
    if (candidate.uid === item.uid || candidate.supportUid === item.uid) return false;
    const base = products.find(row => Number(row.id) === Number(candidate.productId));
    const baseSize = dimensions(base), top = supportHeight(base);
    if (!top || !['table', 'storage', 'bed'].includes(baseSize.kind)) return false;
    const rotated = Number(candidate.rotation) % 180 !== 0;
    const bw = rotated ? baseSize.depth : baseSize.width, bd = rotated ? baseSize.width : baseSize.depth;
    return Number(candidate.elevation || 0) === 0 && Math.abs(x - Number(candidate.x)) <= bw * .46 && Math.abs(z - Number(candidate.z)) <= bd * .46;
  }) || null;
}

function woodTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
  const context = canvas.getContext('2d'); context.fillStyle = '#bd9b70'; context.fillRect(0, 0, 512, 512);
  for (let row = 0; row < 8; row += 1) {
    const y = row * 64; context.fillStyle = ['#c8a77d', '#b99469', '#d0b28a', '#bd9b70'][row % 4]; context.fillRect(0, y + 1, 512, 62);
    context.strokeStyle = 'rgba(87,59,34,.18)'; context.lineWidth = 2; context.beginPath(); context.moveTo(0, y + 63); context.lineTo(512, y + 63); context.stroke();
    for (let line = 0; line < 28; line += 1) { const start = Math.random() * 512; context.strokeStyle = `rgba(104,71,39,${Math.random() * .10 + .025})`; context.lineWidth = Math.random() * 1.5 + .4; context.beginPath(); context.moveTo(start, y + 4 + Math.random() * 52); context.bezierCurveTo(start + 28, y + 10, start + 45, y + 50, start + 95, y + 22 + Math.random() * 25); context.stroke(); }
    context.strokeStyle = 'rgba(75,49,27,.17)'; context.lineWidth = 1; context.beginPath(); context.moveTo((row % 2) * 130, y); context.lineTo((row % 2) * 130, y + 64); context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(2, 2); return texture;
}

function roundedBox(width, height, depth, material, radius = .035) {
  const bevel = Math.min(radius, width / 4, height / 4, depth / 4);
  const geometry = new RoundedBoxGeometry(width, height, depth, 3, bevel);
  const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
}

function buildModel(product) {
  const group = new THREE.Group();
  const { width: widthCm, depth: depthCm, kind } = dimensions(product); const w = widthCm / 100, d = depthCm / 100;
  const fabricTones = ['#9b978b', '#8e786a', '#737f76', '#b4a394'];
  const index = Math.abs(Number(product.id) || 0) % fabricTones.length;
  const fabric = new THREE.MeshStandardMaterial({ color: fabricTones[index], roughness: .9 });
  const wood = new THREE.MeshStandardMaterial({ color: ['#ba8e5b', '#9f7954', '#c6a174'][index % 3], roughness: .72 });
  const darkWood = new THREE.MeshStandardMaterial({ color: '#72563d', roughness: .65 });
  const cream = new THREE.MeshStandardMaterial({ color: '#ded4c5', roughness: .95 });
  const metal = new THREE.MeshStandardMaterial({ color: '#514b43', metalness: .38, roughness: .42 });
  const leaf = new THREE.MeshStandardMaterial({ color: '#687c58', roughness: .86 });
  const addBox = (x, y, z, sx, sy, sz, mat, radius) => { const mesh = roundedBox(sx, sy, sz, mat, radius); mesh.position.set(x, y, z); group.add(mesh); return mesh; };
  const addLeg = (x, z, height, mat = darkWood, radius = .024) => addBox(x, height / 2, z, radius * 2, height, radius * 2, mat, .008);

  if (kind === 'seating') {
    const seatH = .39, arm = Math.min(.16, w * .09), back = Math.min(.20, d * .25);
    addBox(0, .24, 0, w * .94, .34, d * .82, fabric, .08);
    addBox(0, seatH + back * .43, -d * .32, w * .90, back * 1.1, d * .19, fabric, .07);
    addBox(-w * .5 + arm * .5, .36, d * .02, arm, .48, d * .82, fabric, .055);
    addBox(w * .5 - arm * .5, .36, d * .02, arm, .48, d * .82, fabric, .055);
    const cushionCount = w > 1.45 ? 2 : 1; const cushionW = (w - arm * 2) / cushionCount;
    for (let i = 0; i < cushionCount; i += 1) addBox(-w / 2 + arm + cushionW * (i + .5), .45, d * .07, cushionW * .91, .12, d * .48, cream, .035);
    for (const x of [-w * .42, w * .42]) for (const z of [-d * .34, d * .34]) addLeg(x, z, .13, darkWood, .022);
  } else if (kind === 'table') {
    const topH = /mesa de centro|cafe|lateral/.test(norm(product.name)) ? .43 : .76;
    addBox(0, topH, 0, w * .94, .075, d * .92, wood, .025);
    for (const x of [-w * .38, w * .38]) for (const z of [-d * .36, d * .36]) addLeg(x, z, topH - .055, metal, .018);
  } else if (kind === 'light') {
    const floorLamp = /pe|chao|arco/.test(norm(product.name));
    if (floorLamp) { const base = new THREE.Mesh(new THREE.CylinderGeometry(.19, .22, .06, 32), metal); base.position.y = .03; base.castShadow = true; group.add(base); const stem = new THREE.Mesh(new THREE.CylinderGeometry(.025, .032, Math.max(.8, Math.min(1.45, w)), 16), metal); stem.position.y = stem.geometry.parameters.height / 2 + .06; group.add(stem); const shade = new THREE.Mesh(new THREE.CylinderGeometry(.12, .24, .22, 32, 1, true), cream); shade.position.y = stem.position.y + stem.geometry.parameters.height / 2 - .02; group.add(shade); }
    else { const base = new THREE.Mesh(new THREE.CylinderGeometry(.14, .18, .06, 24), metal); base.position.y = .03; group.add(base); const stand = new THREE.Mesh(new THREE.CylinderGeometry(.025, .04, .32, 16), metal); stand.position.y = .22; group.add(stand); const shade = new THREE.Mesh(new THREE.CylinderGeometry(.16, .25, .2, 32, 1, false), cream); shade.position.y = .46; group.add(shade); }
  } else if (kind === 'storage') {
    const height = /aparador|comoda|consola/.test(norm(product.name)) ? .82 : 1.65;
    addBox(0, height / 2, 0, w * .92, height, d * .84, wood, .035);
    addBox(0, height / 2, d * .425, w * .84, height * .91, .018, cream, .008);
    for (let i = 1; i < 4; i += 1) addBox(0, height * i / 4, d * .44, w * .82, .025, .025, darkWood, .006);
    addBox(0, height * .52, d * .46, .055, .055, .025, metal, .008);
    for (const x of [-w * .35, w * .35]) addLeg(x, 0, .10, darkWood, .018);
  } else if (kind === 'rug') {
    const rugMat = new THREE.MeshStandardMaterial({ color: ['#b9987a', '#899083', '#ad9d8a'][index % 3], roughness: 1 });
    const rug = new THREE.Mesh(new THREE.BoxGeometry(w * .98, .025, d * .98), rugMat); rug.position.y = .02; rug.receiveShadow = true; group.add(rug);
    const border = new THREE.Mesh(new THREE.BoxGeometry(w * .90, .027, d * .90), new THREE.MeshStandardMaterial({ color: '#d8cbbb', roughness: 1 })); border.position.y = .036; group.add(border);
  } else {
    if (/planta|vaso/.test(norm(product.name))) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(.16, .12, .36, 20), new THREE.MeshStandardMaterial({ color: '#b7795b', roughness: .86 })); pot.position.y = .18; pot.castShadow = true; group.add(pot);
      for (let i = 0; i < 7; i += 1) { const angle = i * Math.PI * 2 / 7; const stalk = new THREE.Mesh(new THREE.CylinderGeometry(.012, .018, .55, 8), leaf); stalk.position.set(Math.cos(angle) * .08, .58, Math.sin(angle) * .08); stalk.rotation.z = Math.cos(angle) * .28; stalk.rotation.x = Math.sin(angle) * .28; group.add(stalk); const blade = new THREE.Mesh(new THREE.SphereGeometry(.12, 12, 8), leaf); blade.scale.set(.55, 1.7, .5); blade.position.set(Math.cos(angle) * .19, .78 + (i % 3) * .08, Math.sin(angle) * .19); blade.rotation.z = Math.cos(angle) * .55; group.add(blade); }
    } else {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(w * .31, w * .35, .48, 28), cream); body.position.y = .25; body.castShadow = true; group.add(body);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(w * .30, w * .31, .04, 28), wood); top.position.y = .5; group.add(top);
    }
  }
  group.userData.productId = Number(product.id); group.userData.width = w; group.userData.depth = d; group.userData.height = dimensions(product).height / 100; group.userData.supportHeight = supportHeight(product) / 100; group.userData.kind = kind; group.userData.productName = product.name;
  group.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; child.userData.productId = Number(product.id); } });
  return group;
}

function addRoom(scene, widthCm, depthCm) {
  const w = Math.max(1, Number(widthCm) || 400) / 100, d = Math.max(1, Number(depthCm) || 350) / 100, h = 2.65;
  const wood = woodTexture();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: '#eef1ef', roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -.035; ground.receiveShadow = true; scene.add(ground);
  const grid = new THREE.GridHelper(80, 160, '#b9c7cf', '#d5dfe3'); grid.position.y = -.02; grid.material.opacity = .42; grid.material.transparent = true; scene.add(grid);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: wood, roughness: .82 })); floor.rotation.x = -Math.PI / 2; floor.position.y = .008; floor.receiveShadow = true; floor.userData.roomFloor = true; scene.add(floor);
  const plaster = new THREE.MeshStandardMaterial({ color: '#f5f3ed', roughness: .92, side: THREE.DoubleSide });
  const wallBack = new THREE.Mesh(new THREE.BoxGeometry(w + .10, h, .10), plaster); wallBack.position.set(0, h / 2, -d / 2); wallBack.castShadow = true; wallBack.receiveShadow = true; scene.add(wallBack);
  const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(.10, h, d), plaster); wallLeft.position.set(-w / 2, h / 2, 0); wallLeft.castShadow = true; wallLeft.receiveShadow = true; scene.add(wallLeft);
  const wallRight = new THREE.Mesh(new THREE.BoxGeometry(.10, h, d), plaster); wallRight.position.set(w / 2, h / 2, 0); wallRight.castShadow = true; wallRight.receiveShadow = true; scene.add(wallRight);
  const trimMat = new THREE.MeshStandardMaterial({ color: '#ddd7cc', roughness: .8 });
  for (const x of [-w / 2 + .04, w / 2 - .04]) { const trim = new THREE.Mesh(new THREE.BoxGeometry(.045, .12, d - .05), trimMat); trim.position.set(x, .09, 0); scene.add(trim); }
  const backTrim = new THREE.Mesh(new THREE.BoxGeometry(w, .12, .045), trimMat); backTrim.position.set(0, .09, -d / 2 + .04); scene.add(backTrim);
  // Softly framed window on the back wall gives the room a clear scale and focal point.
  const winW = Math.min(1.55, w * .48), winH = 1.05, winY = 1.55, winZ = -d / 2 + .058;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), new THREE.MeshBasicMaterial({ color: '#b7d9e9' })); glass.position.set(0, winY, winZ); scene.add(glass);
  const frameMat = new THREE.MeshStandardMaterial({ color: '#c4bfb5', roughness: .72 });
  for (const [x, y, sx, sy] of [[0, winY + winH / 2, winW + .10, .045], [0, winY - winH / 2, winW + .10, .045], [-winW / 2, winY, .045, winH], [winW / 2, winY, .045, winH], [0, winY, .03, winH]]) { const frame = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, .045), frameMat); frame.position.set(x, y, winZ - .02); scene.add(frame); }
  return { width: w, depth: d, height: h };
}

function RoomViewport({ width, depth, products, items, selectedId, onSelect, onMove, mode, zoom, onZoom, cameraResetKey }) {
  const mountRef = useRef(null), sceneRef = useRef(null), cameraRef = useRef(null), rendererRef = useRef(null), controlsRef = useRef(null), groupsRef = useRef(new Map()), clothStatesRef = useRef(new Map()), dragRef = useRef(null), propsRef = useRef({});
  propsRef.current = { items, products, selectedId, onSelect, onMove, width, depth, mode, onZoom };
  const rememberCloth = () => { for (const [id, group] of groupsRef.current) if (group.userData.clothSim) clothStatesRef.current.set(id, snapshotCloth(group.userData.clothSim)); };

  useEffect(() => {
    if (mode === '2d') return undefined;
    const mount = mountRef.current; if (!mount) return undefined;
    let renderer, controls, camera, scene, frame = 0, roomSize;
    try {
      scene = new THREE.Scene(); scene.background = new THREE.Color('#b8d7f2'); scene.fog = new THREE.Fog('#dbe6eb', 18, 45);
      const hemi = new THREE.HemisphereLight('#ffffff', '#b5a993', 2.05); scene.add(hemi);
      const sun = new THREE.DirectionalLight('#fff7e9', 3.1); sun.position.set(-4, 8, 5); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -12; sun.shadow.camera.right = 12; sun.shadow.camera.top = 12; sun.shadow.camera.bottom = -12; sun.shadow.bias = -.00025; scene.add(sun);
      roomSize = addRoom(scene, width, depth);
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' }); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6)); renderer.setSize(mount.clientWidth, mount.clientHeight); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1; renderer.domElement.className = 'room-three-canvas'; renderer.setClearColor('#b8d7f2'); mount.appendChild(renderer.domElement);
      if (mode === '2d') {
        const aspect = mount.clientWidth / Math.max(1, mount.clientHeight), size = Math.max(roomSize.width, roomSize.depth) * 1.20;
        camera = new THREE.OrthographicCamera(-size * aspect / 2, size * aspect / 2, size / 2, -size / 2, .1, 100); camera.up.set(0, 0, -1); camera.position.set(0, 18, .001); camera.lookAt(0, 0, 0);
      } else {
        camera = new THREE.PerspectiveCamera(42, mount.clientWidth / Math.max(1, mount.clientHeight), .1, 100);
        const radius = Math.max(roomSize.width, roomSize.depth); camera.position.set(radius * .62, radius * .98, radius * 1.78); camera.lookAt(0, 1.05, 0);
      }
      sceneRef.current = scene; cameraRef.current = camera; rendererRef.current = renderer;
      controls = new OrbitControls(camera, renderer.domElement); controls.target.set(0, mode === '2d' ? 0 : .95, 0); controls.enableDamping = true; controls.dampingFactor = .07; controls.enableRotate = mode === '3d'; controls.enablePan = true; controls.minDistance = 2.8; controls.maxDistance = 18; controls.maxPolarAngle = mode === '2d' ? .001 : Math.PI * .47; controls.minPolarAngle = mode === '2d' ? .001 : .16; controlsRef.current = controls;
      const resize = () => { if (!mount.clientWidth || !mount.clientHeight) return; renderer.setSize(mount.clientWidth, mount.clientHeight); camera.aspect = mount.clientWidth / mount.clientHeight; if (camera.isOrthographicCamera) { const aspect = camera.aspect, size = Math.max(roomSize.width, roomSize.depth) * 1.20; camera.left = -size * aspect / 2; camera.right = size * aspect / 2; camera.top = size / 2; camera.bottom = -size / 2; } camera.updateProjectionMatrix(); };
      const observer = new ResizeObserver(resize); observer.observe(mount);
      const animate = () => { frame = requestAnimationFrame(animate); controls.update(); for (const group of groupsRef.current.values()) if (group.userData.clothSim) { stepCloth(group.userData.clothSim, 1 / 60); stepCloth(group.userData.clothSim, 1 / 60); } renderer.render(scene, camera); }; animate();
      const pointer = new THREE.Vector2(), ray = new THREE.Raycaster(), floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3(); ray.params.Line.threshold = .01;
      const coords = event => { const rect = renderer.domElement.getBoundingClientRect(); pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1); ray.setFromCamera(pointer, camera); };
      const down = event => {
        if (event.button !== 0) return; coords(event);
        const targets = [...groupsRef.current.values()]; const intersections = ray.intersectObjects(targets, true);
        if (!intersections.length) { propsRef.current.onSelect(null); return; }
        const hitId = intersections[0].object.userData.instanceId; const hitItem = propsRef.current.items.find(item => item.uid === hitId); const selectedItem = propsRef.current.items.find(item => item.uid === propsRef.current.selectedId); const instanceId = selectedItem && hitItem?.supportUid === selectedItem.uid ? selectedItem.uid : hitId; const group = groupsRef.current.get(instanceId); const productId = group?.userData.productId; const product = propsRef.current.products.find(p => Number(p.id) === Number(productId));
        if (!group || !product) return; propsRef.current.onSelect(instanceId);
        controls.enabled = false;
        const cloth = group.userData.clothSim; let clothIndex = -1;
        let grabPlaneY = Number(group.position.y) || 0;
        if (cloth && intersections[0].object.userData.clothSurface) {
          const localHit = group.worldToLocal(intersections[0].point.clone()); let nearest = Infinity;
          for (let i = 0; i < cloth.columns * cloth.rows; i += 1) { const j = i * 3, distance = (cloth.positions[j] - localHit.x) ** 2 + (cloth.positions[j + 1] - localHit.y) ** 2 + (cloth.positions[j + 2] - localHit.z) ** 2; if (distance < nearest) { nearest = distance; clothIndex = i; } }
          if (clothIndex >= 0) { const j = clothIndex * 3; cloth.grabbedIndex = clothIndex; cloth.grabTarget.set(cloth.positions[j], cloth.positions[j + 1], cloth.positions[j + 2]); grabPlaneY += cloth.positions[j + 1]; }
        }
        const grabPlane = clothIndex >= 0 ? new THREE.Plane(new THREE.Vector3(0, 1, 0), -grabPlaneY) : floorPlane;
        if (!ray.ray.intersectPlane(grabPlane, hit)) { if (clothIndex >= 0) cloth.grabbedIndex = -1; controls.enabled = true; return; }
        const screenRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0); screenRight.y = 0; screenRight.normalize();
        const horizontalWorldPerPixel = camera.isPerspectiveCamera ? 2 * camera.position.distanceTo(controls.target) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / renderer.domElement.clientHeight : (camera.top - camera.bottom) / renderer.domElement.clientHeight;
        dragRef.current = { instanceId, productId: Number(productId), group, cloth, clothIndex, clothStartY: clothIndex >= 0 ? cloth.positions[clothIndex * 3 + 1] : 0, grabPlaneY, screenRight, horizontalWorldPerPixel, startGroupX: group.position.x, startGroupZ: group.position.z, offsetX: group.position.x - hit.x, offsetZ: group.position.z - hit.z, startX: event.clientX, startY: event.clientY, moved: false }; renderer.domElement.setPointerCapture?.(event.pointerId); event.preventDefault();
      };
      const move = event => { const drag = dragRef.current; if (!drag) return; coords(event); const lift = drag.clothIndex >= 0 ? Math.max(-.02, (drag.startY - event.clientY) * .009) : 0; if (drag.clothIndex < 0 && !ray.ray.intersectPlane(floorPlane, hit)) return; const d = dimensions(propsRef.current.products.find(p => Number(p.id) === drag.productId)); const roomW = Number(propsRef.current.width) / 100, roomD = Number(propsRef.current.depth) / 100; const rotated = ((propsRef.current.items.find(item => item.uid === drag.instanceId)?.rotation || 0) % 180) !== 0; const fw = (rotated ? d.depth : d.width) / 100, fd = (rotated ? d.width : d.depth) / 100; const dx = event.clientX - drag.startX; const desiredX = drag.clothIndex >= 0 ? drag.startGroupX + dx * drag.horizontalWorldPerPixel * drag.screenRight.x : hit.x + drag.offsetX; const desiredZ = drag.clothIndex >= 0 ? drag.startGroupZ + dx * drag.horizontalWorldPerPixel * drag.screenRight.z : hit.z + drag.offsetZ; const x = THREE.MathUtils.clamp(desiredX, -roomW / 2 + fw / 2, roomW / 2 - fw / 2), z = THREE.MathUtils.clamp(desiredZ, -roomD / 2 + fd / 2, roomD / 2 - fd / 2); drag.group.position.x = x; drag.group.position.z = z; const item = propsRef.current.items.find(row => row.uid === drag.instanceId); const support = item && findSupport(item, Math.round((x + roomW / 2) * 100), Math.round((z + roomD / 2) * 100), propsRef.current.items, propsRef.current.products); drag.group.position.y = support ? supportHeight(propsRef.current.products.find(p => Number(p.id) === Number(support.productId))) / 100 : 0; drag.supportUid = support?.uid || null; drag.elevation = support ? supportHeight(propsRef.current.products.find(p => Number(p.id) === Number(support.productId))) : 0; if (drag.clothIndex >= 0) drag.cloth.grabTarget.y = Math.max(drag.cloth.floorY ?? .028, drag.clothStartY + lift); drag.moved ||= Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4; };
      const up = () => { const drag = dragRef.current; if (!drag) return; dragRef.current = null; if (drag.clothIndex >= 0) { drag.cloth.grabbedIndex = -1; clothStatesRef.current.set(drag.instanceId, snapshotCloth(drag.cloth)); } controls.enabled = true; if (drag.moved) propsRef.current.onMove(drag.instanceId, Math.round((drag.group.position.x + Number(propsRef.current.width) / 200) * 100), Math.round((drag.group.position.z + Number(propsRef.current.depth) / 200) * 100), drag.elevation || 0, drag.supportUid || null); };
      renderer.domElement.addEventListener('pointerdown', down); renderer.domElement.addEventListener('pointermove', move); renderer.domElement.addEventListener('pointerup', up); renderer.domElement.addEventListener('pointercancel', up);
      renderer.domElement.addEventListener('wheel', event => { if (event.ctrlKey || event.metaKey) { event.preventDefault(); const next = THREE.MathUtils.clamp((propsRef.current.zoom || 1) + (event.deltaY < 0 ? .08 : -.08), .65, 1.8); propsRef.current.onZoom(next); } }, { passive: false });
      mount._cleanup = () => { rememberCloth(); cancelAnimationFrame(frame); observer.disconnect(); controls.dispose(); renderer.domElement.removeEventListener('pointerdown', down); renderer.domElement.removeEventListener('pointermove', move); renderer.domElement.removeEventListener('pointerup', up); renderer.domElement.removeEventListener('pointercancel', up); scene.traverse(obj => { if (obj.geometry && !obj.userData.catalogAsset) obj.geometry.dispose(); if (obj.material) { const materials = Array.isArray(obj.material) ? obj.material : [obj.material]; materials.forEach(mat => { if (!obj.userData.catalogAsset) mat.map?.dispose(); mat.dispose(); }); } }); renderer.dispose(); renderer.domElement.remove(); };
    } catch (error) { mount.dataset.webglError = error.message; }
    return () => { mount._cleanup?.(); sceneRef.current = null; cameraRef.current = null; controlsRef.current = null; rendererRef.current = null; groupsRef.current.clear(); };
  }, [width, depth, mode]);

  useEffect(() => {
    const scene = sceneRef.current; if (!scene) return;
    let active = true;
    rememberCloth();
    for (const group of groupsRef.current.values()) { scene.remove(group); disposeModelGroup(group); }
    groupsRef.current.clear();
    const roomW = Number(width) / 100, roomD = Number(depth) / 100;
    items.forEach(item => {
      const product = products.find(p => Number(p.id) === Number(item.productId)); if (!product) return;
      const id = item.uid || `piece-${item.productId}`, group = isSoftBlanket(product) ? buildBlanketModel(product, clothStatesRef.current.get(id)) : buildModel(product);
      if (group.userData.clothSim) group.userData.clothSim.floorY = Number(item.elevation || 0) > 0 ? .006 : .028;
      group.position.set(Number(item.x) / 100 - roomW / 2, Number(item.elevation || 0) / 100, Number(item.z) / 100 - roomD / 2); group.rotation.y = THREE.MathUtils.degToRad(Number(item.rotation) || 0);
      group.userData.instanceId = id;
      group.traverse(object => { object.userData.instanceId = id; });
      scene.add(group); groupsRef.current.set(id, group);
      if (isSoftBlanket(product)) return;
      loadProductModel(product).then(model => {
        if (!active || sceneRef.current !== scene || groupsRef.current.get(id) !== group) { disposeModelGroup(model); return; }
        model.position.copy(group.position); model.rotation.copy(group.rotation); model.userData.instanceId = id;
        model.traverse(object => { object.userData.instanceId = id; });
        scene.remove(group); disposeModelGroup(group); scene.add(model); groupsRef.current.set(id, model);
        setModelSelection(model, id, propsRef.current.selectedId);
      }).catch(() => { /* Fica o modelo de reserva se o GLB não estiver disponível. */ });
    });
    if (cameraRef.current) { cameraRef.current.zoom = zoom; cameraRef.current.updateProjectionMatrix(); }
    return () => {
      active = false;
      rememberCloth();
      for (const group of groupsRef.current.values()) { scene.remove(group); disposeModelGroup(group); }
      groupsRef.current.clear();
    };
  }, [items, products, width, depth, zoom, mode]);

  useEffect(() => {
    for (const [id, group] of groupsRef.current) setModelSelection(group, id, selectedId);
  }, [selectedId, items, products]);

  useEffect(() => { controlsRef.current?.reset(); }, [cameraResetKey, mode]);

  if (mode === '2d') return <RoomPlan2D width={width} depth={depth} products={products} items={items} selectedId={selectedId} onSelect={onSelect} onMove={onMove} zoom={zoom} />;
  return <div className="room-viewport" ref={mountRef} role="application" aria-label="Vista 3D interativa da divisão. Arrasta os móveis para os posicionar.">
    <div className="room-size-tags" aria-hidden="true"><span><i />{width} cm</span><span>{depth} cm<i /></span>
    </div>
  </div>;
}

function RoomPlan2D({ width, depth, products, items, selectedId, onSelect, onMove, zoom }) {
  const svgRef = useRef(null), dragRef = useRef(null);
  const w = Number(width) || 400, d = Number(depth) || 350, padding = Math.max(42, Math.min(72, Math.min(w, d) * .16));
  const viewWidth = (w + padding * 2) / (Number(zoom) || 1), viewHeight = (d + padding * 2) / (Number(zoom) || 1);
  const viewBox = `${(w - viewWidth) / 2} ${(d - viewHeight) / 2} ${viewWidth} ${viewHeight}`;
  const point = event => {
    const svg = svgRef.current, matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const p = svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY;
    const local = p.matrixTransform(matrix.inverse());
    return { x: local.x, z: local.y };
  };
  const move = event => {
    const drag = dragRef.current; if (!drag) return;
    const p = point(event); if (!p) return;
    const item = items.find(row => row.uid === drag.uid); const product = products.find(row => Number(row.id) === Number(item?.productId));
    if (!item || !product) return;
    const size = dimensions(product), rotated = Number(item.rotation) % 180 !== 0;
    const iw = rotated ? size.depth : size.width, id = rotated ? size.width : size.depth;
    const x = Math.max(iw / 2, Math.min(w - iw / 2, p.x - drag.offsetX));
    const z = Math.max(id / 2, Math.min(d - id / 2, p.z - drag.offsetZ));
    onMove(item.uid, x, z);
  };
  const start = (event, item, product) => {
    if (event.button !== 0) return;
    const p = point(event); if (!p) return;
    event.stopPropagation(); event.preventDefault();
    onSelect(item.uid);
    dragRef.current = { uid: item.uid, offsetX: p.x - Number(item.x), offsetZ: p.z - Number(item.z) };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const end = () => { dragRef.current = null; };
  const grid = Math.max(10, Math.round(Math.min(w, d) / 24 / 5) * 5);
  const overlapIds = findOverlappingItems(items, products);
  return <div className="room-plan-viewport" role="application" aria-label="Planta 2D à escala. Arrasta as peças para as posicionar.">
    <svg ref={svgRef} className="room-plan-svg" viewBox={viewBox} preserveAspectRatio="xMidYMid meet" onPointerMove={move} onPointerUp={end} onPointerCancel={end} onClick={event => { if (!event.target.closest?.('.room-plan-piece')) onSelect(null); }}>
      <defs>
        <pattern id="planner-grid-minor" width={grid} height={grid} patternUnits="userSpaceOnUse"><path d={`M ${grid} 0 L 0 0 0 ${grid}`} fill="none" stroke="#dce2da" strokeWidth=".8" vectorEffect="non-scaling-stroke" /></pattern>
        <pattern id="planner-grid-major" width={grid * 5} height={grid * 5} patternUnits="userSpaceOnUse"><rect width={grid * 5} height={grid * 5} fill="url(#planner-grid-minor)"/><path d={`M ${grid * 5} 0 L 0 0 0 ${grid * 5}`} fill="none" stroke="#c8d1c7" strokeWidth="1.2" vectorEffect="non-scaling-stroke" /></pattern>
        <filter id="planner-piece-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#243329" floodOpacity=".13" /></filter>
      </defs>
      <rect x={-padding} y={-padding} width={w + padding * 2} height={d + padding * 2} fill="#edf1ed" />
      <rect x={0} y={0} width={w} height={d} rx="2" fill="#e9e2d5" />
      <rect x={0} y={0} width={w} height={d} fill="url(#planner-grid-major)" />
      <rect x={1.5} y={1.5} width={w - 3} height={d - 3} fill="none" stroke="#fffdf8" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      <rect x={0} y={0} width={w} height={d} fill="none" stroke="#35483a" strokeWidth="5" vectorEffect="non-scaling-stroke" />
      <g className="room-plan-window" aria-hidden="true"><line x1={w * .34} x2={w * .66} y1="0" y2="0" stroke="#edf1ed" strokeWidth="8" vectorEffect="non-scaling-stroke"/><line x1={w * .34} x2={w * .66} y1="-2" y2="-2" stroke="#9bbdc0" strokeWidth="2" vectorEffect="non-scaling-stroke"/><line x1={w * .34} x2={w * .66} y1="2" y2="2" stroke="#9bbdc0" strokeWidth="2" vectorEffect="non-scaling-stroke"/></g>
      {items.map(item => {
        const product = products.find(row => Number(row.id) === Number(item.productId)); if (!product) return null;
        const size = dimensions(product), rotated = Number(item.rotation) % 180 !== 0, iw = rotated ? size.depth : size.width, id = rotated ? size.width : size.depth;
        const isSelected = item.uid === selectedId, kind = size.kind;
        const fill = kind === 'seating' ? '#879487' : kind === 'bed' ? '#a89988' : kind === 'table' ? '#b58f66' : kind === 'rug' ? '#c6ae8b' : kind === 'storage' ? '#a88969' : kind === 'light' ? '#d5c49d' : '#a4a78e';
        const overlaps = overlapIds.has(item.uid);
        const support = items.find(row => row.uid === item.supportUid);
        const supportProduct = support && products.find(row => Number(row.id) === Number(support.productId));
        const selectedSupport = items.find(row => row.uid === selectedId && item.supportUid === row.uid);
        return <g key={item.uid} data-support-uid={item.supportUid || ''} data-elevation={item.elevation || 0} className={`room-plan-piece${isSelected ? ' is-selected' : ''}${overlaps ? ' is-overlapping' : ''}${support ? ' is-stacked' : ''}`} style={selectedSupport ? { pointerEvents: 'none' } : undefined} transform={`translate(${item.x} ${item.z}) rotate(${Number(item.rotation) || 0})`} onPointerDown={event => start(event, item, product)} onClick={event => { event.stopPropagation(); onSelect(item.uid); }} role="button" aria-label={`${product.name}, ${size.width} por ${size.depth} centímetros${support ? `, sobre ${supportProduct?.name || 'outra peça'}` : overlaps ? ', sobreposta a outra peça' : ''}`} aria-pressed={isSelected} tabIndex="0" onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(item.uid); } else if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) { event.preventDefault(); const delta = event.key === 'ArrowLeft' ? [-grid,0] : event.key === 'ArrowRight' ? [grid,0] : event.key === 'ArrowUp' ? [0,-grid] : [0,grid]; onSelect(item.uid); onMove(item.uid,Number(item.x)+delta[0],Number(item.z)+delta[1]); } }}>
          <rect className="room-plan-hit-area" x={-size.width / 2 - 2} y={-size.depth / 2 - 2} width={size.width + 4} height={size.depth + 4} rx={Math.min(12, size.depth * .08)} fill="transparent" />
          <g filter="url(#planner-piece-shadow)">
            <rect x={-size.width / 2} y={-size.depth / 2} width={size.width} height={size.depth} rx={kind === 'rug' ? 2 : Math.min(10, size.depth * .09)} fill={fill} stroke={isSelected ? '#344b38' : '#6e786e'} strokeWidth={isSelected ? 3 : 1.5} vectorEffect="non-scaling-stroke" />
            {kind === 'seating' && <><rect x={-size.width * .43} y={-size.depth * .34} width={size.width * .86} height={size.depth * .55} rx={6} fill="#c9d0c4" stroke="#748074" strokeWidth="1.4" vectorEffect="non-scaling-stroke"/><line x1={-size.width * .45} x2={size.width * .45} y1={size.depth * .3} y2={size.depth * .3} stroke="#56665a" strokeWidth="2" vectorEffect="non-scaling-stroke"/></>}
            {kind === 'bed' && <><rect x={-size.width * .43} y={-size.depth * .42} width={size.width * .86} height={size.depth * .77} rx={5} fill="#f4efe6" stroke="#8d8070" strokeWidth="1.2" vectorEffect="non-scaling-stroke"/><line x1={0} x2={0} y1={-size.depth * .42} y2={size.depth * .35} stroke="#c2b6a5" strokeWidth="1.2" vectorEffect="non-scaling-stroke"/></>}
            {kind === 'table' && <><rect x={-size.width * .4} y={-size.depth * .37} width={size.width * .8} height={size.depth * .74} rx={kind === 'table' ? 3 : 8} fill="#c8a47a" stroke="#90734f" strokeWidth="1.2" vectorEffect="non-scaling-stroke"/><circle cx={0} cy={0} r={Math.max(2, Math.min(size.width, size.depth) * .025)} fill="#876849"/></>}
            {kind === 'storage' && <><line x1={-size.width * .4} x2={size.width * .4} y1={-size.depth * .17} y2={-size.depth * .17} stroke="#745b43" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/><line x1={-size.width * .4} x2={size.width * .4} y1={size.depth * .17} y2={size.depth * .17} stroke="#745b43" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/></>}
          </g>
          <text className="room-plan-label" x="0" y={size.depth / 2 + 14} textAnchor="middle" pointerEvents="none">{product.name}</text>
          {support && <g className="room-plan-stack-mark" aria-hidden="true"><circle cx={size.width / 2 - 9} cy={-size.depth / 2 + 9} r="8"/><text x={size.width / 2 - 9} y={-size.depth / 2 + 12} textAnchor="middle">↑</text><title>Sobre {supportProduct?.name}</title></g>}
        </g>;
      })}
    </svg>
    <div className={`room-plan-key${overlapIds.size ? ' has-overlaps' : ''}`} role={overlapIds.size ? 'status' : undefined}><span><i className="room-plan-key-wall"/>Parede</span><span>{overlapIds.size ? `${overlapIds.size} peças sobrepostas` : `${items.length} ${items.length === 1 ? 'peça' : 'peças'}`}</span></div>
  </div>;
}

const categories = [
  { key: 'all', label: 'Tudo', icon: Grid2X2 }, { key: 'seating', label: 'Sofás e cadeiras', icon: Sofa },
  { key: 'table', label: 'Mesas', icon: Armchair }, { key: 'light', label: 'Iluminação', icon: Lamp },
  { key: 'storage', label: 'Arrumação', icon: Home }, { key: 'rug', label: 'Tapetes', icon: Grid2X2 },
];

export function RoomPlanner({ onProduct }) {
  const [draft] = useState(safeReadDraft);
  const { addToCart, setCartOpen } = useStore();
  const [catalog, setCatalog] = useState([]), [error, setError] = useState(''), [loading, setLoading] = useState(true), [retryCatalog, setRetryCatalog] = useState(0);
  const [widthInput, setWidthInput] = useState(String(draft?.width || 400)), [depthInput, setDepthInput] = useState(String(draft?.depth || 350));
  const [name, setName] = useState(String(draft?.name || 'A minha divisão')), [width, setWidth] = useState(Math.max(180, Math.min(1200, Number(draft?.width) || 400))), [depth, setDepth] = useState(Math.max(180, Math.min(1200, Number(draft?.depth) || 350))), [budget, setBudget] = useState(Math.max(0, Number(draft?.budget) || 1000));
  const [items, setItems] = useState(Array.isArray(draft?.items) ? draft.items : []), [projects, setProjects] = useState(safeRead), [notice, setNotice] = useState('');
  const [query, setQuery] = useState(''), [category, setCategory] = useState('all'), [panel, setPanel] = useState('catalog'), [mode, setMode] = useState('3d'), [zoom, setZoom] = useState(1), [selectedId, setSelectedId] = useState(null);
  const [projectId, setProjectId] = useState(draft?.projectId || null), [autoSaveState, setAutoSaveState] = useState(draft ? 'saved' : 'saving'), [helpOpen, setHelpOpen] = useState(false), [cameraResetKey, setCameraResetKey] = useState(0);
  const [projectMenu, setProjectMenu] = useState(false), initializedRef = useRef(false);
  const chosen = useMemo(() => items.map(item => ({ item, product: catalog.find(p => Number(p.id) === Number(item.productId)) })).filter(row => row.product), [items, catalog]);
  const total = chosen.reduce((sum, row) => sum + Number(row.product.price_cents), 0);
  const products = useMemo(() => catalog.filter(product => (category === 'all' || kindOf(product) === category) && norm(`${product.name} ${product.material} ${product.category_name}`).includes(norm(query))).slice(0, 60), [catalog, category, query]);

  useEffect(() => { const controller = new AbortController(); setLoading(true); setError(''); api('/products', { params: { per_page: 100 }, signal: controller.signal }).then(result => setCatalog(result.items || [])).catch(e => { if (e.name !== 'AbortError') setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [retryCatalog]);
  useEffect(() => {
    if (!catalog.length) return;
    const pending = localStorage.getItem('forma_planner_pending'); if (pending) { const product = catalog.find(p => Number(p.id) === Number(pending)); if (product) addProduct(product); localStorage.removeItem('forma_planner_pending'); }
    const loadShared = () => { const token = new URLSearchParams(location.hash.split('?')[1] || '').get('project'); if (!token) return; try { const bytes = Uint8Array.from(atob(token), c => c.charCodeAt(0)); const project = JSON.parse(new TextDecoder().decode(bytes)); if (project && Array.isArray(project.productIds)) { setName(String(project.name || 'Projeto partilhado').slice(0, 80)); setWidth(Math.max(180, Math.min(1200, Number(project.width) || 400))); setDepth(Math.max(180, Math.min(1200, Number(project.depth) || 350))); setBudget(Math.max(0, Number(project.budget) || 0)); setItems((project.items || project.productIds.map((productId, i) => ({ productId: Number(productId), uid: makeUid(), x: 95 + (i % 3) * 100, z: 90 + Math.floor(i / 3) * 90, rotation: 0 }))).map(item => ({ ...item, uid: item.uid || makeUid() }))); setNotice('Projeto partilhado carregado.'); } } catch { setNotice('Este link de projeto não é válido.'); } };
    loadShared();
  }, [catalog]);
  useEffect(() => { const handler = () => { const pending = localStorage.getItem('forma_planner_pending'); const product = catalog.find(p => Number(p.id) === Number(pending)); if (product) { addProduct(product); localStorage.removeItem('forma_planner_pending'); } }; window.addEventListener('forma:planner-add', handler); return () => window.removeEventListener('forma:planner-add', handler); }, [catalog, width, depth, items]);
  useEffect(() => { const onKey = event => { if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return; if (event.key === 'Delete' && selectedId) removeProduct(selectedId); if (event.key.toLowerCase() === 'r' && selectedId) rotateProduct(selectedId); if (event.key === 'Escape') setSelectedId(null); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [selectedId, items]);
  useEffect(() => {
    if (!initializedRef.current) return undefined;
    setAutoSaveState('saving');
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ name, width, depth, budget, items, projectId, updatedAt: new Date().toISOString() })); setAutoSaveState('saved'); }
      catch { setAutoSaveState('error'); }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [name, width, depth, budget, items, projectId]);

  const addProduct = useCallback(product => {
    const size = dimensions(product), roomWidth = Number(width), roomDepth = Number(depth), gap = 10;
    const occupied = items.map(item => { const p = catalog.find(row => Number(row.id) === Number(item.productId)); const d = dimensions(p); const rotated = Number(item.rotation) % 180 !== 0; return { x: Number(item.x), z: Number(item.z), width: rotated ? d.depth : d.width, depth: rotated ? d.width : d.depth }; });
    const candidates = [];
    for (let z = size.depth / 2; z <= roomDepth - size.depth / 2; z += Math.max(20, size.depth + gap)) {
      for (let x = size.width / 2; x <= roomWidth - size.width / 2; x += Math.max(20, size.width + gap)) candidates.push({ x, z, distance: Math.hypot(x - roomWidth / 2, z - roomDepth / 2) });
    }
    candidates.sort((a,b) => a.distance - b.distance);
    const placement = candidates.find(candidate => occupied.every(item => Math.abs(candidate.x - item.x) >= (size.width + item.width) / 2 + gap || Math.abs(candidate.z - item.z) >= (size.depth + item.depth) / 2 + gap));
    if (!placement) { setNotice('Já não há espaço livre nesta divisão. Aumenta as medidas ou move algumas peças.'); return; }
    const next = { productId: Number(product.id), uid: makeUid(), x: placement.x, z: placement.z, rotation: 0 };
    setItems(current => [...current, next]); setSelectedId(next.uid); setNotice(`${product.name} adicionada à divisão.`);
  }, [items, catalog, width, depth]);
  function removeProduct(instanceId) { setItems(current => current.filter(item => item.uid !== instanceId).map(item => item.supportUid === instanceId ? { ...item, supportUid: null, elevation: 0 } : item)); setSelectedId(null); }
  function rotateProduct(instanceId) { setItems(current => {
    const parent = current.find(item => item.uid === instanceId); if (!parent) return current;
    const nextRotation = ((Number(parent.rotation) || 0) + 90) % 360;
    return current.map(item => {
      if (item.uid === instanceId) return fitItem({ ...item, rotation: nextRotation }, width, depth);
      if (item.supportUid !== instanceId) return item;
      const dx = Number(item.x) - Number(parent.x), dz = Number(item.z) - Number(parent.z);
      return fitItem({ ...item, x: Number(parent.x) - dz, z: Number(parent.z) + dx, rotation: ((Number(item.rotation) || 0) + 90) % 360 }, width, depth);
    });
  }); }
  function moveProduct(instanceId, x, z) { setItems(current => {
    const moving = current.find(item => item.uid === instanceId); if (!moving) return current;
    const product = catalog.find(row => Number(row.id) === Number(moving.productId));
    const fitted = fitItem({ ...moving, x, z }, width, depth);
    const support = findSupport(moving, fitted.x, fitted.z, current, catalog);
    const elevation = support ? supportHeight(catalog.find(row => Number(row.id) === Number(support.productId))) : 0;
    const dx = fitted.x - Number(moving.x), dz = fitted.z - Number(moving.z);
    return current.map(item => item.uid === instanceId ? { ...fitted, supportUid: support?.uid || null, elevation } : item.supportUid === instanceId ? fitItem({ ...item, x: Number(item.x) + dx, z: Number(item.z) + dz }, width, depth) : item);
  }); }
  function saveProject() { const project = { id: projectId || makeUid(), name: name.trim() || 'Projeto sem nome', width: Number(width), depth: Number(depth), budget: Number(budget), items: items.map(({ productId, uid, x, z, rotation, elevation, supportUid }) => ({ productId, uid, x, z, rotation, elevation: elevation || 0, supportUid: supportUid || null })), productIds: items.map(item => item.productId), updatedAt: new Date().toISOString() }; const next = [project, ...projects.filter(row => row.id !== project.id && row.name !== project.name)].slice(0, 20); localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); localStorage.setItem(DRAFT_KEY, JSON.stringify({ name: project.name, width, depth, budget, items: project.items, projectId: project.id, updatedAt: project.updatedAt })); setProjectId(project.id); setProjects(next); setAutoSaveState('saved'); setNotice('Projeto guardado neste navegador.'); }
  function addProjectToCart() { if (!shoppingLines.length) return; shoppingLines.forEach(line => addToCart(line.product, line.quantity)); setCartOpen(true); }
  function openProject(project) { setProjectId(project.id || null); setName(project.name); setWidth(Math.max(180,Math.min(1200,Number(project.width)||400))); setDepth(Math.max(180,Math.min(1200,Number(project.depth)||350))); setBudget(Math.max(0,Math.min(100000,Number(project.budget)||1000))); const rows = project.items || project.productIds.map((productId, i) => { const product = catalog.find(p => Number(p.id) === Number(productId)); const d = dimensions(product); return { productId: Number(productId), uid: makeUid(), x: 80 + d.width / 2 + (i % 2) * 100, z: 80 + d.depth / 2 + Math.floor(i / 2) * 100, rotation: 0 }; }); setItems(rows.map(item => ({ ...item, uid: item.uid || makeUid() }))); setSelectedId(null); setProjectMenu(false); setNotice(`Projeto “${project.name}” aberto.`); }
  function shareProject(project) { const payload = { name: project.name, width: project.width, depth: project.depth, budget: project.budget, items: project.items, productIds: project.productIds }; const bytes = new TextEncoder().encode(JSON.stringify(payload)); let binary = ''; bytes.forEach(byte => { binary += String.fromCharCode(byte); }); const token = btoa(binary); const link = `${location.origin}${location.pathname}#planner?project=${encodeURIComponent(token)}`; if (navigator.clipboard?.writeText) navigator.clipboard.writeText(link).then(() => setNotice('Link do projeto copiado.')).catch(() => setNotice(link)); else setNotice(link); }
  function deleteProject(id) { const next = projects.filter(project => project.id !== id); localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setProjects(next); if (projectId === id) setProjectId(null); }
  useEffect(() => {
    if (!catalog.length || initializedRef.current) return;
    initializedRef.current = true;
    if (new URLSearchParams(location.hash.split('?')[1] || '').has('project')) return;
    if (draft) { setNotice('Última divisão recuperada automaticamente.'); return; }
    const latest = projects[0];
    if (latest && (latest.items?.length || latest.productIds?.length)) { openProject(latest); return; }
    const starter = catalog.find(product => /sofa|poltrona/.test(norm(product.name)));
    if (starter) { const d = dimensions(starter), uid = makeUid(); setItems([{ productId: Number(starter.id), uid, x: Number(width) / 2, z: Math.min(Number(depth) - d.depth / 2, d.depth / 2 + 48), rotation: 0 }]); setSelectedId(uid); }
  }, [catalog]);
  const selected = chosen.find(row => row.item.uid === selectedId);
  const overlapIds = findOverlappingItems(items, catalog);
  const selectedSize = selected ? dimensions(selected.product) : null;
  const selectedRotated = Number(selected?.item.rotation) % 180 !== 0;
  const selectedWidth = selectedSize ? (selectedRotated ? selectedSize.depth : selectedSize.width) : 0;
  const selectedDepth = selectedSize ? (selectedRotated ? selectedSize.width : selectedSize.depth) : 0;
  const wallClearance = selected ? {
    esquerda: Math.max(0, Math.round(Number(selected.item.x) - selectedWidth / 2)),
    direita: Math.max(0, Math.round(Number(width) - Number(selected.item.x) - selectedWidth / 2)),
    janela: Math.max(0, Math.round(Number(selected.item.z) - selectedDepth / 2)),
    oposta: Math.max(0, Math.round(Number(depth) - Number(selected.item.z) - selectedDepth / 2))
  } : null;
  const overlappingItems = selected ? chosen.filter(row => row.item.uid !== selected.item.uid && overlapIds.has(row.item.uid) && overlapIds.has(selected.item.uid) && row.item.supportUid !== selected.item.uid && selected.item.supportUid !== row.item.uid).map(row => row.item) : [];
  const shoppingLines = useMemo(() => {
    const lines = new Map();
    chosen.forEach(row => {
      const key = String(row.product.id), line = lines.get(key) || { product: row.product, quantity: 0 };
      line.quantity += 1; lines.set(key, line);
    });
    return [...lines.values()].map(line => ({ ...line, subtotal: Number(line.product.price_cents) * line.quantity }));
  }, [chosen]);
  const floorArea = Number(width) * Number(depth) / 10000;
  const occupiedArea = items.reduce((sum, item) => {
    if (item.supportUid) return sum;
    const product = catalog.find(row => Number(row.id) === Number(item.productId));
    if (!product) return sum;
    const size = dimensions(product);
    return sum + size.width * size.depth / 10000;
  }, 0);
  const fitItem = (item, roomWidth, roomDepth) => {
    const product = catalog.find(row => Number(row.id) === Number(item.productId)); if (!product) return item;
    const size = dimensions(product), rotated = Number(item.rotation) % 180 !== 0;
    const itemWidth = rotated ? size.depth : size.width, itemDepth = rotated ? size.width : size.depth;
    return { ...item, x: Math.max(itemWidth / 2, Math.min(roomWidth - itemWidth / 2, Number(item.x) || roomWidth / 2)), z: Math.max(itemDepth / 2, Math.min(roomDepth - itemDepth / 2, Number(item.z) || roomDepth / 2)) };
  };
  const commitDimension = (axis, rawValue) => {
    const currentValue = axis === 'width' ? width : depth;
    const parsed = Number.parseFloat(rawValue), value = Math.round(Math.max(180, Math.min(1200, Number.isFinite(parsed) ? parsed : currentValue)));
    const nextWidth = axis === 'width' ? value : width, nextDepth = axis === 'depth' ? value : depth;
    if (axis === 'width') { setWidth(value); setWidthInput(String(value)); } else { setDepth(value); setDepthInput(String(value)); }
    setItems(current => current.map(item => fitItem(item, nextWidth, nextDepth)));
  };
  const adjustDimension = (axis, amount) => commitDimension(axis, (axis === 'width' ? width : depth) + amount);
  useEffect(() => { setWidthInput(String(width)); setDepthInput(String(depth)); }, [width, depth]);

  return <main className="room-planner planner-editor" aria-label="Planeador de divisão FORMA">
    <header className="planner-topbar">
      <a className="planner-back" href="#collection" aria-label="Voltar à coleção"><ArrowLeft size={18}/><span>forma</span></a>
      <div className="planner-project-title"><span>Planeador de divisão</span><button onClick={() => setProjectMenu(value => !value)} aria-expanded={projectMenu}>{name}<ChevronDown size={15}/></button>{projectMenu && <div className="planner-project-menu"><label>Nome do projeto<input value={name} maxLength={80} onChange={event => setName(event.target.value)}/></label>{projects.length > 0 && <div className="planner-project-list"><b>Projetos guardados</b>{projects.map(project => <div className="planner-project-entry" key={project.id}><button onClick={() => openProject(project)}>{project.name}<small>{project.width} × {project.depth} cm</small></button><button aria-label={`Copiar link do projeto ${project.name}`} title="Copiar ligação" onClick={() => shareProject(project)}><Copy size={14}/></button><button aria-label={`Eliminar projeto ${project.name}`} title="Eliminar projeto" onClick={() => deleteProject(project.id)}><Trash2 size={14}/></button></div>)}</div>}</div>}</div>
      <div className="planner-view-switch" role="group" aria-label="Modo de visualização"><button className={mode === '2d' ? 'active' : ''} onClick={() => setMode('2d')}>2D</button><button className={mode === '3d' ? 'active' : ''} onClick={() => setMode('3d')}>3D</button></div>
      <div className="planner-top-actions"><span className={`planner-save-state is-${autoSaveState}`} aria-live="polite">{autoSaveState === 'saving' ? <><span className="planner-save-dot"/>A guardar…</> : autoSaveState === 'error' ? 'Não foi possível guardar' : <><Check size={14}/>Guardado automaticamente</>}</span><button className="planner-save-button" aria-label="Guardar projeto" onClick={saveProject}><Save size={16}/><span>Guardar</span></button></div>
    </header>

    <section className="planner-stage" aria-label="Editor de divisão">
      <RoomViewport width={width} depth={depth} products={catalog} items={items} selectedId={selectedId} onSelect={setSelectedId} onMove={moveProduct} mode={mode} zoom={zoom} onZoom={setZoom} cameraResetKey={cameraResetKey}/>
      <div className="planner-stage-heading"><span>{mode === '3d' ? 'Vista 3D' : 'Planta 2D'}</span><b>{width} × {depth} cm</b></div>
      {mode === '3d' && selected && isSoftBlanket(selected.product) && <div className="planner-cloth-hint" role="status"><Move3D size={15}/>Segura a manta e arrasta para cima; solta para a deixar cair.</div>}
      <div className="planner-tool-rail" aria-label="Ferramentas"><button className={panel === 'catalog' ? 'active' : ''} aria-label="Abrir catálogo" title="Catálogo" onClick={() => setPanel('catalog')}><Grid2X2 size={19}/></button><button className={panel === 'room' ? 'active' : ''} aria-label="Definições da divisão" title="Definições da divisão" onClick={() => setPanel('room')}><Home size={19}/></button><button aria-label="Repor câmara" title="Repor câmara" onClick={() => { setZoom(1); setCameraResetKey(value => value + 1); }}><Crosshair size={18}/></button><button aria-label="Controlos do planeador" title="Controlos" aria-expanded={helpOpen} onClick={() => setHelpOpen(value => !value)}><HelpCircle size={18}/></button></div>
      {helpOpen && <div className="planner-help-popover" role="dialog" aria-label="Controlos do planeador"><b>Como organizar a divisão</b><span><Move3D size={14}/>Arrasta uma peça com o rato ou dedo para a mover.</span><span><Layers size={14}/>Solta uma peça pequena sobre uma mesa para a empilhar.</span><span><RotateCw size={14}/>Seleciona e usa R para rodar; Delete remove.</span><span><Ruler size={14}/>As medidas e distâncias aparecem na seleção.</span><button onClick={() => setHelpOpen(false)}>Fechar</button></div>}

      <aside className={`planner-side-panel ${panel === 'room' ? 'room-settings-open' : ''} ${panel === 'closed' ? 'is-closed' : ''}`}>
        <div className="planner-panel-header"><div><span>{panel === 'catalog' ? 'CATÁLOGO FORMA' : 'A DIVISÃO'}</span><h1>{panel === 'catalog' ? 'Escolhe as peças' : 'Medidas e orçamento'}</h1></div><button aria-label="Fechar painel" onClick={() => setPanel('closed')}><X size={19}/></button></div>
        {panel === 'catalog' ? <>
          <label className="planner-search"><Search size={17}/><input aria-label="Pesquisar no catálogo" placeholder="Pesquisar móveis" value={query} onChange={event => setQuery(event.target.value)}/><span>/</span></label>
          <div className="planner-category-tabs" role="tablist" aria-label="Categorias do catálogo">{categories.map(entry => { const Icon = entry.icon; return <button role="tab" aria-selected={category === entry.key} className={category === entry.key ? 'active' : ''} key={entry.key} onClick={() => setCategory(entry.key)}><Icon size={15}/>{entry.label}</button>; })}</div>
          {loading ? <Loading label="A carregar o catálogo"/> : error ? <ErrorNotice message={error} retry={() => setRetryCatalog(value => value + 1)}/> : <div className="planner-catalog-grid">{products.map(product => <article className="planner-catalog-card" key={product.id}><button className="planner-card-photo" aria-label={`Ver ${product.name}`} onClick={() => onProduct(product)}><img src={product.image} alt={product.name} loading="lazy"/></button><div className="planner-card-details"><div><b>{product.name}</b><span>{product.width_cm && product.depth_cm ? `${product.width_cm} × ${product.depth_cm} cm` : product.material || product.category_name}</span></div><strong>{money(product.price_cents)}</strong><button aria-label={`Adicionar ${product.name} à divisão`} title="Adicionar à divisão" onClick={() => addProduct(product)}><Plus size={17}/></button></div></article>)}{!products.length && <p className="planner-empty-catalog">Não encontrámos peças nesta categoria.</p>}</div>}
        </> : panel === 'room' ? <div className="planner-room-form"><p>Define o espaço para veres a planta à escala. Podes escrever a medida ou usar os controlos.</p><label>Nome do projeto<input value={name} maxLength={80} onChange={event => setName(event.target.value)}/></label><div className="planner-measure-row">{[['width','Largura',widthInput,setWidthInput],['depth','Comprimento',depthInput,setDepthInput]].map(([axis,label,value,setValue]) => <div className="planner-measure-control" key={axis}><label htmlFor={`room-${axis}`}>{label}</label><div className="planner-measure-stepper"><button type="button" aria-label={`Diminuir ${label.toLowerCase()} em 10 centímetros`} onClick={() => adjustDimension(axis,-10)}><Minus size={15}/></button><input id={`room-${axis}`} type="number" inputMode="numeric" min="180" max="1200" step="10" value={value} onChange={event => setValue(event.target.value)} onBlur={event => commitDimension(axis,event.target.value)} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} aria-describedby={`room-${axis}-hint`}/><button type="button" aria-label={`Aumentar ${label.toLowerCase()} em 10 centímetros`} onClick={() => adjustDimension(axis,10)}><Plus size={15}/></button></div><small id={`room-${axis}-hint`}>cm · entre 180 e 1200</small></div>)}</div><label>Orçamento<input type="number" min="0" max="100000" step="50" value={budget} onChange={event => setBudget(Math.max(0, Math.min(100000, Number(event.target.value) || 0)))}/><small>€</small></label><div className="planner-room-total"><span>Valor das peças</span><b>{money(total)}</b><small>{total > Number(budget) * 100 ? 'Acima do orçamento' : `${money(Math.max(0, Number(budget) * 100 - total))} disponíveis`}</small></div><div className="planner-floor-summary"><span>Área livre estimada</span><b>{Math.max(0, floorArea - occupiedArea).toFixed(1)} m²</b><small>{occupiedArea.toFixed(1)} m² ocupados · estimativa sem contar sobreposições</small></div><section className="planner-shopping-list" aria-label="Lista de compras do projeto"><div className="planner-shopping-heading"><b>Lista do projeto</b><span>{items.length} {items.length === 1 ? 'peça' : 'peças'}</span></div>{shoppingLines.map(line => <div className="planner-shopping-line" key={line.product.id}><button onClick={() => onProduct(line.product)}>{line.quantity} × {line.product.name}</button><span>{money(line.subtotal)}</span></div>)}<button className="planner-cart-project" disabled={!shoppingLines.length} onClick={addProjectToCart}><ShoppingBag size={16}/>Adicionar projeto ao carrinho</button></section><button className="planner-save-button wide" onClick={saveProject}><Save size={16}/>Guardar projeto agora</button></div> : null}
      </aside>

      {selected && <div className="planner-selection-card"><img src={selected.product.image} alt=""/><div className="planner-selection-main"><b>{selected.product.name}</b><span>{dimensions(selected.product).width} × {dimensions(selected.product).depth} cm · {money(selected.product.price_cents)}</span>{selected.item.supportUid && <span className="planner-stack-context">Sobre {catalog.find(product => Number(product.id) === Number(items.find(item => item.uid === selected.item.supportUid)?.productId))?.name || 'outra peça'}</span>}</div><button title="Ver produto" aria-label={`Ver produto ${selected.product.name}`} onClick={() => onProduct(selected.product)}><ExternalLink size={16}/></button>{selected.item.supportUid && <button title="Selecionar o móvel de suporte" aria-label={`Selecionar suporte de ${selected.product.name}`} onClick={() => setSelectedId(selected.item.supportUid)}><Layers size={17}/></button>}<button title="Rodar 90°" aria-label={`Rodar ${selected.product.name}`} onClick={() => rotateProduct(selected.item.uid)}><RotateCw size={17}/></button><button title="Eliminar da divisão" aria-label={`Eliminar ${selected.product.name} da divisão`} onClick={() => removeProduct(selected.item.uid)}><Trash2 size={17}/></button>{wallClearance && <div className="planner-clearance-grid" aria-label="Distância às paredes"><span>Esquerda <b>{wallClearance.esquerda} cm</b></span><span>Direita <b>{wallClearance.direita} cm</b></span><span>Janela <b>{wallClearance.janela} cm</b></span><span>Oposta <b>{wallClearance.oposta} cm</b></span></div>}{overlappingItems.length > 0 && <div className="planner-overlap-picker"><span>Peças sobrepostas</span>{overlappingItems.map(item => { const product = catalog.find(row => Number(row.id) === Number(item.productId)); return <button key={item.uid} onClick={() => setSelectedId(item.uid)}>{product?.name || 'Peça'}<Layers size={13}/></button>; })}</div>}</div>}

      <div className="planner-zoom-controls"><button aria-label="Reduzir zoom" onClick={() => setZoom(value => Math.max(.65, Math.round((value - .1) * 100) / 100))}><Minus size={16}/></button><span>{Math.round(zoom * 100)}%</span><button aria-label="Aumentar zoom" onClick={() => setZoom(value => Math.min(1.8, Math.round((value + .1) * 100) / 100))}><Plus size={16}/></button></div>
      <div className="planner-stage-status"><span><Move3D size={15}/>{mode === '2d' ? 'Arrasta sobre uma mesa para empilhar' : 'Arrasta para mover'}</span><span><RotateCw size={14}/>R para rodar</span><span className="planner-stage-count">{items.length} {items.length === 1 ? 'peça' : 'peças'} · {money(total)}</span></div>
      {mode === '3d' && overlapIds.size > 0 && <div className="planner-stage-overlap" role="status">{overlapIds.size} peças sobrepostas · ajusta a disposição na planta 2D</div>}
      {notice && <div className="planner-toast" role="status">{notice}<button aria-label="Fechar aviso" onClick={() => setNotice('')}><X size={14}/></button></div>}
    </section>
  </main>;
}
