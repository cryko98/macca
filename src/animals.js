// Wildlife of Leonida: seagulls, pelicans, flamingos, dogs, crabs and dolphins.
// All procedural low-poly models with their own simple motion; they react to Macca.
import * as THREE from 'three';
import { WATER_Y, PIER } from './world.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const rnd = (a, b) => a + Math.random() * (b - a);
const STD = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o });

function shadowAll(g) {
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  return g;
}

// ------------------------------------------------------------------ models
function birdModel(kind) {
  const pel = kind === 'pelican';
  const S = pel ? 1.7 : 1;
  const g = new THREE.Group();
  const white = STD(pel ? '#9a8f84' : '#f7f7f4'), grey = STD(pel ? '#6d6259' : '#9aa3ab'), beakM = STD(pel ? '#e8a23a' : '#f2c230');
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16 * S, 10, 8), white);
  body.scale.set(1, 0.85, 1.9);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.09 * S, 10, 8), pel ? STD('#efe6d6') : white);
  head.position.set(0, 0.12 * S, 0.27 * S);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03 * S, (pel ? 0.32 : 0.12) * S, 6).rotateX(Math.PI / 2), beakM);
  beak.position.set(0, 0.1 * S, (pel ? 0.5 : 0.39) * S);
  if (pel) {
    const pouch = new THREE.Mesh(new THREE.SphereGeometry(0.06 * S, 8, 6), STD('#e0904a'));
    pouch.scale.set(0.8, 0.6, 2.2);
    pouch.position.set(0, 0.05 * S, 0.47 * S);
    g.add(pouch);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.14 * S, 0.02, 0.14 * S), grey);
  tail.position.set(0, 0.02, -0.33 * S);
  g.add(body, head, beak, tail);
  const wings = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.1 * S, 0.06 * S, 0.02);
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.55 * S, 0.02, 0.2 * S), grey);
    w.position.x = s * 0.27 * S;
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.16 * S, 0.021, 0.12 * S), STD('#2b2b2b'));
    tip.position.x = s * 0.5 * S;
    pivot.add(w, tip);
    g.add(pivot);
    wings.push({ pivot, s });
  }
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.02), beakM);
  legs.position.set(0, -0.2, 0);
  g.add(legs);
  g.userData = { wings, legs, S };
  return shadowAll(g);
}

function flamingoModel() {
  const g = new THREE.Group();
  const pink = STD('#ff7eb6'), deep = STD('#ff4f9a'), dark = STD('#222');
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), pink);
  body.scale.set(0.85, 0.75, 1.35);
  body.position.y = 1.0;
  const wing = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), deep);
  wing.scale.set(1, 0.6, 1.3);
  wing.position.set(0, 1.05, -0.05);
  const neck = new THREE.Group();
  neck.position.set(0, 1.12, 0.28);
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.25, 0.12), new THREE.Vector3(0, 0.45, -0.02), new THREE.Vector3(0, 0.6, 0.1)]);
  neck.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.035, 6), pink));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), pink);
  head.position.set(0, 0.62, 0.12);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 6), dark);
  beak.rotation.x = Math.PI / 1.5;
  beak.position.set(0, 0.57, 0.2);
  neck.add(head, beak);
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.07, 0.95, 0);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.95).translate(0, -0.475, 0), deep);
    hip.add(leg);
    g.add(hip);
    legs.push(hip);
  }
  g.add(body, wing, neck);
  g.userData = { neck, legs };
  return shadowAll(g);
}

const DOG_COLORS = [['#a0703c', '#7a5028'], ['#f2efe8', '#d9d2c3'], ['#2a2420', '#151210'], ['#d9a84f', '#b8862e'], ['#8a8f96', '#5f646b']];
function dogModel() {
  const [c1, c2] = DOG_COLORS[Math.floor(Math.random() * DOG_COLORS.length)];
  const S = rnd(0.8, 1.25);
  const g = new THREE.Group();
  const m1 = STD(c1), m2 = STD(c2), nose = STD('#111');
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.36, 4, 10).rotateX(Math.PI / 2), m1);
  body.position.y = 0.42;
  const head = new THREE.Group();
  head.position.set(0, 0.6, 0.3);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), m1);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.14), m2);
  snout.position.set(0, -0.03, 0.12);
  const n = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), nose);
  n.position.set(0, -0.01, 0.2);
  head.add(skull, snout, n);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.08), m2);
    ear.position.set(s * 0.09, 0.06, -0.02);
    ear.rotation.z = s * 0.4;
    head.add(ear);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.5, -0.28);
  tail.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.25).translate(0, 0.12, 0).rotateX(-0.6), m1));
  const legs = [];
  for (const [x, z] of [[-0.08, 0.18], [0.08, 0.18], [-0.08, -0.18], [0.08, -0.18]]) {
    const hip = new THREE.Group();
    hip.position.set(x, 0.36, z);
    hip.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.36).translate(0, -0.18, 0), m2));
    g.add(hip);
    legs.push(hip);
  }
  g.add(body, head, tail);
  g.scale.setScalar(S);
  g.userData = { legs, tail, head };
  return shadowAll(g);
}

function crabModel() {
  const g = new THREE.Group();
  const m = STD('#e2552d', { roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 6), m);
  body.scale.set(1.3, 0.5, 1);
  body.position.y = 0.06;
  g.add(body);
  for (const s of [-1, 1]) {
    const claw = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), m);
    claw.scale.set(1, 0.7, 1.5);
    claw.position.set(s * 0.1, 0.07, 0.11);
    g.add(claw);
    for (let k = 0; k < 3; k++) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.012), m);
      leg.position.set(s * 0.15, 0.04, -0.04 + k * 0.04);
      leg.rotation.z = -s * 0.5;
      g.add(leg);
    }
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 4), STD('#111'));
    eye.position.set(s * 0.03, 0.12, 0.07);
    g.add(eye);
  }
  return shadowAll(g);
}

function dolphinModel() {
  const g = new THREE.Group();
  const m = STD('#7f93a6', { roughness: 0.35 }), belly = STD('#dfe6ec', { roughness: 0.4 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 10), m);
  body.scale.set(0.8, 0.8, 3.2);
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), belly);
  bell.scale.set(0.75, 0.6, 2.8);
  bell.position.y = -0.08;
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 8).rotateX(Math.PI / 2), m);
  snout.position.z = 1.2;
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 4), m);
  fin.position.set(0, 0.35, -0.1);
  fin.rotation.x = -0.4;
  const fluke = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.22), m);
  fluke.position.z = -1.15;
  g.add(body, bell, snout, fin, fluke);
  return shadowAll(g);
}

// ------------------------------------------------------------------ the zoo
export class Animals {
  constructor(G) {
    this.G = G;
    this.birds = [];
    this.flamingos = [];
    this.dogs = [];
    this.crabs = [];
    this.dolphins = [];
    const W = G.world;
    // seagulls circling over the beach and pier, plus some sitting on the sand that fly up when Macca comes
    for (let i = 0; i < 16; i++) this.addBird('gull', true);
    for (let i = 0; i < 10; i++) this.addBird('gull', false);
    // pelicans on the pier rails and the lifeguard towers
    const perches = [[PIER.x0 + 0.1, 130], [PIER.x1 - 0.1, 150], [PIER.x0 + 0.1, 165], [PIER.end.x1 - 0.2, 190], [PIER.end.x0 + 0.2, 200], [-90, 118], [80, 118]];
    for (const [x, z] of perches) {
      const y = x === -90 || x === 80 ? W.groundY(x, z) + 5.25 : PIER.y + 1.05;
      this.addBird('pelican', false, new THREE.Vector3(x, y, z));
    }
    // flamingos wading in the shallows east of the pier and on the lawns
    for (let i = 0; i < 9; i++) this.addFlamingo(new THREE.Vector3(rnd(55, 115), 0, rnd(119, 125)), true);
    for (const [x, z] of [[60, -70], [64, -66], [86, -72], [-10, 16], [10, 16], [70, 10]]) this.addFlamingo(new THREE.Vector3(x + rnd(-1, 1), 0, z + rnd(-1, 1)), false);
    // dogs: some walked by people, some free on the square and the beach
    const walkers = G.peds.list.filter((p) => p.state === 'walk' && !p.jogger);
    for (let i = 0; i < 5 && i < walkers.length; i++) this.addDog(walkers[i * 3 % walkers.length]);
    for (let i = 0; i < 3; i++) this.addDog(null, G.peds.squareSpot());
    for (let i = 0; i < 3; i++) this.addDog(null, new THREE.Vector3(rnd(-100, 100), 0, rnd(110, 116)), true);
    // crabs on the sand
    for (let i = 0; i < 14; i++) {
      const m = crabModel();
      const p = new THREE.Vector3(rnd(-115, 115), 0, rnd(110, 121));
      if (Math.abs(p.x - 30) < 7) p.x += 15;
      G.scene.add(m);
      this.crabs.push({ m, pos: p, dir: Math.random() < 0.5 ? 1 : -1, t: rnd(0, 3), yaw: rnd(0, 6.28) });
    }
    // dolphins out in the bay
    for (let i = 0; i < 4; i++) {
      const m = dolphinModel();
      m.visible = false;
      G.scene.add(m);
      this.dolphins.push({ m, t: rnd(-8, 0), base: new THREE.Vector3(rnd(-120, 160), WATER_Y, rnd(150, 240)), yaw: rnd(0, 6.28) });
    }
  }

  addBird(kind, flying, at) {
    const m = birdModel(kind);
    this.G.scene.add(m);
    const b = { m, kind, state: flying ? 'fly' : 'sit', t: rnd(0, 10), r: rnd(18, 45), h: rnd(8, 22), speed: rnd(0.25, 0.45) * (Math.random() < 0.5 ? 1 : -1), cx: rnd(-60, 90), cz: rnd(120, 175), pos: new THREE.Vector3() };
    if (!flying) {
      b.home = at || new THREE.Vector3(rnd(-110, 110), 0, rnd(109, 120));
      if (!at) b.home.y = this.G.world.groundY(b.home.x, b.home.z) + 0.22;
      b.pos.copy(b.home);
      b.yaw = rnd(0, 6.28);
    } else b.pos.set(b.cx + b.r, WATER_Y + b.h, b.cz);
    this.birds.push(b);
  }

  addFlamingo(p, water) {
    const W = this.G.world;
    const m = flamingoModel();
    this.G.scene.add(m);
    p.y = water ? Math.max(W.groundY(p.x, p.z), WATER_Y - 0.35) : W.groundY(p.x, p.z);
    this.flamingos.push({ m, pos: p, home: p.clone(), yaw: rnd(0, 6.28), t: rnd(0, 10), oneLeg: Math.random() < 0.5, water, flee: 0 });
  }

  addDog(owner, at, beach = false) {
    const m = dogModel();
    this.G.scene.add(m);
    const pos = owner ? owner.pos.clone().add(new THREE.Vector3(0.9, 0, 0.6)) : at.clone();
    this.dogs.push({ m, owner, pos, yaw: 0, target: pos.clone(), t: rnd(0, 5), beach, flee: 0, bark: 0, gait: 0 });
  }

  update(dt) {
    const G = this.G, W = G.world;
    const pl = G.player, P = pl.car ? pl.car.pos : pl.pos;
    const now = performance.now() / 1000;
    const cam = G.camera.position;
    // ---- birds
    for (const b of this.birds) {
      const ud = b.m.userData;
      b.t += dt;
      if (b.state === 'sit') {
        b.pos.copy(b.home);
        b.m.rotation.set(0, b.yaw, 0);
        for (const w of ud.wings) w.pivot.rotation.z = w.s * -0.15;
        // a little peck now and then
        b.m.rotation.x = Math.sin(b.t * 3) > 0.95 ? 0.4 : 0;
        if (P.distanceTo(b.home) < (b.kind === 'pelican' ? 4 : 6)) {
          b.state = 'takeoff';
          b.t = 0;
          b.from = b.pos.clone();
          b.cx = b.home.x + rnd(-20, 20);
          b.cz = b.home.z + rnd(5, 25);
          if (Math.random() < 0.5) G.audio?.squawk?.();
        }
      } else if (b.state === 'takeoff') {
        // flap up and away from Macca, then join the circling flock
        const away = b.from.clone().sub(P).setY(0).normalize();
        b.pos.copy(b.from).addScaledVector(away, b.t * 6).setY(b.from.y + b.t * 4);
        b.m.rotation.set(-0.3, Math.atan2(away.x, away.z), 0);
        for (const w of ud.wings) w.pivot.rotation.z = w.s * Math.sin(b.t * 22) * 0.9;
        if (b.t > 3) {
          b.state = 'fly';
          b.t = rnd(0, 6);
          b.returnT = rnd(20, 40);
        }
      } else {
        // circling, gliding with an occasional flap
        const a = b.t * b.speed;
        const x = b.cx + Math.cos(a) * b.r, z = b.cz + Math.sin(a) * b.r, y = WATER_Y + b.h + Math.sin(b.t * 0.7) * 1.5;
        const target = new THREE.Vector3(x, y, z);
        b.pos.lerp(target, Math.min(1, dt * 1.5));
        const dir = new THREE.Vector3(-Math.sin(a) * Math.sign(b.speed), 0, Math.cos(a) * Math.sign(b.speed));
        b.m.rotation.set(0, Math.atan2(dir.x, dir.z), -Math.sign(b.speed) * 0.35);
        const flap = Math.sin(b.t * 0.9) > 0.4;
        for (const w of ud.wings) w.pivot.rotation.z = w.s * (flap ? Math.sin(b.t * 18) * 0.8 : 0.08);
        // sitting birds come back down after a while
        if (b.home && (b.returnT -= dt) <= 0 && P.distanceTo(b.home) > 14) {
          b.state = 'land';
          b.t = 0;
          b.from = b.pos.clone();
        }
      }
      if (b.state === 'land') {
        const k = Math.min(1, b.t / 4);
        b.pos.lerpVectors(b.from, b.home, k * k * (3 - 2 * k));
        for (const w of ud.wings) w.pivot.rotation.z = w.s * Math.sin(b.t * 16) * 0.7;
        if (k >= 1) b.state = 'sit';
      }
      ud.legs.visible = b.state === 'sit';
      b.m.position.copy(b.pos);
    }
    // ---- flamingos
    for (const f of this.flamingos) {
      f.t += dt;
      const d = f.pos.distanceTo(P);
      const { neck, legs } = f.m.userData;
      let speed = 0;
      if (d < 6) f.flee = 3;
      if (f.flee > 0) {
        f.flee -= dt;
        const away = f.pos.clone().sub(P).setY(0).normalize();
        f.yaw += wrap(Math.atan2(away.x, away.z) - f.yaw) * Math.min(1, dt * 4);
        speed = 2.2;
      } else if (f.pos.distanceTo(f.home) > 3) {
        const to = f.home.clone().sub(f.pos).setY(0);
        f.yaw += wrap(Math.atan2(to.x, to.z) - f.yaw) * Math.min(1, dt * 2);
        speed = 0.6;
      }
      if (speed) {
        f.pos.x += Math.sin(f.yaw) * speed * dt;
        f.pos.z += Math.cos(f.yaw) * speed * dt;
        W.collide(f.pos, 0.3, 0);
        legs.forEach((l, i) => (l.rotation.x = Math.sin(f.t * 8 * speed + i * Math.PI) * 0.5));
        neck.rotation.x = 0.15;
      } else {
        // stand on one leg, dip the head to feed
        legs[0].rotation.x = f.oneLeg ? -1.2 : 0;
        legs[1].rotation.x = 0;
        const feed = Math.sin(f.t * 0.6 + f.home.x) > 0.6;
        neck.rotation.x += ((feed ? 1.6 : Math.sin(f.t * 1.3) * 0.08) - neck.rotation.x) * Math.min(1, dt * 3);
      }
      const g = W.groundY(f.pos.x, f.pos.z);
      f.pos.y = f.water ? Math.max(g, WATER_Y - 0.35) : g;
      f.m.position.copy(f.pos);
      f.m.rotation.y = f.yaw;
    }
    // ---- dogs
    for (const dg of this.dogs) {
      dg.t += dt;
      const { legs, tail, head } = dg.m.userData;
      let goal = null, speed = 0;
      const dMacca = dg.pos.distanceTo(P);
      if (dMacca < 5 && !pl.car && dg.flee <= 0) {
        dg.flee = 2.5;
        if (dg.bark <= 0) (dg.bark = 3), G.audio?.bark?.(dg.pos);
      }
      dg.bark -= dt;
      if (dg.flee > 0) {
        dg.flee -= dt;
        goal = dg.pos.clone().add(dg.pos.clone().sub(P).setY(0).normalize().multiplyScalar(5));
        speed = 5;
      } else if (dg.owner && G.peds.list.includes(dg.owner)) {
        // trot along at the owner's side
        const o = dg.owner;
        goal = o.pos.clone().add(new THREE.Vector3(Math.cos(o.yaw) * 0.9, 0, -Math.sin(o.yaw) * 0.9));
        const dd = goal.distanceTo(dg.pos);
        speed = dd > 0.4 ? Math.min(6, dd * 2.5) : 0;
      } else {
        // roam: sniff around, then run to a new spot
        if (dg.pos.distanceTo(dg.target) < 0.6 || (dg.wait = (dg.wait || 0) + dt) > 12) {
          dg.wait = 0;
          dg.target = dg.beach ? new THREE.Vector3(rnd(-110, 110), 0, rnd(108, 118)) : G.peds.squareSpot();
          dg.pause = rnd(1, 4);
        }
        if ((dg.pause -= dt) <= 0) {
          goal = dg.target;
          speed = dg.beach ? 3.5 : 1.6;
        }
      }
      if (goal && speed > 0) {
        const to = goal.clone().sub(dg.pos).setY(0);
        if (to.lengthSq() > 0.01) dg.yaw += wrap(Math.atan2(to.x, to.z) - dg.yaw) * Math.min(1, dt * 6);
        dg.pos.x += Math.sin(dg.yaw) * speed * dt;
        dg.pos.z += Math.cos(dg.yaw) * speed * dt;
        W.collide(dg.pos, 0.3, 0);
      }
      dg.gait += dt * (4 + speed * 3);
      const k = Math.min(1, speed / 2);
      legs.forEach((l, i) => (l.rotation.x = Math.sin(dg.gait + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.7 * k));
      tail.rotation.z = Math.sin(dg.t * 12) * 0.6;
      head.rotation.x = speed ? 0 : Math.sin(dg.t * 2) * 0.15 + 0.15;
      dg.pos.y = W.groundY(dg.pos.x, dg.pos.z) + Math.abs(Math.sin(dg.gait)) * 0.04 * k;
      dg.m.position.copy(dg.pos);
      dg.m.rotation.y = dg.yaw;
    }
    // ---- crabs scuttle sideways
    for (const c of this.crabs) {
      c.t -= dt;
      if (c.t <= 0) {
        c.t = rnd(0.5, 3);
        c.dir = Math.random() < 0.5 ? 1 : -1;
        c.moving = Math.random() < 0.6;
      }
      const near = c.pos.distanceTo(P) < 3;
      if (c.moving || near) {
        const side = new THREE.Vector3(Math.cos(c.yaw), 0, -Math.sin(c.yaw)).multiplyScalar(c.dir * (near ? 2.2 : 0.7) * dt);
        c.pos.add(side);
        c.pos.z = Math.min(122, Math.max(108, c.pos.z));
      }
      c.pos.y = Math.max(W.groundY(c.pos.x, c.pos.z), WATER_Y - 0.6);
      c.m.position.copy(c.pos);
      c.m.rotation.set(0, c.yaw, Math.sin(now * 30) * 0.05 * (c.moving ? 1 : 0));
    }
    // ---- dolphins leap in arcs
    for (const d of this.dolphins) {
      d.t += dt;
      if (d.t < 0) {
        d.m.visible = false;
        continue;
      }
      const T = 1.6, k = d.t / T;
      if (k > 1) {
        d.t = -rnd(3, 9);
        d.base.set(rnd(-120, 160), WATER_Y, rnd(150, 240));
        d.yaw = rnd(0, 6.28);
        if (Math.random() < 0.6) G.fx.ripple(d.base.clone().setY(WATER_Y + 0.02), 2);
        continue;
      }
      d.m.visible = true;
      const f = new THREE.Vector3(Math.sin(d.yaw), 0, Math.cos(d.yaw));
      const pos = d.base.clone().addScaledVector(f, (k - 0.5) * 7);
      pos.y = WATER_Y - 0.6 + Math.sin(k * Math.PI) * 2.6;
      d.m.position.copy(pos);
      d.m.rotation.set(-Math.cos(k * Math.PI) * 0.9, d.yaw, 0, 'YXZ');
      if (k < 0.06 || (k > 0.94 && !d.splashed)) {
        G.fx.splash(pos.clone().setY(WATER_Y), 6, 0.8);
        d.splashed = k > 0.94;
      }
      if (k < 0.5) d.splashed = false;
    }
  }
}
