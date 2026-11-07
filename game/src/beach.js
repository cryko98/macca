// Beach life: loungers, surfboards, volleyball, sandcastles, beach balls, shells, rocks, flags,
// a buoy line, a swim raft, and boats + a jet ski moving across the bay.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATER_Y, PIER, RAMP, terrainH } from './world.js';
import { stripes, rng } from './textures.js';

const STD = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });
const R = rng(2024);
const rnd = (a, b) => a + R() * (b - a);
const free = (x) => Math.abs(x - 30) > 9 && !(x > RAMP.x0 - 6 && x < RAMP.x1 + 6) && Math.abs(x + 20) > 6;

export class Beach {
  constructor(G) {
    this.G = G;
    const S = G.scene;
    this.group = new THREE.Group();
    S.add(this.group);
    const add = (m, cast = true) => ((m.castShadow = cast), (m.receiveShadow = true), this.group.add(m), m);
    const groundAt = (x, z) => terrainH(x, z);

    // ---- beach club rows: umbrella + two loungers, west and east of the pier
    const lounger = mergeGeometries([
      new THREE.BoxGeometry(0.7, 0.08, 1.4).translate(0, 0.32, 0.15),
      new THREE.BoxGeometry(0.7, 0.08, 0.6).rotateX(-0.9).translate(0, 0.55, -0.72),
      ...[[-0.3, 0.5], [0.3, 0.5], [-0.3, -0.45], [0.3, -0.45]].map(([x, z]) => new THREE.BoxGeometry(0.05, 0.3, 0.05).translate(x, 0.15, z)),
    ].map((g) => g.toNonIndexed()));
    const spots = [];
    for (const [x0, x1] of [[-112, -72], [48, 112]])
      for (let x = x0; x <= x1; x += 8) for (const z of [111, 116.5]) if (free(x)) spots.push([x + rnd(-0.6, 0.6), z]);
    const lm = new THREE.InstancedMesh(lounger, STD('#ffffff'), spots.length * 2);
    const umbCols = [['#ff4fa6', '#ffffff'], ['#3fd0e8', '#ffffff'], ['#ffd84a', '#ff7a3c'], ['#2fb3a4', '#ffffff']];
    const cushion = ['#ff4fa6', '#3fd0e8', '#ffd84a', '#2fb3a4', '#ffffff'];
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    spots.forEach(([x, z], i) => {
      const y = groundAt(x, z);
      for (const s of [-1, 1]) {
        Q.identity();
        M.compose(V.set(x + s * 0.65, y, z + 0.6), Q, one);
        lm.setMatrixAt(i * 2 + (s > 0), M);
        lm.setColorAt(i * 2 + (s > 0), new THREE.Color(cushion[(i + (s > 0)) % cushion.length]));
      }
      const c = umbCols[i % umbCols.length];
      const pole = add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.7), STD('#f4f1ea')));
      pole.position.set(x, y + 1.35, z - 0.2);
      const top = add(new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.6, 12, 1, true), STD('#fff', { map: stripes(c, c.join('') + 'club'), side: THREE.DoubleSide })));
      top.position.set(x, y + 2.7, z - 0.2);
      G.world.circles.push({ x, z: z - 0.2, r: 0.2 });
    });
    lm.instanceColor.needsUpdate = true;
    add(lm);

    // ---- surf rental: a rack of boards stuck in the sand + a few lying around
    const boardCols = ['#ff4fa6', '#3fd0e8', '#ffd84a', '#ff7a3c', '#5dff7a', '#ffffff', '#9b7cf4'];
    const boardG = new THREE.SphereGeometry(1, 12, 8);
    for (let i = 0; i < 7; i++) {
      const x = 40 + i * 0.75, z = 109.5;
      const b = add(new THREE.Mesh(boardG, STD(boardCols[i], { roughness: 0.35 })));
      b.scale.set(0.28, 1.1, 0.05);
      b.position.set(x, groundAt(x, z) + 0.9, z);
      b.rotation.z = (i % 2 ? 1 : -1) * 0.06;
    }
    G.world.circles.push({ x: 42.3, z: 109.5, r: 2.6 });
    for (let i = 0; i < 5; i++) {
      const x = rnd(-100, 100), z = rnd(112, 119);
      if (!free(x)) continue;
      const b = add(new THREE.Mesh(boardG, STD(boardCols[i + 2], { roughness: 0.35 })));
      b.scale.set(0.28, 0.05, 1.1);
      b.position.set(x, groundAt(x, z) + 0.05, z);
      b.rotation.y = rnd(0, 3);
    }

    // ---- beach volleyball court with net + ball
    {
      const cx = -38, cz = 114, y = groundAt(cx, cz);
      for (const s of [-1, 1]) {
        const p = add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6), STD('#e9e4da')));
        p.position.set(cx + s * 4.5, y + 1.3, cz);
        G.world.circles.push({ x: cx + s * 4.5, z: cz, r: 0.15 });
      }
      const netTex = (() => {
        const c = document.createElement('canvas');
        c.width = 64;
        c.height = 16;
        const g = c.getContext('2d');
        g.strokeStyle = '#111';
        g.lineWidth = 1;
        for (let i = 0; i <= 64; i += 4) (g.beginPath(), g.moveTo(i, 0), g.lineTo(i, 16), g.stroke());
        for (let j = 0; j <= 16; j += 4) (g.beginPath(), g.moveTo(0, j), g.lineTo(64, j), g.stroke());
        g.fillStyle = '#fff';
        g.fillRect(0, 0, 64, 2);
        const t = new THREE.CanvasTexture(c);
        t.wrapS = THREE.RepeatWrapping;
        t.repeat.x = 4;
        return t;
      })();
      const net = add(new THREE.Mesh(new THREE.PlaneGeometry(9, 1), new THREE.MeshStandardMaterial({ map: netTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide })), false);
      net.position.set(cx, y + 2.1, cz);
      // court lines
      const lines = add(new THREE.Mesh(new THREE.RingGeometry(0, 1, 4), new THREE.MeshBasicMaterial({ color: '#3fd0e8' })), false);
      lines.visible = false;
    }

    // ---- sandcastles
    for (const [x, z] of [[-60, 118], [8, 119], [72, 118.5], [-98, 117]]) {
      const y = groundAt(x, z);
      const sand = STD('#e2c58e', { roughness: 1 });
      const base = add(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, 0.4, 10), sand));
      base.position.set(x, y + 0.2, z);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2;
        const t = add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 8), sand));
        t.position.set(x + Math.cos(a) * 0.55, y + 0.45, z + Math.sin(a) * 0.55);
        const c = add(new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.22, 8), sand));
        c.position.set(t.position.x, y + 0.8, t.position.z);
      }
      const keep = add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.7, 8), sand));
      keep.position.set(x, y + 0.7, z);
      const flag = add(new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.15), STD('#ff4fa6', { side: THREE.DoubleSide })), false);
      flag.position.set(x + 0.13, y + 1.25, z);
      const bucket = add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.26, 10), STD(['#ff4fa6', '#3fd0e8', '#ffd84a'][Math.floor(rnd(0, 3))])));
      bucket.position.set(x + 1.1, y + 0.13, z + 0.4);
    }

    // ---- shells + starfish scattered on the wet sand
    {
      const shells = [];
      for (let i = 0; i < 70; i++) {
        const x = rnd(-120, 120), z = rnd(116, 123);
        const y = groundAt(x, z);
        if (y < WATER_Y + 0.02) continue;
        shells.push([x, y, z]);
      }
      const star = new THREE.Shape();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2, r = k % 2 ? 0.05 : 0.13;
        k ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      const starG = new THREE.ExtrudeGeometry(star, { depth: 0.02, bevelEnabled: false }).rotateX(-Math.PI / 2);
      const shellG = new THREE.SphereGeometry(0.07, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
      const si = new THREE.InstancedMesh(starG, STD('#ff7a3c'), shells.length);
      const sh = new THREE.InstancedMesh(shellG, STD('#fff1e0', { roughness: 0.4 }), shells.length);
      shells.forEach(([x, y, z], i) => {
        Q.setFromEuler(new THREE.Euler(0, rnd(0, 6.28), 0));
        M.compose(V.set(x, y + 0.01, z), Q, one);
        si.setMatrixAt(i, M);
        M.compose(V.set(x + 0.6, y, z - 0.3), Q, one);
        sh.setMatrixAt(i, M);
      });
      add(si, false);
      add(sh, false);
    }

    // ---- rocks closing both ends of the beach
    const rockM = STD('#8b8378', { roughness: 1, flatShading: true });
    for (const cx of [-128, 132])
      for (let i = 0; i < 9; i++) {
        const r = add(new THREE.Mesh(new THREE.DodecahedronGeometry(rnd(1, 2.6), 0), rockM));
        const x = cx + rnd(-5, 5), z = rnd(108, 132);
        r.position.set(x, terrainH(x, z) + rnd(-0.2, 0.6), z);
        r.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3));
      }

    // ---- lifeguard flags
    for (const [x, c] of [[-84, '#ff3b3b'], [-80, '#ffd84a'], [74, '#ff3b3b'], [78, '#ffd84a']]) {
      const z = 121, y = groundAt(x, z);
      const p = add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3), STD('#ddd')));
      p.position.set(x, y + 1.5, z);
      const f = add(new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6, 6, 1), STD(c, { side: THREE.DoubleSide })), false);
      f.position.set(x + 0.47, y + 2.65, z);
      (this.flags ??= []).push(f);
    }

    // ---- beach balls that Macca can kick
    this.balls = [];
    const ballTex = stripes(['#ff4fa6', '#ffffff', '#3fd0e8', '#ffd84a'], 'beachball');
    for (const [x, z] of [[-40, 117], [-10, 113], [60, 115], [95, 113], [-75, 113]]) {
      const b = add(new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), STD('#fff', { map: ballTex, roughness: 0.35 })));
      const y = groundAt(x, z) + 0.35;
      b.position.set(x, y, z);
      this.balls.push({ m: b, vel: new THREE.Vector3(), r: 0.35 });
    }

    // ---- buoy line marking the swimming area, and a swim raft
    this.buoys = [];
    const buoyM = [STD('#ff3b3b', { roughness: 0.4 }), STD('#ffffff', { roughness: 0.4 })];
    for (let x = -110; x <= 120; x += 6) {
      if (Math.abs(x - 30) < 10) continue;
      const b = add(new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), buoyM[(x / 6) & 1]));
      b.position.set(x, WATER_Y, 146);
      this.buoys.push(b);
    }
    {
      const raft = new THREE.Group();
      const wood = STD('#9b6f4b', { map: stripes(['#9b6f4b', '#7f5a3b'], 'raft', false) });
      const deck = new THREE.Mesh(new THREE.BoxGeometry(4, 0.25, 4), wood);
      deck.position.y = 0.35;
      raft.add(deck);
      for (const [x, z] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.5, 10), STD('#3d6ea8'));
        drum.position.set(x, 0.05, z);
        raft.add(drum);
      }
      const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1, 0.05), STD('#ccc', { metalness: 0.6 }));
      ladder.position.set(0, 0.1, 2.02);
      raft.add(ladder);
      raft.position.set(-45, WATER_Y, 160);
      raft.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true));
      this.group.add(raft);
      this.raft = raft;
    }

    // ---- boats: an anchored yacht, two speedboats and a jet ski doing laps
    const hull = (len, w, col) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(w, w * 0.5, len, 10, 1).rotateX(Math.PI / 2), STD(col, { roughness: 0.3 }));
      body.scale.set(1, 0.45, 1);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(w * 1.4, 0.12, len * 0.7), STD('#efe6da'));
      deck.position.set(0, w * 0.22, -len * 0.05);
      const screen = new THREE.Mesh(new THREE.BoxGeometry(w * 1.3, w * 0.45, 0.08), new THREE.MeshStandardMaterial({ color: '#9fd8ff', transparent: true, opacity: 0.6, roughness: 0.05 }));
      screen.position.set(0, w * 0.5, len * 0.12);
      screen.rotation.x = -0.4;
      g.add(body, deck, screen);
      g.traverse((o) => o.isMesh && (o.castShadow = true));
      return g;
    };
    this.boats = [];
    {
      const y = hull(16, 2.4, '#ffffff');
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.6, 6), STD('#f4f1ea'));
      cabin.position.set(0, 1.4, -1.5);
      const win = new THREE.Mesh(new THREE.BoxGeometry(3.45, 0.5, 5), STD('#1d3550', { roughness: 0.1 }));
      win.position.set(0, 1.6, -1.5);
      const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 3.2), STD('#ffffff'));
      top.position.set(0, 2.6, -2);
      y.add(cabin, win, top);
      y.position.set(110, WATER_Y + 0.2, 230);
      y.rotation.y = 0.6;
      this.group.add(y);
      this.boats.push({ m: y, mode: 'anchor', phase: 0 });
    }
    for (const [cx, cz, r, sp, col] of [[-40, 230, 60, 0.12, '#ff4fa6'], [80, 270, 45, -0.16, '#3fd0e8']]) {
      const b = hull(6, 1.1, col);
      this.group.add(b);
      this.boats.push({ m: b, mode: 'lap', cx, cz, r, sp, a: rnd(0, 6.28), wake: 0 });
    }
    {
      const js = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.8, 4, 8).rotateX(Math.PI / 2), STD('#ffd84a', { roughness: 0.3 }));
      body.scale.set(1, 0.6, 1);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.25, 0.9), STD('#222'));
      seat.position.set(0, 0.3, -0.3);
      const rider = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.6, 4, 8), STD('#ff4fa6'));
      rider.position.set(0, 0.85, -0.1);
      rider.rotation.x = 0.4;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), STD('#c99069'));
      head.position.set(0, 1.35, 0.1);
      js.add(body, seat, rider, head);
      js.traverse((o) => o.isMesh && (o.castShadow = true));
      this.group.add(js);
      this.boats.push({ m: js, mode: 'lap', cx: 0, cz: 185, r: 28, sp: 0.35, a: 0, wake: 0, jet: true });
    }
  }

  update(dt) {
    const G = this.G, t = performance.now() / 1000;
    const pl = G.player, P = pl.car ? pl.car.pos : pl.pos;
    // buoys + raft bob
    this.buoys.forEach((b, i) => (b.position.y = WATER_Y + 0.05 + Math.sin(t * 1.6 + i * 0.7) * 0.08));
    this.raft.position.y = WATER_Y + Math.sin(t * 1.2) * 0.07;
    this.raft.rotation.z = Math.sin(t * 0.9) * 0.025;
    for (const f of this.flags || []) {
      const p = f.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        p.setZ(i, Math.sin(x * 6 - t * 6) * 0.06 * (x + 0.45));
      }
      p.needsUpdate = true;
    }
    // beach balls: kicked by Macca, roll and bounce on the sand
    for (const b of this.balls) {
      const m = b.m;
      const d = m.position.distanceTo(P.clone().setY(m.position.y));
      if (!pl.car && d < 1.1) {
        const dir = m.position.clone().sub(P).setY(0).normalize();
        b.vel.copy(dir).multiplyScalar(6 + Math.random() * 3);
        b.vel.y = 4 + Math.random() * 2;
      }
      b.vel.y -= 14 * dt;
      b.vel.x *= Math.exp(-0.8 * dt);
      b.vel.z *= Math.exp(-0.8 * dt);
      m.position.addScaledVector(b.vel, dt);
      const g = Math.max(terrainH(m.position.x, m.position.z), WATER_Y - 0.15) + b.r;
      if (m.position.y < g) {
        m.position.y = g;
        b.vel.y = Math.abs(b.vel.y) > 1.5 ? -b.vel.y * 0.55 : 0;
      }
      G.world.collide(m.position, b.r, 0);
      m.rotation.x += b.vel.z * dt / b.r;
      m.rotation.z -= b.vel.x * dt / b.r;
    }
    // boats
    for (const b of this.boats) {
      if (b.mode === 'anchor') {
        b.m.position.y = WATER_Y + 0.2 + Math.sin(t * 0.8) * 0.12;
        b.m.rotation.z = Math.sin(t * 0.6) * 0.03;
        continue;
      }
      b.a += b.sp * dt;
      const x = b.cx + Math.cos(b.a) * b.r, z = b.cz + Math.sin(b.a) * b.r;
      const dir = Math.sign(b.sp);
      b.m.position.set(x, WATER_Y + (b.jet ? 0.15 : 0.25) + Math.sin(t * 3 + b.r) * 0.06, z);
      b.m.rotation.set(-0.06, Math.atan2(-Math.sin(b.a) * dir, Math.cos(b.a) * dir), -dir * (b.jet ? 0.35 : 0.15), 'YXZ');
      if ((b.wake -= dt) <= 0) {
        b.wake = b.jet ? 0.12 : 0.18;
        const back = b.m.position.clone().setY(WATER_Y + 0.03);
        G.fx.ripple(back, b.jet ? 0.9 : 1.6);
        if (b.m.position.distanceTo(G.camera.position) < 120) G.fx.splash(back, b.jet ? 2 : 1, 0.6);
      }
    }
  }
}
