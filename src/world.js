// Leonida: a small coastal town. Terrain, roads, buildings, props, collision and the road graph.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';

export const ROADS_X = [-105, -35, 35, 105];
export const ROADS_Z = [-105, -35, 35, 95];
export const RW = 7; // road half width (one lane each way, lane centre at 3.5)
export const LANE = 3.5;
export const SIDEWALK_Y = 0.15;
export const WATER_Y = -0.45;
const LOT_X = [[-94, -46], [-24, 24], [46, 94]];
const LOT_Z = [[-94, -46], [-24, 24], [46, 84]];
export const PIER = { x0: 25, x1: 35, z0: 104, z1: 178, y: 1.3, end: { x0: 14, x1: 46, z0: 176, z1: 206 } };
export const RAMP = { x0: -62, x1: -50, z0: 116, z1: 124, h: 2.4 };

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function terrainH(x, z) {
  const south = Math.max(0, z - 108), east = Math.max(0, x - 130);
  const north = Math.max(0, -132 - z), west = Math.max(0, -132 - x);
  let h = 0;
  const hill = Math.hypot(north, west);
  if (hill > 0) h += Math.min(hill * 0.34, 70) * (0.85 + 0.15 * Math.sin(x * 0.045) * Math.cos(z * 0.037)) * smooth(0, 20, hill);
  const sea = Math.hypot(south, east);
  if (sea > 0) h -= sea < 18 ? sea * 0.03 : sea < 45 ? 0.54 + (sea - 18) * 0.11 : 3.51 + (sea - 45) * 0.16;
  return h;
}

// ------------------------------------------------------------------- small geometry helpers
function scaleUV(g, su, sv) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}

// box whose UVs are in world metres / (su, sv), so facade tiles repeat at a fixed size
function boxUV(w, h, d, su, sv) {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + w / 2, y = p.getY(i) + h / 2, z = p.getZ(i) + d / 2;
    if (Math.abs(n.getX(i)) > 0.5) uv.setXY(i, (n.getX(i) > 0 ? d - z : z) / su, y / sv);
    else if (Math.abs(n.getZ(i)) > 0.5) uv.setXY(i, (n.getZ(i) > 0 ? x : w - x) / su, y / sv);
    else uv.setXY(i, x / su, z / su);
  }
  return g;
}

function flatPlane(w, d, x, y, z, rotY = 0) {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

const STD = (o) => new THREE.MeshStandardMaterial(o);

export class World {
  constructor(scene) {
    this.scene = scene;
    this.solids = []; // {x0,x1,z0,z1,h}
    this.circles = []; // {x,z,r}
    this.raised = []; // sidewalk / lot rectangles at SIDEWALK_Y
    this.nightMats = []; // emissive window materials
    this.neon = []; // {mat, base, flicker}
    this.lampHeads = [];
    this.animated = [];
    this.places = {};
    this.group = new THREE.Group();
    scene.add(this.group);
    this.buildTerrain();
    this.buildWater();
    this.buildRoads();
    this.buildBlocks();
    this.buildBeach();
    this.buildPier();
    this.buildLighthouse();
    this.buildHillSign();
    this.buildPalmsAndLamps();
    this.buildGraph();
    this.buildPedLoops();
  }

  add(mesh, { cast = true, receive = true } = {}) {
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    this.group.add(mesh);
    return mesh;
  }

  solid(x0, x1, z0, z1, h = 30) {
    this.solids.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), h });
  }

  // ------------------------------------------------------------------ terrain + water
  buildTerrain() {
    const S = 680, N = 220;
    const g = new THREE.PlaneGeometry(S, S, N, N);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, -20);
    const p = g.attributes.position;
    const col = new Float32Array(p.count * 3);
    const grass = new THREE.Color('#6aa548'), dry = new THREE.Color('#9aa055'), sand = new THREE.Color('#efdcae'),
      wet = new THREE.Color('#c9b48a'), rock = new THREE.Color('#8b8378'), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const h = terrainH(x, z);
      p.setY(i, h);
      const coast = z > 104 || x > 126;
      const n = Math.sin(x * 0.11) * Math.cos(z * 0.13) * 0.5 + 0.5;
      if (coast && h < 2) {
        c.copy(sand);
        if (h < WATER_Y + 0.35) c.lerp(wet, 0.8);
      } else if (h > 14) c.copy(rock).lerp(dry, n * 0.5);
      else c.copy(grass).lerp(dry, n * 0.45 + smooth(4, 14, h) * 0.4);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = STD({ vertexColors: true, roughness: 0.95, map: T.canvasTexture('terrain-detail', 128, 128, (gg, w, h) => {
      gg.fillStyle = '#fff';
      gg.fillRect(0, 0, w, h);
      for (let k = 0; k < 4000; k++) {
        gg.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
        gg.fillRect(Math.random() * w, Math.random() * h, 1, 1 + Math.random() * 2);
      }
    }) });
    m.map.repeat.set(120, 120);
    const mesh = this.add(new THREE.Mesh(g, m), { cast: false });
    mesh.name = 'terrain';
  }

  // The sea: a detailed surface along the coast (colour by depth, waves offshore, foam rolling onto the
  // sand) and a big flat plane out to the horizon, both with the same shader.
  buildWater() {
    const n = T.waterNormals();
    n.repeat.set(90, 90);
    this.waterNormal = n;
    const uniforms = {
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color('#5fe3d3') },
      uMid: { value: new THREE.Color('#1aa6c4') },
      uDeep: { value: new THREE.Color('#0a4f80') },
    };
    this.waterUniforms = uniforms;
    const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.12, metalness: 0, envMapIntensity: 0.75, normalMap: n, normalScale: new THREE.Vector2(0.28, 0.28), transparent: true });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aDepth;\nuniform float uTime;\nvarying float vDepth;\nvarying vec2 vXZ;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vDepth = aDepth;
          vXZ = position.xz;
          float sw = smoothstep(0.4, 4.0, aDepth);
          transformed.y += sw * (0.16 * sin(position.x * 0.12 + uTime * 1.1) + 0.11 * sin(position.z * 0.19 - uTime * 1.4)
            + 0.06 * sin((position.x + position.z) * 0.41 + uTime * 2.2));`,
        );
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec3 uShallow;\nuniform vec3 uMid;\nuniform vec3 uDeep;\nvarying float vDepth;\nvarying vec2 vXZ;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float d = vDepth;
          vec3 wc = mix(uShallow, uMid, smoothstep(0.0, 2.2, d));
          wc = mix(wc, uDeep, smoothstep(2.0, 9.0, d));
          // sunlit caustic shimmer in the shallows
          float c = sin(vXZ.x * 1.7 + uTime * 1.3) * sin(vXZ.y * 1.9 - uTime * 1.1);
          wc += vec3(0.10, 0.14, 0.12) * smoothstep(0.55, 1.0, c) * (1.0 - smoothstep(0.5, 2.5, d));
          // foam: a frothy line on the sand edge and bands of surf rolling in
          float wob = 0.5 + 0.5 * sin(vXZ.x * 0.9 + uTime * 0.7) * sin(vXZ.y * 1.3 - uTime * 0.5);
          float edge = 1.0 - smoothstep(0.0, 0.35 + 0.15 * wob, d);
          float bands = smoothstep(0.82, 1.0, sin(d * 5.5 - uTime * 1.7 + wob)) * (1.0 - smoothstep(0.25, 1.9, d));
          float foam = clamp(edge * 0.9 + bands * 0.45, 0.0, 1.0);
          diffuseColor.rgb = mix(wc, vec3(1.0), foam);
          diffuseColor.a = max(mix(0.5, 0.94, smoothstep(0.0, 2.0, d)), foam * 0.95);`,
        );
    };
    this.waterMat = m;
    // detailed coastal water (vertex depth from the terrain)
    const g = new THREE.PlaneGeometry(700, 640, 230, 210);
    g.rotateX(-Math.PI / 2);
    g.translate(0, WATER_Y, 120);
    const p = g.attributes.position, dep = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) dep[i] = Math.min(12, Math.max(0, WATER_Y - terrainH(p.getX(i), p.getZ(i))));
    g.setAttribute('aDepth', new THREE.BufferAttribute(dep, 1));
    const near = new THREE.Mesh(g, m);
    near.receiveShadow = true;
    near.renderOrder = 1;
    this.scene.add(near);
    // the open sea to the horizon (a ring around the detailed part, always deep)
    const outer = new THREE.Shape([new THREE.Vector2(-3000, -3000), new THREE.Vector2(3000, -3000), new THREE.Vector2(3000, 3000), new THREE.Vector2(-3000, 3000)]);
    // hole where the detailed water is (shape y = -world z)
    outer.holes.push(new THREE.Path([new THREE.Vector2(-349, -439), new THREE.Vector2(-349, 199), new THREE.Vector2(349, 199), new THREE.Vector2(349, -439)]));
    const far = new THREE.ShapeGeometry(outer);
    // same texel density as the detailed water (ShapeGeometry UVs are raw metres otherwise)
    const fuv = far.attributes.uv;
    for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) / 700, fuv.getY(i) / 640);
    far.rotateX(-Math.PI / 2);
    far.translate(0, WATER_Y - 0.01, 0);
    far.setAttribute('aDepth', new THREE.BufferAttribute(new Float32Array(far.attributes.position.count).fill(12), 1));
    const fm = new THREE.Mesh(far, m);
    this.scene.add(fm);
  }

  // ------------------------------------------------------------------ roads, sidewalks, lots
  buildRoads() {
    const roadMat = STD({ map: T.roadTexture(), roughness: 0.85 });
    const asph = STD({ map: T.asphaltTexture(), roughness: 0.9 });
    const segs = [], inters = [];
    const zMin = ROADS_Z[0], zMax = ROADS_Z[ROADS_Z.length - 1], xMin = ROADS_X[0], xMax = ROADS_X[ROADS_X.length - 1];
    for (const x of ROADS_X)
      for (let j = 0; j < ROADS_Z.length - 1; j++) {
        const a = ROADS_Z[j] + RW, b = ROADS_Z[j + 1] - RW, L = b - a;
        segs.push(scaleUV(flatPlane(RW * 2, L, x, 0.02, (a + b) / 2), 1, L / 28));
      }
    for (const z of ROADS_Z)
      for (let i = 0; i < ROADS_X.length - 1; i++) {
        const a = ROADS_X[i] + RW, b = ROADS_X[i + 1] - RW, L = b - a;
        segs.push(scaleUV(flatPlane(RW * 2, L, (a + b) / 2, 0.02, z, Math.PI / 2), 1, L / 28));
      }
    for (const x of ROADS_X) for (const z of ROADS_Z) inters.push(scaleUV(flatPlane(RW * 2, RW * 2, x, 0.021, z), 0.5, 0.5));
    this.add(new THREE.Mesh(mergeGeometries(segs), roadMat), { cast: false });
    this.add(new THREE.Mesh(mergeGeometries(inters), asph), { cast: false });
    // zebra crossings on the inner crossings
    const zebra = T.canvasTexture('zebra', 128, 32, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(240,240,232,0.92)';
      for (let i = 0; i < 8; i++) g.fillRect(i * 16 + 3, 0, 9, h);
    }, { repeat: false });
    const zg = [];
    for (const x of ROADS_X)
      for (const z of ROADS_Z) {
        if (x === xMin || x === xMax || z === zMin || z === zMax) continue;
        zg.push(flatPlane(RW * 2, 3, x, 0.03, z - RW - 1.6), flatPlane(RW * 2, 3, x, 0.03, z + RW + 1.6));
        zg.push(flatPlane(RW * 2, 3, x - RW - 1.6, 0.03, z, Math.PI / 2), flatPlane(RW * 2, 3, x + RW + 1.6, 0.03, z, Math.PI / 2));
      }
    this.add(new THREE.Mesh(mergeGeometries(zg), new THREE.MeshStandardMaterial({ map: zebra, transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 })), { cast: false });

    // raised sidewalks: one slab per block (road edge to road edge) + the outer ring + the promenade
    const swMat = STD({ map: T.sidewalkTexture(), roughness: 0.9 });
    const slabs = [];
    const slab = (x0, x1, z0, z1) => {
      const w = x1 - x0, d = z1 - z0;
      const g = boxUV(w, SIDEWALK_Y, d, 4, 4);
      g.translate((x0 + x1) / 2, SIDEWALK_Y / 2, (z0 + z1) / 2);
      slabs.push(g);
      this.raised.push({ x0, x1, z0, z1 });
    };
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) slab(ROADS_X[i] + RW, ROADS_X[i + 1] - RW, ROADS_Z[j] + RW, ROADS_Z[j + 1] - RW);
    slab(xMin - RW - 6, xMax + RW + 6, zMin - RW - 6, zMin - RW); // north
    slab(xMin - RW - 6, xMin - RW, zMin - RW, zMax - RW); // west
    slab(xMax + RW, xMax + RW + 6, zMin - RW, zMax - RW); // east
    slab(xMin - RW - 6, xMax + RW + 6, zMax + RW, zMax + RW + 7); // promenade
    this.add(new THREE.Mesh(mergeGeometries(slabs), swMat), { cast: false });
    // promenade railing posts + low wall along the beach
    const wall = boxUV(xMax - xMin + 2 * RW + 12, 0.6, 0.4, 2, 1);
    wall.translate(0, SIDEWALK_Y + 0.3, zMax + RW + 6.8);
    const wallM = this.add(new THREE.Mesh(wall, STD({ color: '#f4efe6', roughness: 0.8 })));
    wallM.userData.skip = true;
  }

  lot(i, j, kind) {
    const [x0, x1] = LOT_X[i], [z0, z1] = LOT_Z[j];
    const mats = {
      grass: STD({ map: T.grassTexture(), roughness: 1 }),
      plaza: STD({ map: T.plazaTexture(), roughness: 0.85 }),
      asphalt: STD({ map: T.asphaltTexture(), roughness: 0.9 }),
    };
    const g = flatPlane(x1 - x0, z1 - z0, (x0 + x1) / 2, SIDEWALK_Y + 0.004, (z0 + z1) / 2);
    scaleUV(g, (x1 - x0) / (kind === 'plaza' ? 8 : 6), (z1 - z0) / (kind === 'plaza' ? 8 : 6));
    this.add(new THREE.Mesh(g, mats[kind]), { cast: false });
  }

  // ------------------------------------------------------------------ buildings
  facadeMat(style, color, seed) {
    const key = `${style}|${color}|${seed}`;
    this._fm ??= new Map();
    if (!this._fm.has(key)) {
      const { map, em } = T.facade(style, color, seed);
      const m = STD({ map, bumpMap: map, bumpScale: 1.2, roughness: 0.78 });
      this.nightMats.push(m);
      this._fm.set(key, m);
    }
    return this._fm.get(key);
  }

  neonMat(text, color, opts) {
    const { tex, aspect } = T.neonSign(text, color, opts);
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
    const n = { mat: m, flicker: Math.random() < 0.25, phase: Math.random() * 10 };
    this.neon.push(n);
    return { m, aspect };
  }

  // neon sign plane: centre (x,y,z), facing direction yaw (0 = +z), height h
  sign(text, color, x, y, z, yaw, h, opts = {}) {
    const { m, aspect } = this.neonMat(text, color, opts);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(h * aspect, h), m);
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    mesh.renderOrder = 2;
    this.group.add(mesh);
    if (opts.both) {
      // freestanding: the same sign, readable, on the back
      const b = mesh.clone();
      b.rotation.y = yaw + Math.PI;
      b.position.addScaledVector(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), -0.05);
      this.group.add(b);
    }
    return mesh;
  }

  // face: 's' (+z), 'n' (-z), 'e' (+x), 'w' (-x)
  building({ x0, x1, z0, z1, floors = 3, style = 'plain', color = '#ff7eb6', seed = 1, face = 's', sign, signColor = '#ff4fa6', store = true, deco = false, fin, awning, roof = '#d9d2c8', trim = '#ffffff' }) {
    const FH = 3.4, w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const H = floors * FH;
    const roofM = STD({ color: roof, roughness: 0.9 });
    const upper = this.facadeMat(style, color, seed);
    const base = store ? 1 : 0;
    if (store) {
      const { map, em } = T.storefront(color, seed);
      const sm = STD({ map, emissiveMap: em, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0, roughness: 0.6 });
      this.nightMats.push(sm);
      const g = boxUV(w, FH, d, 6.4, FH);
      g.translate(cx, SIDEWALK_Y + FH / 2, cz);
      this.add(new THREE.Mesh(g, [sm, sm, roofM, roofM, sm, sm]));
      const band = new THREE.BoxGeometry(w + 0.3, 0.5, d + 0.3);
      band.translate(cx, SIDEWALK_Y + FH, cz);
      this.add(new THREE.Mesh(band, STD({ color: trim, roughness: 0.7 })));
    }
    if (floors > base) {
      const hU = (floors - base) * FH;
      const g = boxUV(w, hU, d, 6.4, 6.8);
      g.translate(cx, SIDEWALK_Y + base * FH + hU / 2, cz);
      this.add(new THREE.Mesh(g, [upper, upper, roofM, roofM, upper, upper]));
    }
    // parapet + rooftop clutter
    const top = SIDEWALK_Y + H;
    const par = [];
    const pw = 0.35, ph = deco ? 1.6 : 0.9;
    par.push(new THREE.BoxGeometry(w, ph, pw).translate(cx, top + ph / 2, z0 + pw / 2));
    par.push(new THREE.BoxGeometry(w, ph, pw).translate(cx, top + ph / 2, z1 - pw / 2));
    par.push(new THREE.BoxGeometry(pw, ph, d).translate(x0 + pw / 2, top + ph / 2, cz));
    par.push(new THREE.BoxGeometry(pw, ph, d).translate(x1 - pw / 2, top + ph / 2, cz));
    if (w > 10 && d > 10) {
      par.push(new THREE.BoxGeometry(2.2, 1.4, 1.6).translate(cx - w * 0.2, top + 0.7, cz + d * 0.1));
      par.push(new THREE.CylinderGeometry(1.2, 1.2, 2.4, 12).translate(cx + w * 0.25, top + 2.2, cz - d * 0.2));
    }
    this.add(new THREE.Mesh(mergeGeometries(par.map((g) => g.toNonIndexed())), STD({ color: deco ? trim : color, roughness: 0.8 })));
    // deco: horizontal "eyebrow" ledges and rounded corner columns
    const dir = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] }[face];
    const fx = dir[0] ? (dir[0] > 0 ? x1 : x0) : cx, fz = dir[1] ? (dir[1] > 0 ? z1 : z0) : cz;
    const along = dir[0] ? d : w;
    const yaw = Math.atan2(dir[0], dir[1]);
    if (deco) {
      const L = [];
      for (let f = base + 1; f <= floors; f++) {
        const y = SIDEWALK_Y + f * FH - 0.35;
        const g = new THREE.BoxGeometry(dir[0] ? 0.7 : along + 0.4, 0.18, dir[0] ? along + 0.4 : 0.7);
        g.translate(fx + dir[0] * 0.3, y, fz + dir[1] * 0.3);
        L.push(g);
      }
      for (const s of [-1, 1]) {
        const g = new THREE.CylinderGeometry(1.1, 1.1, H + 1.6, 20);
        const ox = dir[0] ? fx : cx + s * (w / 2), oz = dir[1] ? fz : cz + s * (d / 2);
        g.translate(ox, SIDEWALK_Y + (H + 1.6) / 2, oz);
        L.push(g);
      }
      this.add(new THREE.Mesh(mergeGeometries(L.map((g) => g.toNonIndexed())), STD({ color: trim, roughness: 0.6 })));
    }
    if (fin) {
      // a tall vertical fin above the entrance carrying a vertical neon name
      const fh = H + 7;
      const g = new THREE.BoxGeometry(dir[0] ? 4 : 0.8, fh, dir[0] ? 0.8 : 4);
      const ox = fx + dir[0] * 2, oz = fz + dir[1] * 2;
      g.translate(ox, SIDEWALK_Y + fh / 2 + 2, oz);
      this.add(new THREE.Mesh(g, STD({ color: trim, roughness: 0.5 })));
      // the name reads top to bottom on both sides of the fin
      for (const side of [1, -1]) {
        const s = this.sign(fin.text, fin.color, ox, SIDEWALK_Y + 2 + fh * 0.58, oz, 0, 3.4, { border: false });
        s.rotation.order = 'YXZ';
        const yawSide = (dir[0] ? 0 : Math.PI / 2) + (side < 0 ? Math.PI : 0);
        s.rotation.set(0, yawSide, -Math.PI / 2);
        s.position.x += dir[0] ? 0 : 0.42 * side;
        s.position.z += dir[0] ? 0.42 * side : 0;
      }
    }
    if (sign) {
      const sy = store ? SIDEWALK_Y + FH + 1.4 : SIDEWALK_Y + H - 1.3;
      this.sign(sign, signColor, fx + dir[0] * 0.25, sy, fz + dir[1] * 0.25, yaw, store ? 2.2 : 2.6);
    }
    if (awning && store) {
      const aw = new THREE.Mesh(new THREE.BoxGeometry(dir[0] ? 2.4 : along * 0.86, 0.12, dir[0] ? along * 0.86 : 2.4),
        STD({ map: T.stripes(awning, awning.join('')), roughness: 0.8 }));
      aw.position.set(fx + dir[0] * 1.2, SIDEWALK_Y + FH - 0.5, fz + dir[1] * 1.2);
      aw.rotation.set(dir[1] ? dir[1] * 0.25 : 0, 0, dir[0] ? -dir[0] * 0.25 : 0);
      this.add(aw);
    }
    this.solid(x0, x1, z0, z1, H + 2);
    return { fx, fz, yaw, top };
  }

  buildBlocks() {
    // ---- NW: police station, clinic, parking
    this.lot(0, 0, 'asphalt');
    const ps = this.building({ x0: -70, x1: -48, z0: -94, z1: -66, floors: 2, style: 'office', color: '#c9d8ea', seed: 3, face: 'e', sign: 'POLICE', signColor: '#4fb8ff', roof: '#9aa7b5', trim: '#2b4c7e' });
    this.places.police = { x: -44, z: -80, yaw: Math.PI / 2 };
    this.building({ x0: -94, x1: -60, z0: -60, z1: -48, floors: 2, style: 'office', color: '#ffffff', seed: 4, face: 's', sign: 'CLINIC', signColor: '#ff3b4d', trim: '#ff3b4d' });
    this.places.clinic = { x: -77, z: -42 };
    this.places.policeLot = [[-88, -86], [-80, -86], [-88, -74], [-80, -74]];
    // ---- N centre: gas station + diner
    this.lot(1, 0, 'asphalt');
    this.building({ x0: -22, x1: -4, z0: -94, z1: -80, floors: 1, color: '#ffcf4a', seed: 5, face: 's', sign: 'SOL GAS', signColor: '#ffb020', awning: ['#ff5a3c', '#ffffff'] });
    this.building({ x0: 4, x1: 22, z0: -94, z1: -80, floors: 1, color: '#b9c3cc', seed: 6, face: 's', sign: "ROSA'S DINER", signColor: '#ff3b6b', awning: ['#ff3b6b', '#ffffff'], trim: '#c0c6cc' });
    {
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(26, 0.8, 14), STD({ color: '#ffffff', emissive: '#fff4d6', emissiveIntensity: 0, roughness: 0.6 }));
      this.nightMats.push(canopy.material);
      canopy.position.set(0, 5.4, -62);
      this.add(canopy);
      const band = new THREE.Mesh(new THREE.BoxGeometry(26.2, 0.35, 14.2), STD({ color: '#ff5a3c', roughness: 0.5 }));
      band.position.set(0, 5.6, -62);
      this.add(band);
      for (const x of [-9, 9])
        for (const z of [-66, -58]) {
          const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 5, 0.6), STD({ color: '#dcdcdc' }));
          p.position.set(x, 2.6, z);
          this.add(p);
          const pump = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.6), STD({ color: '#ff5a3c', roughness: 0.5 }));
          pump.position.set(x * 0.55, 1, z);
          this.add(pump);
          this.circles.push({ x: x * 0.55, z, r: 0.8 });
        }
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 10), STD({ color: '#888' }));
      pole.position.set(20, 5.1, -50);
      this.add(pole);
      this.sign('GAS $1.99', '#ffd84a', 20, 10.5, -50, 0, 2.2, { bg: '#1a1a24', both: true });
      this.circles.push({ x: 20, z: -50, r: 0.5 });
    }
    // ---- NE: villas with pools
    this.lot(2, 0, 'grass');
    const villa = [['#9b7cf4', 9], ['#3cc9bd', 10], ['#ff9a5c', 11], ['#5bb8f5', 12]];
    let vi = 0;
    for (const [vx, vz] of [[50, -92], [74, -92], [50, -62], [74, -62]]) {
      const [col, seed] = villa[vi++];
      this.building({ x0: vx, x1: vx + 16, z0: vz, z1: vz + 12, floors: 2, style: 'house', color: col, seed, face: vz < -70 ? 's' : 'n', store: false, roof: '#efe6da' });
      const pool = new THREE.Mesh(new THREE.BoxGeometry(9, 0.1, 5), new THREE.MeshStandardMaterial({ color: '#3fd0e8', roughness: 0.05, emissive: '#0a6f88', emissiveIntensity: 0.3 }));
      pool.position.set(vx + 8, SIDEWALK_Y + 0.06, vz < -70 ? vz + 17 : vz - 5);
      this.add(pool, { cast: false });
    }
    // ---- W: shops + Macca's garage
    this.lot(0, 1, 'asphalt');
    this.building({ x0: -60, x1: -46, z0: -24, z1: -10, floors: 2, style: 'plain', color: '#3cc9bd', seed: 13, face: 'e', sign: 'SURF SHACK', signColor: '#3fe0ff', awning: ['#ffd84a', '#ffffff'] });
    this.building({ x0: -60, x1: -46, z0: -8, z1: 6, floors: 2, style: 'plain', color: '#ffcf4a', seed: 14, face: 'e', sign: '24/7', signColor: '#5dff7a', awning: ['#2fbf5a', '#ffffff'] });
    this.building({ x0: -60, x1: -46, z0: 8, z1: 24, floors: 3, style: 'plain', color: '#ff7eb6', seed: 15, face: 'e', sign: 'PAWN', signColor: '#ffb020' });
    this.building({ x0: -94, x1: -70, z0: 4, z1: 24, floors: 2, style: 'plain', color: '#8f9aa6', seed: 16, face: 's', store: false, roof: '#7d858f' });
    {
      // roll-up garage door + sign
      const door = new THREE.Mesh(new THREE.PlaneGeometry(8, 4.4), STD({ map: T.stripes(['#6b7380', '#5a626e'], 'gdoor', false), roughness: 0.6, metalness: 0.4 }));
      door.position.set(-82, SIDEWALK_Y + 2.2, 24.05);
      this.add(door);
      this.sign("MACCA'S GARAGE", '#ff4fa6', -82, SIDEWALK_Y + 5.6, 24.2, 0, 1.6);
      this.places.garage = { x: -82, z: 29 };
    }
    // ---- Centre: town square
    this.lot(1, 1, 'plaza');
    this.buildSquare();
    // ---- E: Sol Motel
    this.lot(2, 1, 'asphalt');
    this.building({ x0: 58, x1: 94, z0: -24, z1: -12, floors: 2, style: 'motel', color: '#ff9a5c', seed: 17, face: 's', store: false, roof: '#e07a5f', trim: '#e07a5f' });
    this.building({ x0: 82, x1: 94, z0: -12, z1: 24, floors: 2, style: 'motel', color: '#ff9a5c', seed: 18, face: 'w', store: false, roof: '#e07a5f', trim: '#e07a5f' });
    {
      const pool = new THREE.Mesh(new THREE.BoxGeometry(16, 0.1, 9), new THREE.MeshStandardMaterial({ color: '#3fd0e8', roughness: 0.05, emissive: '#0a6f88', emissiveIntensity: 0.3 }));
      pool.position.set(68, SIDEWALK_Y + 0.06, 4);
      this.add(pool, { cast: false });
      this.motelPool = pool;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 13), STD({ color: '#e07a5f' }));
      pole.position.set(50, 6.6, 20);
      this.add(pole);
      this.circles.push({ x: 50, z: 20, r: 0.6 });
      this.sign('SOL MOTEL', '#ff7a3c', 50, 13.2, 20.1, -Math.PI / 4, 3.2, { bg: '#1f1430', both: true });
      this.sign('VACANCY', '#5dff7a', 50, 10.6, 20.1, -Math.PI / 4, 1.3, { border: false, both: true });
    }
    // ---- SW: Gator Bar + arcade + apartments
    this.lot(0, 2, 'plaza');
    this.building({ x0: -76, x1: -50, z0: 64, z1: 84, floors: 2, style: 'plain', color: '#14a596', seed: 19, face: 's', sign: 'GATOR BAR', signColor: '#ff4fa6', awning: ['#ff4fa6', '#ffffff'], trim: '#ffe36b' });
    this.places.bar = { x: -63, z: 89 };
    this.building({ x0: -94, x1: -80, z0: 62, z1: 84, floors: 2, style: 'plain', color: '#5b3f9e', seed: 20, face: 's', sign: 'ARCADE', signColor: '#3fe0ff', trim: '#ff4fa6' });
    this.building({ x0: -94, x1: -50, z0: 46, z1: 58, floors: 4, style: 'deco', color: '#5bb8f5', seed: 21, face: 'n', store: false, deco: true });
    // ---- S centre: Flamingo Hotel
    this.lot(1, 2, 'asphalt');
    this.building({ x0: -24, x1: 24, z0: 50, z1: 72, floors: 3, style: 'deco', color: '#ff6fae', seed: 22, face: 's', deco: true, sign: 'FLAMINGO HOTEL', signColor: '#ff4fa6', awning: ['#ff4fa6', '#ffffff'] });
    this.building({ x0: -12, x1: 12, z0: 52, z1: 68, floors: 8, style: 'deco', color: '#ff6fae', seed: 23, face: 's', store: false, deco: true, fin: { text: 'FLAMINGO', color: '#ff4fa6' } });
    this.places.valet = { x: 8, z: 79, yaw: Math.PI / 2 };
    // ---- SE: Ocean Grand + Sunset Inn
    this.lot(2, 2, 'plaza');
    this.building({ x0: 48, x1: 70, z0: 50, z1: 82, floors: 6, style: 'deco', color: '#3cc9bd', seed: 24, face: 's', deco: true, sign: 'OCEAN GRAND', signColor: '#3fe0ff', awning: ['#14a596', '#ffffff'] });
    this.building({ x0: 74, x1: 94, z0: 56, z1: 82, floors: 4, style: 'deco', color: '#ffcf4a', seed: 25, face: 's', deco: true, sign: 'SUNSET INN', signColor: '#ff9a3c', awning: ['#ff9a3c', '#ffffff'] });
    // ---- backdrop houses north of town (on the hill slope)
    const hc = ['#ff7eb6', '#3cc9bd', '#ffcf4a', '#9b7cf4', '#ff9a5c', '#ffffff'];
    let k = 0;
    for (let x = -100; x <= 100; x += 22) {
      const z = -138 - (k % 2) * 10;
      const y = terrainH(x, z) - 0.5;
      const g = boxUV(12, 7, 9, 6.4, 6.8);
      const m = this.facadeMat('house', hc[k % hc.length], 30 + k);
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, y + 3.5, z);
      this.add(mesh);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(8.4, 3, 4), STD({ color: '#c8644a', roughness: 0.8 }));
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(1, 1, 0.75);
      roof.position.set(x, y + 8.5, z);
      this.add(roof);
      this.solid(x - 6, x + 6, z - 4.5, z + 4.5, y + 8);
      k++;
    }
  }

  buildSquare() {
    // fountain
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.4, 0.9, 40, 1, true), STD({ color: '#f4efe6', roughness: 0.7, side: THREE.DoubleSide }));
    basin.position.set(0, SIDEWALK_Y + 0.45, 0);
    this.add(basin);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(6.1, 0.3, 8, 48), STD({ color: '#ffffff', roughness: 0.6 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, SIDEWALK_Y + 0.9, 0);
    this.add(rim);
    const water = new THREE.Mesh(new THREE.CircleGeometry(5.9, 40), new THREE.MeshStandardMaterial({ color: '#4fd6e8', roughness: 0.05, emissive: '#0d7d96', emissiveIntensity: 0.35 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, SIDEWALK_Y + 0.7, 0);
    this.add(water, { cast: false });
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 3, 16), STD({ color: '#f4efe6' }));
    col.position.set(0, SIDEWALK_Y + 1.6, 0);
    this.add(col);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 0.6, 0.6, 24), STD({ color: '#f4efe6' }));
    bowl.position.set(0, SIDEWALK_Y + 3.2, 0);
    this.add(bowl);
    // water jets: a few animated translucent cones
    const jetMat = new THREE.MeshBasicMaterial({ color: '#cff7ff', transparent: true, opacity: 0.55, depthWrite: false });
    const jets = new THREE.Group();
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.35, 3.5, 12, 1, true), jetMat);
    top.position.y = SIDEWALK_Y + 5.2;
    jets.add(top);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const j = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.14, 2.4, 6, 1, true), jetMat);
      j.position.set(Math.cos(a) * 3.8, SIDEWALK_Y + 1.6, Math.sin(a) * 3.8);
      j.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);
      jets.add(j);
    }
    this.group.add(jets);
    this.animated.push((t) => {
      top.scale.y = 1 + 0.12 * Math.sin(t * 6);
      jets.children.forEach((j, i) => i && (j.scale.y = 1 + 0.15 * Math.sin(t * 5 + i)));
    });
    this.circles.push({ x: 0, z: 0, r: 6.6 });
    // bandstand
    const bx = 14, bz = -13;
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.7, 0.6, 8), STD({ color: '#ffffff' }));
    floor.position.set(bx, SIDEWALK_Y + 0.3, bz);
    this.add(floor);
    const roofB = new THREE.Mesh(new THREE.ConeGeometry(5.4, 2.4, 8), STD({ color: '#ff8fb8', roughness: 0.7 }));
    roofB.position.set(bx, SIDEWALK_Y + 5.2, bz);
    this.add(roofB);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3.8, 8), STD({ color: '#ffffff' }));
      p.position.set(bx + Math.cos(a) * 4.1, SIDEWALK_Y + 2.3, bz + Math.sin(a) * 4.1);
      this.add(p);
    }
    this.circles.push({ x: bx, z: bz, r: 4.8 });
    // clock tower
    const cx = -14, cz = -14;
    const tw = new THREE.Mesh(boxUV(3.4, 14, 3.4, 6.4, 6.8), this.facadeMat('deco', '#ffcf4a', 40));
    tw.position.set(cx, SIDEWALK_Y + 7, cz);
    this.add(tw);
    const tp = new THREE.Mesh(new THREE.ConeGeometry(2.8, 4, 4), STD({ color: '#14a596', roughness: 0.5 }));
    tp.rotation.y = Math.PI / 4;
    tp.position.set(cx, SIDEWALK_Y + 16, cz);
    this.add(tp);
    const face = T.canvasTexture('clock', 128, 128, (g, w, h) => {
      g.fillStyle = '#fffbe8';
      g.beginPath();
      g.arc(64, 64, 60, 0, 7);
      g.fill();
      g.strokeStyle = '#333';
      g.lineWidth = 5;
      g.stroke();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.fillStyle = '#333';
        g.fillRect(64 + Math.cos(a) * 48 - 3, 64 + Math.sin(a) * 48 - 3, 6, 6);
      }
    }, { repeat: false });
    const clockMat = STD({ map: face, emissive: '#fff4c2', emissiveIntensity: 0, emissiveMap: face });
    this.nightMats.push(clockMat);
    this.clockHands = [];
    for (const [yaw, ox, oz] of [[0, 0, 1.72], [Math.PI, 0, -1.72], [Math.PI / 2, 1.72, 0], [-Math.PI / 2, -1.72, 0]]) {
      const f = new THREE.Mesh(new THREE.CircleGeometry(1.25, 24), clockMat);
      f.position.set(cx + ox, SIDEWALK_Y + 11.5, cz + oz);
      f.rotation.y = yaw;
      this.group.add(f);
      for (const [len, wdt] of [[0.7, 0.12], [1.05, 0.07]]) {
        const hand = new THREE.Mesh(new THREE.PlaneGeometry(wdt, len).translate(0, len / 2, 0), new THREE.MeshBasicMaterial({ color: '#222' }));
        hand.position.set(cx + ox * 1.01, SIDEWALK_Y + 11.5, cz + oz * 1.01);
        hand.rotation.y = yaw;
        this.group.add(hand);
        this.clockHands.push({ hand, hour: len < 1 });
      }
    }
    this.solid(cx - 1.7, cx + 1.7, cz - 1.7, cz + 1.7, 18);
    // town sign + flower beds + benches
    this.sign('LEONIDA', '#ff4fa6', 0, SIDEWALK_Y + 2.2, 18.5, 0, 2.2, { bg: '#1c1030' });
    const sb = new THREE.Mesh(new THREE.BoxGeometry(11, 1.2, 0.6), STD({ color: '#f4efe6' }));
    sb.position.set(0, SIDEWALK_Y + 0.6, 18.1);
    this.add(sb);
    this.solid(-5.5, 5.5, 17.8, 18.4, 3);
    const flowers = ['#ff4fa6', '#ffd84a', '#ff7a3c', '#c77dff'];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const bed = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.5, 20), STD({ color: '#4e8a34' }));
      bed.position.set(Math.cos(a) * 15, SIDEWALK_Y + 0.25, Math.sin(a) * 15);
      this.add(bed);
      const fl = new THREE.Mesh(new THREE.IcosahedronGeometry(2.3, 1), STD({ color: flowers[i], roughness: 0.9, flatShading: true }));
      fl.scale.y = 0.35;
      fl.position.set(Math.cos(a) * 15, SIDEWALK_Y + 0.7, Math.sin(a) * 15);
      this.add(fl);
      this.circles.push({ x: Math.cos(a) * 15, z: Math.sin(a) * 15, r: 2.8 });
    }
    this.benches([[8, 8, 0.8], [-8, 8, -0.8], [8, -8, 2.4], [-8, -8, -2.4]]);
  }

  benches(list) {
    const wood = STD({ map: T.woodTexture(), roughness: 0.8 });
    for (const [x, z, yaw] of list) {
      const g = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2, 0.12, 0.6), wood);
      seat.position.y = 0.5;
      const back = new THREE.Mesh(new THREE.BoxGeometry(2, 0.6, 0.1), wood);
      back.position.set(0, 0.85, -0.28);
      for (const s of [-0.85, 0.85]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.55), STD({ color: '#333' }));
        leg.position.set(s, 0.25, 0);
        g.add(leg);
      }
      g.add(seat, back);
      g.position.set(x, SIDEWALK_Y, z);
      g.rotation.y = yaw;
      g.traverse((o) => o.isMesh && (o.castShadow = true));
      this.group.add(g);
    }
  }

  // ------------------------------------------------------------------ beach, pier, lighthouse, sign
  buildBeach() {
    const umb = [['#ff4fa6', '#ffffff'], ['#3fd0e8', '#ffffff'], ['#ffd84a', '#ff7a3c'], ['#5dff7a', '#ffffff']];
    const R = T.rng(77);
    for (let i = 0; i < 26; i++) {
      const x = -120 + R() * 240, z = 112 + R() * 12;
      if (Math.abs(x - 30) < 12 || (x > RAMP.x0 - 8 && x < RAMP.x1 + 8)) continue;
      const y = terrainH(x, z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6), STD({ color: '#eee' }));
      pole.position.set(x, y + 1.3, z);
      this.add(pole);
      const c = umb[i % umb.length];
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.7, 12, 1, true), STD({ map: T.stripes(c, c.join('') + 'u'), side: THREE.DoubleSide, roughness: 0.8 }));
      top.position.set(x, y + 2.6, z);
      top.rotation.z = (R() - 0.5) * 0.3;
      this.add(top);
      const towel = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.9), STD({ map: T.stripes([c[0], '#ffffff'], c[0] + 't', false) }));
      towel.rotation.x = -Math.PI / 2;
      towel.rotation.z = R() * 0.5;
      towel.position.set(x + 1.2, y + 0.04, z + 0.4);
      this.add(towel, { cast: false });
    }
    // lifeguard towers
    for (const [x, col] of [[-90, '#ff7a3c'], [80, '#3fd0e8']]) {
      const z = 118, y = terrainH(x, z);
      const g = new THREE.Group();
      for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3), STD({ color: '#f4efe6' }));
        leg.position.set(lx * 1.1, 1.5, lz * 1.1);
        g.add(leg);
      }
      const hut = new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, 3), STD({ color: col, roughness: 0.7 }));
      hut.position.y = 4.1;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1, 4), STD({ color: '#ffffff' }));
      roof.position.y = 5.7;
      roof.rotation.y = Math.PI / 4;
      g.add(hut, roof);
      g.position.set(x, y, z);
      g.traverse((o) => o.isMesh && (o.castShadow = true));
      this.group.add(g);
      this.circles.push({ x, z, r: 1.8 });
    }
    // beach bar hut
    {
      const x = -20, z = 116, y = terrainH(x, z);
      const hut = new THREE.Mesh(new THREE.BoxGeometry(7, 2.6, 4), STD({ map: T.woodTexture() }));
      hut.position.set(x, y + 1.3, z);
      this.add(hut);
      const thatch = new THREE.Mesh(new THREE.ConeGeometry(6, 2.4, 6), STD({ color: '#c9a35b', roughness: 1, flatShading: true }));
      thatch.position.set(x, y + 3.8, z);
      this.add(thatch);
      this.sign('TIKI', '#ffd84a', x, y + 3.2, z + 2.1, 0, 1.0, { border: false });
      this.circles.push({ x, z, r: 3.6 });
    }
    // stunt ramp
    {
      const { x0, x1, z0, z1, h } = RAMP;
      const y = terrainH((x0 + x1) / 2, (z0 + z1) / 2);
      const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(x1 - x0, 0), new THREE.Vector2(x1 - x0, h), new THREE.Vector2(x1 - x0 - 0.6, h)]);
      const g = new THREE.ExtrudeGeometry(shape, { depth: z1 - z0, bevelEnabled: false });
      const m = STD({ map: T.stripes(['#ffd400', '#1a1a1a'], 'ramp'), roughness: 0.7 });
      m.map.repeat.set(0.4, 0.4);
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x0, y, z0);
      this.add(mesh);
      this.rampY = y;
    }
    // sailboats out on the bay
    this.boats = [];
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.5, 6, 8, 1).rotateX(Math.PI / 2), STD({ color: '#ffffff', roughness: 0.4 }));
      hull.scale.set(1, 0.6, 1);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 8), STD({ color: '#ccc' }));
      mast.position.y = 4;
      const sailG = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.6, 0.3), new THREE.Vector3(0, 7.8, 0.2), new THREE.Vector3(0, 0.8, -2.6)]);
      sailG.computeVertexNormals();
      const sail = new THREE.Mesh(sailG, STD({ color: ['#ffffff', '#ffd0e6', '#d0f4ff'][i % 3], side: THREE.DoubleSide }));
      b.add(hull, mast, sail);
      b.position.set(-200 + i * 75 + Math.random() * 20, WATER_Y + 0.3, 230 + Math.random() * 120);
      b.rotation.y = Math.random() * 6;
      this.scene.add(b);
      this.boats.push(b);
    }
  }

  buildPier() {
    const wood = STD({ map: T.woodTexture(), roughness: 0.85 });
    wood.map.repeat.set(1, 1);
    const { x0, x1, z0, z1, y, end } = PIER;
    const deck = [];
    const addDeck = (a0, a1, b0, b1) => {
      const g = boxUV(a1 - a0, 0.4, b1 - b0, 2, 2);
      g.translate((a0 + a1) / 2, y - 0.2, (b0 + b1) / 2);
      deck.push(g);
    };
    addDeck(x0, x1, z0, z1);
    addDeck(end.x0, end.x1, end.z0, end.z1);
    const piles = [];
    for (let z = z0 + 4; z < end.z1; z += 6)
      for (const x of z < end.z0 ? [x0 + 0.5, x1 - 0.5] : [end.x0 + 1, end.x1 - 1, (end.x0 + end.x1) / 2]) {
        const g = new THREE.CylinderGeometry(0.25, 0.25, 6, 8);
        g.translate(x, y - 3.2, z);
        piles.push(g);
      }
    this.add(new THREE.Mesh(mergeGeometries(deck), wood));
    this.add(new THREE.Mesh(mergeGeometries(piles), STD({ color: '#5b4330', roughness: 1 })));
    // railings
    const rails = [];
    for (const x of [x0 + 0.1, x1 - 0.1]) rails.push(new THREE.BoxGeometry(0.1, 0.1, z1 - z0 - 2).translate(x, y + 1, (z0 + z1) / 2 + 1));
    rails.push(new THREE.BoxGeometry(end.x1 - end.x0, 0.1, 0.1).translate((end.x0 + end.x1) / 2, y + 1, end.z1 - 0.1));
    rails.push(new THREE.BoxGeometry(0.1, 0.1, end.z1 - end.z0).translate(end.x0 + 0.1, y + 1, (end.z0 + end.z1) / 2));
    rails.push(new THREE.BoxGeometry(0.1, 0.1, end.z1 - end.z0).translate(end.x1 - 0.1, y + 1, (end.z0 + end.z1) / 2));
    this.add(new THREE.Mesh(mergeGeometries(rails), STD({ color: '#ffffff' })));
    this.places.pier = { x: 30, z: 186 };
    // pier entrance arch with neon
    const arch = new THREE.Mesh(new THREE.BoxGeometry(12, 0.8, 0.8), STD({ color: '#ffffff' }));
    arch.position.set(30, y + 6, z0 + 2);
    this.add(arch);
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 6, 0.8), STD({ color: '#ffffff' }));
      p.position.set(30 + s * 5.6, y + 3, z0 + 2);
      this.add(p);
      this.circles.push({ x: 30 + s * 5.6, z: z0 + 2, r: 0.6 });
    }
    this.sign('SOL PIER', '#3fe0ff', 30, y + 7.4, z0 + 2.45, Math.PI, 1.6, { bg: '#1c1030', both: true });
    // ferris wheel
    const fw = new THREE.Group();
    const R = 14, cy = y + 16.5;
    const wheel = new THREE.Group();
    const rimMat = STD({ color: '#ffffff', metalness: 0.3, roughness: 0.4 });
    for (const zz of [-1.2, 1.2]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.18, 8, 80), rimMat);
      rim.position.z = zz;
      wheel.add(rim);
    }
    const bulbs = [];
    const bulbG = new THREE.SphereGeometry(0.22, 8, 6);
    this.wheelBulbMats = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, R * 2), rimMat);
      sp.rotation.z = a;
      wheel.add(sp);
      const cab = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.3, 10), STD({ color: ['#ff4fa6', '#3fd0e8', '#ffd84a', '#5dff7a'][i % 4], roughness: 0.5 }));
      body.position.y = -1.1;
      const hang = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1), rimMat);
      hang.position.y = -0.3;
      cab.add(body, hang);
      cab.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
      cab.userData.cab = true;
      wheel.add(cab);
    }
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(), toneMapped: false });
      this.wheelBulbMats.push(mat);
      for (const zz of [-1.2, 1.2]) {
        const b = new THREE.Mesh(bulbG, mat);
        b.position.set(Math.cos(a) * R, Math.sin(a) * R, zz);
        wheel.add(b);
      }
    }
    wheel.position.y = cy;
    fw.add(wheel);
    for (const s of [-1, 1])
      for (const zz of [-2.2, 2.2]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 18.5), rimMat);
        leg.position.set(s * 4.5, y + 8, zz);
        leg.rotation.z = s * 0.27;
        fw.add(leg);
      }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 5, 16).rotateX(Math.PI / 2), STD({ color: '#ff4fa6' }));
    hub.position.y = cy;
    fw.add(hub);
    fw.position.set(30, 0, 194);
    fw.traverse((o) => o.isMesh && (o.castShadow = true));
    this.group.add(fw);
    this.ferris = wheel;
    this.solid(23, 37, 191, 197, 30);
    // little carousel-ish kiosk on the pier
    const k = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 2.8, 12), STD({ map: T.stripes(['#ff4fa6', '#ffffff'], 'kiosk'), roughness: 0.6 }));
    k.position.set(20, y + 1.4, 182);
    this.add(k);
    const kr = new THREE.Mesh(new THREE.ConeGeometry(3, 1.6, 12), STD({ color: '#3fd0e8' }));
    kr.position.set(20, y + 3.6, 182);
    this.add(kr);
    this.circles.push({ x: 20, z: 182, r: 2.6 });
  }

  buildLighthouse() {
    const x = 178, z = 150;
    const rocks = new THREE.Group();
    const rm = STD({ color: '#7d766c', roughness: 1, flatShading: true });
    for (let i = 0; i < 9; i++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(4 + Math.random() * 5, 0), rm);
      const a = Math.random() * 6.28, d = Math.random() * 7;
      r.position.set(x + Math.cos(a) * d, WATER_Y - 1 + Math.random() * 2.5, z + Math.sin(a) * d);
      r.rotation.set(Math.random(), Math.random(), Math.random());
      rocks.add(r);
    }
    this.group.add(rocks);
    const base = WATER_Y + 3;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.4, 22, 24), STD({ map: T.lighthouseTexture(), roughness: 0.6 }));
    tower.position.set(x, base + 11, z);
    this.add(tower);
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.5, 24), STD({ color: '#222' }));
    gallery.position.set(x, base + 22.2, z);
    this.add(gallery);
    const lampM = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, 1.6), toneMapped: false });
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.4, 16), lampM);
    lamp.position.set(x, base + 23.7, z);
    this.group.add(lamp);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.2, 16), STD({ color: '#d9363e' }));
    cap.position.set(x, base + 26, z);
    this.add(cap);
    // rotating beams
    const beamMat = new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Group();
    for (const s of [1, -1]) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(5, 90, 24, 1, true), beamMat);
      c.rotation.z = (s * Math.PI) / 2;
      c.position.x = s * 45;
      beam.add(c);
    }
    beam.position.set(x, base + 23.7, z);
    this.group.add(beam);
    this.beam = beam;
    this.beamMat = beamMat;
    this.lampMat = lampM;
  }

  buildHillSign() {
    const text = 'LEONIDA';
    const z = -178, spacing = 7.5;
    const x0 = -((text.length - 1) * spacing) / 2;
    this.signLetters = [];
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === ' ') continue;
      const x = x0 + i * spacing;
      const y = terrainH(x, z);
      const m = new THREE.MeshStandardMaterial({ map: T.letterTexture(ch), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, emissive: '#ffffff', emissiveMap: T.letterTexture(ch), emissiveIntensity: 0, roughness: 0.6 });
      this.nightMats.push(m);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(7, 9), m);
      p.position.set(x, y + 4.2, z + 1);
      p.rotation.x = -0.2;
      p.castShadow = true;
      this.group.add(p);
      for (const s of [-1.6, 1.6]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4), STD({ color: '#555' }));
        post.position.set(x + s, y + 1, z + 1.8);
        this.add(post);
      }
    }
  }

  // ------------------------------------------------------------------ palms + street lamps (instanced)
  palmGeometry() {
    const parts = [];
    const pts = [];
    for (let i = 0; i <= 8; i++) pts.push(new THREE.Vector3(Math.sin(i * 0.18) * 0.9, i * 1.2, 0));
    const curve = new THREE.CatmullRomCurve3(pts);
    const trunk = new THREE.TubeGeometry(curve, 16, 0.28, 8);
    const trunkCol = new THREE.Color('#8a6a48');
    const paint = (g, c) => {
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const k = 0.85 + 0.15 * Math.sin(g.attributes.position.getY(i) * 6);
        col.set([c.r * k, c.g * k, c.b * k], i * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return g;
    };
    parts.push(paint(trunk.toNonIndexed(), trunkCol));
    const top = pts[pts.length - 1];
    const frondCol = new THREE.Color('#3f9a3c');
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const L = 4.4;
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.quadraticCurveTo(L * 0.5, 0.75, L, 0);
      shape.quadraticCurveTo(L * 0.5, -0.75, 0, 0);
      const g = new THREE.ShapeGeometry(shape, 6);
      // droop: bend along x
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const x = p.getX(k), y = p.getY(k);
        p.setXYZ(k, x, -0.12 * x * x + 0.3 * x, y);
      }
      g.rotateY(a);
      g.translate(top.x, top.y, top.z);
      parts.push(paint(g.toNonIndexed(), frondCol));
    }
    const coco = new THREE.SphereGeometry(0.25, 6, 4);
    for (let i = 0; i < 3; i++) parts.push(paint(coco.clone().translate(top.x + Math.cos(i * 2) * 0.35, top.y - 0.3, Math.sin(i * 2) * 0.35).toNonIndexed(), new THREE.Color('#5a4022')));
    return mergeGeometries(parts);
  }

  buildPalmsAndLamps() {
    const spots = [];
    // promenade + beach
    for (let x = -112; x <= 112; x += 14) if (Math.abs(x - 30) > 8) spots.push([x, 105.5]);
    for (let x = -105; x <= 120; x += 23) spots.push([x + 6, 112 + Math.random() * 5]);
    // town square
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      spots.push([Math.cos(a) * 21, Math.sin(a) * 21]);
    }
    // block sidewalks facing the main streets
    for (const z of [42, 87.5]) for (let x = -90; x <= 90; x += 18) if (Math.abs(x) > 26 || z === 42) spots.push([x, z]);
    for (const [x, z] of [[96, -50], [96, -90], [48, -46], [48, -30], [-40, 0], [-40, 16], [62, 18], [76, 18], [-98, 40], [-98, 60], [-98, -20], [-98, -60]]) spots.push([x, z]);
    // hills + east coast
    const R = T.rng(5);
    for (let i = 0; i < 40; i++) {
      const x = -170 + R() * 340, z = -125 - R() * 60;
      if (Math.abs(z + 178) < 8 && Math.abs(x) < 40) continue;
      spots.push([x, z]);
    }
    for (let z = -100; z < 110; z += 16) spots.push([122 + R() * 6, z]);
    for (let i = spots.length - 1; i >= 0; i--) if (this.blocked(spots[i][0], spots[i][1], 0.9)) spots.splice(i, 1);
    const g = this.palmGeometry();
    const m = STD({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
    const inst = new THREE.InstancedMesh(g, m, spots.length);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    spots.forEach(([x, z], i) => {
      const y = this.groundY(x, z);
      const sc = 0.85 + Math.random() * 0.45;
      q.setFromEuler(new THREE.Euler(0, Math.random() * Math.PI * 2, 0));
      M.compose(p.set(x, y - 0.1, z), q, s.set(sc, sc, sc));
      inst.setMatrixAt(i, M);
      if (y < 4 || Math.abs(x) < 130) this.circles.push({ x, z, r: 0.45 });
    });
    inst.castShadow = true;
    inst.receiveShadow = true;
    this.group.add(inst);

    // street lamps along the sidewalks (curb side), glow pools at night
    const lampSpots = [];
    for (let i = 0; i < ROADS_X.length; i++)
      for (let z = -100; z <= 92; z += 24) {
        const x = ROADS_X[i];
        if (ROADS_Z.some((rz) => Math.abs(rz - z) < 10)) continue;
        lampSpots.push([x - RW - 0.8, z, Math.PI / 2], [x + RW + 0.8, z + 12, -Math.PI / 2]);
      }
    for (let j = 0; j < ROADS_Z.length; j++)
      for (let x = -100; x <= 100; x += 24) {
        const z = ROADS_Z[j];
        if (ROADS_X.some((rx) => Math.abs(rx - x) < 10)) continue;
        lampSpots.push([x, z - RW - 0.8, 0], [x + 12, z + RW + 0.8, Math.PI]);
      }
    for (let i = lampSpots.length - 1; i >= 0; i--) if (this.blocked(lampSpots[i][0], lampSpots[i][1], 0.4)) lampSpots.splice(i, 1);
    const pole = new THREE.CylinderGeometry(0.1, 0.14, 6.2, 8).translate(0, 3.1, 0);
    const arm = new THREE.BoxGeometry(0.1, 0.1, 1.6).translate(0, 6.1, 0.8);
    const poleM = new THREE.InstancedMesh(mergeGeometries([pole.toNonIndexed(), arm.toNonIndexed()]), STD({ color: '#2d3440', metalness: 0.5, roughness: 0.4 }), lampSpots.length);
    this.lampHeadMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2cc'), toneMapped: false });
    const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.18, 0.8).translate(0, 6.0, 1.4), this.lampHeadMat, lampSpots.length);
    this.poolMat = new THREE.MeshBasicMaterial({ map: T.radialGlow('#ffcf86'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2).translate(0, 0.05, 1.4), this.poolMat, lampSpots.length);
    this.lamps = [];
    lampSpots.forEach(([x, z, yaw], i) => {
      const y = this.groundY(x, z);
      q.setFromEuler(new THREE.Euler(0, yaw, 0));
      M.compose(p.set(x, y, z), q, s.set(1, 1, 1));
      poleM.setMatrixAt(i, M);
      head.setMatrixAt(i, M);
      M.compose(p.set(x, 0.17, z), q, s.set(1, 1, 1));
      pools.setMatrixAt(i, M);
      this.circles.push({ x, z, r: 0.25 });
      this.lamps.push(new THREE.Vector3(x + Math.sin(yaw) * 1.4, 5.8, z + Math.cos(yaw) * 1.4));
    });
    poleM.castShadow = true;
    this.group.add(poleM, head, pools);

    // traffic lights at the four inner crossings
    this.signals = [];
    const lightG = new THREE.SphereGeometry(0.16, 8, 6);
    for (const x of ROADS_X.slice(1, 3))
      for (const z of ROADS_Z.slice(1, 3)) {
        const sig = { x, z, phase: Math.random() * 24, heads: [] };
        for (const [ox, oz, yaw, axis] of [[RW + 1, RW + 1, Math.PI, 'z'], [-RW - 1, -RW - 1, 0, 'z'], [-RW - 1, RW + 1, Math.PI / 2, 'x'], [RW + 1, -RW - 1, -Math.PI / 2, 'x']]) {
          const g2 = new THREE.Group();
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4.2).translate(0, 2.1, 0), STD({ color: '#2d3440' }));
          const box = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.3, 0.35), STD({ color: '#1d1f24' }));
          box.position.set(0, 3.7, 0);
          g2.add(post, box);
          const mats = ['#ff2a2a', '#ffb300', '#2aff6a'].map((c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));
          mats.forEach((mm, k) => {
            const l = new THREE.Mesh(lightG, mm);
            l.position.set(0, 4.1 - k * 0.4, 0.18);
            g2.add(l);
          });
          g2.position.set(x + ox, SIDEWALK_Y, z + oz);
          g2.rotation.y = yaw;
          this.group.add(g2);
          sig.heads.push({ axis, mats });
          this.circles.push({ x: x + ox, z: z + oz, r: 0.25 });
        }
        this.signals.push(sig);
      }
  }

  // green for traffic moving along `axis` ('x' or 'z')?  cycle: z green 10s, amber 2, x green 10, amber 2
  signalAt(x, z) {
    return this.signals.find((s) => Math.abs(s.x - x) < 1 && Math.abs(s.z - z) < 1);
  }

  signalState(sig, axis) {
    const t = (this.time + sig.phase) % 24;
    const zs = t < 10 ? 'g' : t < 12 ? 'a' : 'r';
    const xs = t < 12 ? 'r' : t < 22 ? 'g' : 'a';
    return axis === 'z' ? zs : xs;
  }

  // ------------------------------------------------------------------ graph for traffic + police
  buildGraph() {
    this.nodes = [];
    for (let i = 0; i < ROADS_X.length; i++)
      for (let j = 0; j < ROADS_Z.length; j++) this.nodes.push({ i, j, x: ROADS_X[i], z: ROADS_Z[j], links: [] });
    const at = (i, j) => this.nodes.find((n) => n.i === i && n.j === j);
    for (const n of this.nodes)
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const m = at(n.i + di, n.j + dj);
        if (m) n.links.push(m);
      }
  }

  nearestNode(x, z) {
    let best = null, bd = Infinity;
    for (const n of this.nodes) {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) (bd = d), (best = n);
    }
    return best;
  }

  // BFS shortest path over the (unweighted, equal-ish) grid
  path(from, to) {
    const prev = new Map([[from, null]]);
    const q = [from];
    while (q.length) {
      const n = q.shift();
      if (n === to) break;
      for (const m of n.links)
        if (!prev.has(m)) {
          prev.set(m, n);
          q.push(m);
        }
    }
    const out = [];
    for (let n = to; n; n = prev.get(n)) out.unshift(n);
    return out;
  }

  // ------------------------------------------------------------------ sidewalk loops for pedestrians
  buildPedLoops() {
    this.pedLoops = [];
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        const x0 = ROADS_X[i] + RW + 2, x1 = ROADS_X[i + 1] - RW - 2, z0 = ROADS_Z[j] + RW + 2, z1 = ROADS_Z[j + 1] - RW - 2;
        this.pedLoops.push([new THREE.Vector2(x0, z0), new THREE.Vector2(x1, z0), new THREE.Vector2(x1, z1), new THREE.Vector2(x0, z1)]);
      }
    const o = 116 - 2, s = ROADS_Z[3] + RW + 3;
    this.pedLoops.push([new THREE.Vector2(-o, -o), new THREE.Vector2(o, -o), new THREE.Vector2(o, s), new THREE.Vector2(-o, s)]);
  }

  // ------------------------------------------------------------------ queries
  // is (x, z) on a road (or inside a building)? props are never placed there
  onRoad(x, z, margin = 0.5) {
    const z0 = ROADS_Z[0] - RW, z1 = ROADS_Z[ROADS_Z.length - 1] + RW, x0 = ROADS_X[0] - RW, x1 = ROADS_X[ROADS_X.length - 1] + RW;
    for (const rx of ROADS_X) if (Math.abs(x - rx) < RW + margin && z > z0 - margin && z < z1 + margin) return true;
    for (const rz of ROADS_Z) if (Math.abs(z - rz) < RW + margin && x > x0 - margin && x < x1 + margin) return true;
    return false;
  }

  blocked(x, z, margin = 0.5) {
    if (this.onRoad(x, z, margin)) return true;
    return this.solids.some((s) => x > s.x0 - margin && x < s.x1 + margin && z > s.z0 - margin && z < s.z1 + margin);
  }

  groundY(x, z) {
    // pier deck
    if (((x > PIER.x0 && x < PIER.x1 && z > PIER.z0 && z < PIER.z1) || (x > PIER.end.x0 && x < PIER.end.x1 && z > PIER.end.z0 && z < PIER.end.z1)))
      return PIER.y;
    if (x > RAMP.x0 && x < RAMP.x1 && z > RAMP.z0 && z < RAMP.z1) return this.rampY + ((x - RAMP.x0) / (RAMP.x1 - RAMP.x0)) * RAMP.h;
    for (const r of this.raised) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return SIDEWALK_Y;
    return terrainH(x, z);
  }

  // push a circle (pos: Vector3, x/z used) out of solids; returns the push normal or null
  collide(pos, r, y = 0) {
    let hit = null;
    for (const s of this.solids) {
      if (y > s.h) continue;
      if (pos.x < s.x0 - r || pos.x > s.x1 + r || pos.z < s.z0 - r || pos.z > s.z1 + r) continue;
      const cx = Math.max(s.x0, Math.min(pos.x, s.x1)), cz = Math.max(s.z0, Math.min(pos.z, s.z1));
      let dx = pos.x - cx, dz = pos.z - cz;
      let d = Math.hypot(dx, dz);
      if (d === 0) {
        // centre inside: push out along the shallowest side
        const pen = [pos.x - s.x0, s.x1 - pos.x, pos.z - s.z0, s.z1 - pos.z];
        const k = pen.indexOf(Math.min(...pen));
        dx = [-1, 1, 0, 0][k];
        dz = [0, 0, -1, 1][k];
        const p = pen[k] + r;
        pos.x += dx * p;
        pos.z += dz * p;
        hit = { x: dx, z: dz, depth: p };
        continue;
      }
      if (d < r) {
        dx /= d;
        dz /= d;
        pos.x += dx * (r - d);
        pos.z += dz * (r - d);
        hit = { x: dx, z: dz, depth: r - d };
      }
    }
    for (const c of this.circles) {
      const dx = pos.x - c.x, dz = pos.z - c.z, rr = r + c.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x += (dx / d) * (rr - d);
        pos.z += (dz / d) * (rr - d);
        hit = { x: dx / d, z: dz / d, depth: rr - d };
      }
    }
    return hit;
  }

  // distance along a 2D segment until it enters a solid taller than y (for the camera)
  rayClear(ax, az, bx, bz, y) {
    let t = 1;
    for (const s of this.solids) {
      if (y > s.h) continue;
      // slab test
      let t0 = 0, t1 = 1;
      const dx = bx - ax, dz = bz - az;
      for (const [o, d, mn, mx] of [[ax, dx, s.x0 - 0.4, s.x1 + 0.4], [az, dz, s.z0 - 0.4, s.z1 + 0.4]]) {
        if (Math.abs(d) < 1e-6) {
          if (o < mn || o > mx) t0 = 2;
        } else {
          let a = (mn - o) / d, b = (mx - o) / d;
          if (a > b) [a, b] = [b, a];
          t0 = Math.max(t0, a);
          t1 = Math.min(t1, b);
        }
      }
      if (t0 <= t1 && t0 < t) t = t0;
    }
    return t;
  }

  update(dt, t, night) {
    this.time = t;
    this.waterUniforms.uTime.value = t;
    this.waterNormal.offset.x += dt * 0.004;
    this.waterNormal.offset.y += dt * 0.006;
    this.ferris.rotation.z += dt * 0.08;
    for (const c of this.ferris.children) if (c.userData.cab) c.rotation.z = -this.ferris.rotation.z;
    // bulbs chase colours (brighter at night)
    const k = 1 + night * 4;
    this.wheelBulbMats.forEach((m, i) => m.color.setHSL(((i / 64) + t * 0.15) % 1, 1, 0.55).multiplyScalar(k));
    this.beam.rotation.y += dt * 0.9;
    this.beamMat.opacity = 0.07 * night;
    this.lampMat.color.setRGB(1 + 2 * night, 0.9 + 1.7 * night, 0.6 + 1.1 * night);
    for (const m of this.nightMats) m.emissiveIntensity = night * 1.2;
    this.lampHeadMat.color.setRGB(1 + 4 * night, 0.95 + 3.4 * night, 0.8 + 2.4 * night);
    this.poolMat.opacity = night * 0.55;
    for (const n of this.neon) {
      let v = 1.6 + night * 3.4;
      if (n.flicker && Math.sin(t * 13 + n.phase) > 0.93) v *= 0.3;
      n.mat.color.setScalar(v);
    }
    for (const f of this.animated) f(t);
    for (const b of this.boats) {
      b.position.y = WATER_Y + 0.25 + Math.sin(t * 1.3 + b.position.x) * 0.15;
      b.rotation.z = Math.sin(t * 0.9 + b.position.z) * 0.06;
    }
    for (const s of this.signals)
      for (const h of s.heads) {
        const st = this.signalState(s, h.axis);
        h.mats[0].color.setScalar(0).r = st === 'r' ? 3 : 0.15;
        h.mats[1].color.setRGB(st === 'a' ? 3 : 0.15, st === 'a' ? 1.8 : 0.1, 0);
        h.mats[2].color.setRGB(0, st === 'g' ? 3 : 0.12, st === 'g' ? 1.2 : 0.05);
      }
  }

  setClock(hour) {
    for (const { hand, hour: isHour } of this.clockHands || []) hand.rotation.z = -((isHour ? hour / 12 : (hour % 1)) * Math.PI * 2);
  }
}
