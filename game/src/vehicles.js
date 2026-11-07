// Cars: arcade physics shared by the player, traffic, police and mission cars; lane-following AI.
import * as THREE from 'three';
import { ROADS_X, ROADS_Z, RW, LANE } from './world.js';
import { cloneSkinned, Anim, PEOPLE } from './assets.js';

const SPEC = {
  sedan: { max: 38, accel: 11, grip: 8.5, mass: 1.2, health: 900 },
  coupe: { max: 44, accel: 13, grip: 8.5, mass: 1.1, health: 850 },
  taxi: { max: 37, accel: 11, grip: 8, mass: 1.2, health: 900 },
  super: { max: 62, accel: 19, grip: 10, mass: 1.0, health: 750 },
  lux: { max: 46, accel: 13, grip: 9, mass: 1.4, health: 1000 },
  van: { max: 32, accel: 9, grip: 7, mass: 1.8, health: 1200 },
  police: { max: 50, accel: 15, grip: 9.5, mass: 1.4, health: 1300 },
};
const PAINT = ['#e8e8ea', '#1d1f24', '#b8202e', '#2a5bd7', '#f2c230', '#2fb3a4', '#ff7a3c', '#7d3fc4', '#8d99a6', '#ff4fa6', '#e3dccf', '#355e3b'];
const fwd = (yaw, out = new THREE.Vector3()) => out.set(Math.sin(yaw), 0, Math.cos(yaw));
const right = (yaw, out = new THREE.Vector3()) => out.set(-Math.cos(yaw), 0, Math.sin(yaw));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Vector3();

export class Car {
  constructor(G, kind, x, z, yaw, { color, driver = true } = {}) {
    this.G = G;
    this.kind = kind;
    this.spec = { ...SPEC[kind] };
    this.root = G.assets.cars[kind].scene.clone(true);
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      const n = o.material.name;
      if (['Paint', 'Headlight', 'Taillight', 'SirenRed', 'SirenBlue', 'Indicator'].includes(n)) o.material = o.material.clone();
      if (n === 'Paint') this.paint = o.material;
      if (n === 'Headlight') this.headMat = o.material;
      if (n === 'Taillight') this.tailMat = o.material;
      if (n === 'SirenRed') this.sirenR = o.material;
      if (n === 'SirenBlue') this.sirenB = o.material;
    });
    if (this.paint && kind !== 'taxi' && kind !== 'police') this.paint.color.set(color || PAINT[Math.floor(Math.random() * PAINT.length)]);
    this.wheels = ['FL', 'FR', 'RL', 'RR'].map((k) => this.root.getObjectByName('wheel_' + k)).filter(Boolean);
    for (const w of this.wheels) w.rotation.order = 'YXZ';
    this.wheelR = this.wheels[0]?.position.y || 0.35;
    const fl = this.root.getObjectByName('wheel_FL'), rl = this.root.getObjectByName('wheel_RL');
    this.wheelbase = fl && rl ? fl.position.z - rl.position.z : 2.8;
    this.seat = this.root.getObjectByName('seat_driver')?.position.clone() || new THREE.Vector3(0.38, 0.45, 0);
    this.door = this.root.getObjectByName('door_driver')?.position.clone() || new THREE.Vector3(1.5, 0, 0);
    this.halfL = kind === 'van' || kind === 'lux' ? 2.7 : 2.35;
    this.radius = 1.05;
    G.scene.add(this.root);
    this.pos = new THREE.Vector3(x, G.world.groundY(x, z), z);
    this.yaw = yaw;
    this.vel = new THREE.Vector3();
    this.steer = 0;
    this.y = this.pos.y;
    this.vy = 0;
    this.air = false;
    this.airTime = 0;
    this.health = this.spec.health;
    this.dead = false;
    this.burn = 0;
    this.spin = 0;
    this.input = { throttle: 0, steer: 0, brake: 0, handbrake: false };
    this.ai = null;
    this.driver = null; // 'player' | {person}
    this.stuck = 0;
    this.reverseT = 0;
    this.siren = false;
    this.lastHit = 0;
    if (driver) this.addDriver();
    this.sync(0);
  }

  get speed() {
    return this.vel.dot(fwd(this.yaw, _f));
  }

  addDriver(name) {
    const G = this.G;
    const pick = name || (this.kind === 'police' ? 'Police_Male_01' : PEOPLE[Math.floor(Math.random() * PEOPLE.length)]);
    const src = G.assets.people[pick] || G.assets.cops[pick];
    const body = cloneSkinned(src.scene);
    const anim = new Anim(body, G.assets.clipsFor.get(pick));
    anim.set('drive');
    anim.w.idle = 0;
    body.position.copy(this.seat).add(new THREE.Vector3(0, -0.5, 0));
    this.root.add(body);
    this.driver = { body, anim, name: pick };
  }

  removeDriver() {
    if (this.driver && this.driver !== 'player') {
      this.root.remove(this.driver.body);
      const name = this.driver.name;
      this.driver = null;
      return name;
    }
    this.driver = null;
    return null;
  }

  doorWorld(out = new THREE.Vector3()) {
    return out.copy(this.door).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw).add(this.pos);
  }

  damage(amount, from) {
    if (this.dead) return;
    this.health -= amount;
    if (this.health <= 0) this.explode();
  }

  explode() {
    if (this.dead) return;
    this.dead = true;
    this.health = 0;
    const G = this.G;
    G.fx.explosion(this.pos.clone().add(new THREE.Vector3(0, 1, 0)));
    G.audio?.boom();
    this.vy = 6;
    this.air = true;
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        if (o.material.color) o.material.color.multiplyScalar(0.12);
        o.material.emissive?.set(0);
      }
    });
    if (this.driver && this.driver !== 'player') this.removeDriver();
    G.onExplosion?.(this.pos.clone(), this);
  }

  // ------------------------------------------------------------------ physics
  update(dt) {
    const G = this.G, W = G.world;
    const inp = this.dead ? { throttle: 0, steer: 0, brake: 1, handbrake: true } : this.input;
    const f = fwd(this.yaw, _f), r = right(this.yaw, _r);
    let vf = this.vel.dot(f), vr = this.vel.dot(r);
    const S = this.spec;
    const wet = 1;
    if (!this.air) {
      if (inp.throttle > 0) {
        if (vf < -0.5) vf += 22 * inp.throttle * dt;
        else vf += S.accel * inp.throttle * dt * Math.max(0, 1 - vf / S.max) * (1 + (inp.nitro ? 0.8 : 0));
      } else if (inp.throttle < 0) {
        if (vf > 0.5) vf -= 24 * -inp.throttle * dt;
        else vf = Math.max(-12, vf - 8 * -inp.throttle * dt);
      }
      if (inp.brake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 26 * inp.brake * dt);
      // rolling resistance + air drag
      vf -= vf * (0.05 + Math.abs(vf) * 0.0035) * dt * 2 + Math.sign(vf) * Math.min(Math.abs(vf), inp.throttle ? 0 : 1.2 * dt);
      const grip = (inp.handbrake ? 1.1 : S.grip) * wet;
      vr *= Math.exp(-grip * dt);
      if (inp.handbrake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 5 * dt);
      const maxSteer = 0.62 / (1 + Math.abs(vf) * 0.035);
      this.steer += (inp.steer * maxSteer - this.steer) * Math.min(1, dt * 7);
      let yawRate = (vf * Math.tan(this.steer)) / this.wheelbase;
      if (inp.handbrake) yawRate *= 1.35;
      this.yaw = wrap(this.yaw + yawRate * dt);
    } else this.yaw = wrap(this.yaw + this.spin * dt);
    fwd(this.yaw, f);
    right(this.yaw, r);
    this.vel.copy(f).multiplyScalar(vf).addScaledVector(r, vr);
    this.pos.addScaledVector(this.vel, dt);

    // world collisions with three circles along the body
    for (const o of [-this.halfL + this.radius, 0, this.halfL - this.radius]) {
      _p.copy(this.pos).addScaledVector(f, o);
      _q.copy(_p);
      const hit = W.collide(_p, this.radius, this.y + 0.5);
      if (hit) {
        this.pos.x += _p.x - _q.x;
        this.pos.z += _p.z - _q.z;
        const vn = this.vel.x * hit.x + this.vel.z * hit.z;
        if (vn < 0) {
          this.vel.x -= hit.x * vn * 1.3;
          this.vel.z -= hit.z * vn * 1.3;
          this.impact(-vn, _q);
        }
      }
    }
    // keep out of deep water
    const g = W.groundY(this.pos.x, this.pos.z);
    if (g < -1.2 && !this.dead) {
      this.health -= 300 * dt;
      this.vel.multiplyScalar(Math.exp(-3 * dt));
      if (this.health <= 0) this.explode();
    }
    // vertical: ramps launch, otherwise follow the ground
    const onRamp = W.rampY !== undefined && this.pos.x > -62 && this.pos.x < -50 && this.pos.z > 116 && this.pos.z < 124;
    if (onRamp && !this.air) {
      this.y = g;
      this.vy = Math.max(0, this.vel.x * 0.2);
    } else if (this.air || this.y > g + 0.45) {
      if (!this.air) {
        this.air = true;
        this.airTime = 0;
        this.spin = 0;
      }
      this.airTime += dt;
      this.vy -= 22 * dt;
      this.y += this.vy * dt;
      if (this.y <= g) {
        this.y = g;
        if (this.vy < -9) this.impact(-this.vy * 0.5, this.pos);
        this.vy = 0;
        this.air = false;
        if (this.airTime > 0.7) G.onStunt?.(this, this.airTime);
      }
    } else {
      this.y += (g - this.y) * Math.min(1, dt * 14);
      this.vy = 0;
    }
    this.pos.y = this.y;

    // stuck AI: back off for a moment
    if (this.ai && !this.dead) {
      if (Math.abs(vf) < 0.8 && this.input.throttle > 0.3) this.stuck += dt;
      else this.stuck = Math.max(0, this.stuck - dt);
      if (this.stuck > 1.6) {
        this.reverseT = 1.4;
        this.stuck = 0;
      }
    }
    // fire + smoke
    if (!this.dead) {
      const hp = this.health / this.spec.health;
      if (hp < 0.45 && Math.random() < dt * (hp < 0.25 ? 14 : 6)) G.fx.smoke(this.enginePos(), hp < 0.25 ? 1 : 0);
      if (hp < 0.18) {
        if (Math.random() < dt * 20) G.fx.fire(this.enginePos());
        this.health -= 18 * dt;
        if (this.health <= 0) this.explode();
      }
    } else {
      this.burn += dt;
      if (this.burn < 12 && Math.random() < dt * 10) G.fx.smoke(this.enginePos(), 1);
      if (this.burn < 6 && Math.random() < dt * 14) G.fx.fire(this.enginePos());
    }
    this.sync(dt, vf);
  }

  enginePos() {
    return _q.copy(this.pos).addScaledVector(fwd(this.yaw, _f), this.halfL - 0.9).setY(this.y + 1.1).clone();
  }

  impact(speed, at) {
    if (speed < 3) return;
    const now = performance.now();
    if (now - this.lastHit > 180) {
      this.G.audio?.crash(Math.min(1, speed / 20));
      if (speed > 6) this.G.fx.sparks(at.clone().setY(this.y + 0.6));
      this.lastHit = now;
    }
    this.damage((speed - 3) * 22);
    if (this.driver === 'player') this.G.hud?.shake(Math.min(1, speed / 18));
  }

  sync(dt, vf = this.speed) {
    this.root.position.set(this.pos.x, this.y, this.pos.z);
    // body pitch in the air, a little roll in corners
    const pitch = this.air ? THREE.MathUtils.clamp(-this.vy * 0.03, -0.5, 0.5) : 0;
    this.root.rotation.set(pitch, this.yaw, 0, 'YXZ');
    this.spinW = (this.spinW || 0) + (vf * dt) / this.wheelR;
    this.wheels.forEach((w, i) => {
      w.rotation.x = this.spinW;
      w.rotation.y = i < 2 ? this.steer : 0;
    });
    const night = this.G.env?.night || 0;
    if (this.headMat) this.headMat.emissiveIntensity = this.dead ? 0 : 0.3 + night * 4;
    if (this.tailMat) this.tailMat.emissiveIntensity = this.dead ? 0 : (this.input.brake || this.input.throttle < 0 ? 4 : 0.6 + night * 1.2);
    if (this.sirenR) {
      const on = this.siren && !this.dead;
      const ph = Math.floor(performance.now() / 160) % 2;
      this.sirenR.emissiveIntensity = on && ph ? 8 : 0.2;
      this.sirenB.emissiveIntensity = on && !ph ? 8 : 0.2;
    }
    if (this.driver && this.driver !== 'player') this.driver.anim.update(dt);
  }

  remove() {
    this.G.scene.remove(this.root);
  }
}

// ------------------------------------------------------------------ AI driving helpers
// lane waypoints for driving from node a to node b (right-hand traffic)
function laneSegment(a, b) {
  const dx = Math.sign(b.x - a.x), dz = Math.sign(b.z - a.z);
  const r = right(Math.atan2(dx, dz));
  const off = r.multiplyScalar(LANE);
  return {
    from: new THREE.Vector3(a.x + dx * (RW + 1) + off.x, 0, a.z + dz * (RW + 1) + off.z),
    to: new THREE.Vector3(b.x - dx * (RW + 1.5) + off.x, 0, b.z - dz * (RW + 1.5) + off.z),
    axis: dx ? 'x' : 'z',
    dir: new THREE.Vector3(dx, 0, dz),
    node: b,
  };
}

function bezier(p0, p1, p2, t) {
  const u = 1 - t;
  return new THREE.Vector3(u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, 0, u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z);
}

export class Traffic {
  constructor(G) {
    this.G = G;
    this.cars = []; // every car in the world (traffic, parked, police, player's)
    this.target = 14;
    this.timer = 0;
  }

  add(car) {
    this.cars.push(car);
    return car;
  }

  // a traffic car that drives a random route
  spawnTraffic(near) {
    const W = this.G.world;
    for (let tries = 0; tries < 20; tries++) {
      const a = W.nodes[Math.floor(Math.random() * W.nodes.length)];
      const b = a.links[Math.floor(Math.random() * a.links.length)];
      const seg = laneSegment(a, b);
      const t = Math.random();
      const p = seg.from.clone().lerp(seg.to, t);
      if (near && p.distanceTo(near) < 45) continue;
      if (this.cars.some((c) => c.pos.distanceTo(p) < 12)) continue;
      const kinds = ['sedan', 'sedan', 'coupe', 'taxi', 'van', 'lux', 'sedan', 'super', 'coupe', 'taxi'];
      const car = new Car(this.G, kinds[Math.floor(Math.random() * kinds.length)], p.x, p.z, Math.atan2(seg.dir.x, seg.dir.z));
      car.ai = { mode: 'traffic', route: [], seg, cruise: 11 + Math.random() * 3 };
      this.buildRoute(car, seg, t);
      car.vel.copy(seg.dir).multiplyScalar(8);
      return this.add(car);
    }
    return null;
  }

  // waypoints: rest of the current lane, then turn into a random next lane
  buildRoute(car, seg, t = 0) {
    const ai = car.ai;
    ai.route = [];
    ai.segs = [];
    this.appendSeg(car, seg, t);
  }

  appendSeg(car, seg, t = 0) {
    const ai = car.ai;
    const start = seg.from.clone().lerp(seg.to, t);
    const n = Math.max(2, Math.ceil(start.distanceTo(seg.to) / 8));
    for (let i = 0; i <= n; i++) ai.route.push({ p: start.clone().lerp(seg.to, i / n), seg, stop: i === n });
    // choose the next lane (no U-turns unless a dead end)
    const node = seg.node;
    const back = node.links.find((m) => Math.sign(m.x - node.x) === -seg.dir.x && Math.sign(m.z - node.z) === -seg.dir.z);
    let opts = node.links.filter((m) => m !== back);
    if (!opts.length) opts = node.links;
    const next = opts[Math.floor(Math.random() * opts.length)];
    const ns = laneSegment(node, next);
    // turn curve through the crossing
    const p0 = seg.to, p2 = ns.from;
    const straight = ns.dir.dot(seg.dir) > 0.5;
    const p1 = straight ? p0.clone().lerp(p2, 0.5) : new THREE.Vector3(seg.dir.x ? p2.x : p0.x, 0, seg.dir.z ? p2.z : p0.z);
    for (let i = 1; i < 6; i++) ai.route.push({ p: bezier(p0, p1, p2, i / 6), seg: ns, turn: !straight });
    ai.next = ns;
  }

  // steer a car towards points ahead on its route; returns the desired speed
  follow(car, dt) {
    const ai = car.ai;
    const f = fwd(car.yaw, _f);
    // drop waypoints behind us
    while (ai.route.length > 1) {
      const w = ai.route[0];
      const to = _p.copy(w.p).sub(car.pos);
      to.y = 0;
      if (to.length() < 4 || (to.dot(f) < 0 && to.length() < 12)) ai.route.shift();
      else break;
    }
    if (ai.route.length < 8 && ai.next) this.appendSeg(car, ai.next, 0);
    const look = 5 + Math.abs(car.speed) * 0.45;
    let target = ai.route[ai.route.length - 1].p;
    let acc = 0, prev = car.pos;
    for (const w of ai.route) {
      acc += _q.copy(w.p).sub(prev).setY(0).length();
      prev = w.p;
      if (acc >= look) {
        target = w.p;
        break;
      }
    }
    this.steerTo(car, target);
    const turning = ai.route.slice(0, 4).some((w) => w.turn);
    let want = turning ? 6.5 : ai.cruise;
    // traffic lights: stop at the end of the lane on red / amber
    const stopW = ai.route.find((w) => w.stop);
    if (stopW) {
      const d = stopW.p.distanceTo(_q.copy(car.pos).setY(0));
      const sig = this.G.world.signalAt(stopW.seg.node.x, stopW.seg.node.z);
      if (sig) {
        const st = this.G.world.signalState(sig, stopW.seg.axis);
        if (st !== 'g' && d > 2.5) want = Math.min(want, Math.max(0, Math.sqrt(2 * 5 * Math.max(0, d - 3))));
      } else if (d < 14) want = Math.min(want, 7);
    }
    return want;
  }

  steerTo(car, target) {
    const dx = target.x - car.pos.x, dz = target.z - car.pos.z;
    const ang = wrap(Math.atan2(dx, dz) - car.yaw);
    const back = car.reverseT > 0;
    car.input.steer = THREE.MathUtils.clamp(ang * 1.8, -1, 1) * (back ? -1 : 1);
    return ang;
  }

  // something in front of the car? returns the free distance ahead
  clearance(car, range = 16) {
    const f = fwd(car.yaw, _f), r = right(car.yaw, _r);
    let free = range;
    const test = (p, w) => {
      const dx = p.x - car.pos.x, dz = p.z - car.pos.z;
      const ahead = dx * f.x + dz * f.z, lat = Math.abs(dx * r.x + dz * r.z);
      if (ahead > 0 && ahead < free + car.halfL && lat < w) free = Math.max(0, ahead - car.halfL);
    };
    for (const c of this.cars) if (c !== car) test(c.pos, 2.3);
    for (const p of this.G.peds.list) if (!p.down) test(p.pos, 1.6);
    if (!this.G.player.car) test(this.G.player.pos, 1.6);
    return free;
  }

  drive(car, want, dt) {
    if (car.reverseT > 0) {
      car.reverseT -= dt;
      car.input.throttle = -0.7;
      car.input.brake = 0;
      return;
    }
    const v = car.speed;
    if (v < want - 0.5) {
      car.input.throttle = Math.min(1, (want - v) * 0.4);
      car.input.brake = 0;
    } else if (v > want + 1) {
      car.input.throttle = 0;
      car.input.brake = Math.min(1, (v - want) * 0.25);
    } else {
      car.input.throttle = 0.15;
      car.input.brake = 0;
    }
    car.input.handbrake = false;
  }

  update(dt) {
    const G = this.G;
    // keep the town busy
    this.timer -= dt;
    const traffic = this.cars.filter((c) => c.ai?.mode === 'traffic');
    if (this.timer <= 0 && traffic.length < this.target) {
      this.timer = 0.6;
      this.spawnTraffic(G.player.pos);
    }
    for (const car of this.cars) {
      const ai = car.ai;
      if (ai && !car.dead && car.driver && car.driver !== 'player') {
        if (ai.mode === 'traffic') {
          let want = this.follow(car, dt);
          const free = this.clearance(car);
          want = Math.min(want, Math.max(0, (free - 3) * 1.1));
          if (free < 4 && car.speed < 1 && (ai.honk = (ai.honk || 0) + dt) > 2.5) {
            ai.honk = -4;
            G.audio?.horn(car.pos);
          }
          this.drive(car, want, dt);
        } else if (ai.update) ai.update(car, dt);
      } else if (car.driver !== 'player') {
        car.input.throttle = 0;
        car.input.brake = 0.6;
        car.input.steer = 0;
      }
      car.update(dt);
    }
    this.collideCars();
    // remove wrecks / abandoned traffic far away
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      const d = c.pos.distanceTo(G.player.pos);
      if (c.keep || c.driver === 'player') continue;
      if ((c.dead && d > 60 && c.burn > 10) || (c.ai?.mode === 'traffic' && d > 230) || (!c.driver && !c.ai && d > 120 && !c.parked)) {
        c.remove();
        this.cars.splice(i, 1);
      }
    }
  }

  collideCars() {
    const cs = this.cars;
    for (let i = 0; i < cs.length; i++)
      for (let j = i + 1; j < cs.length; j++) {
        const a = cs[i], b = cs[j];
        if (Math.abs(a.pos.x - b.pos.x) > 7 || Math.abs(a.pos.z - b.pos.z) > 7) continue;
        const fa = fwd(a.yaw), fb = fwd(b.yaw);
        for (const oa of [-1.3, 0, 1.3])
          for (const ob of [-1.3, 0, 1.3]) {
            const pa = a.pos.clone().addScaledVector(fa, oa * (a.halfL / 2.35)), pb = b.pos.clone().addScaledVector(fb, ob * (b.halfL / 2.35));
            const dx = pb.x - pa.x, dz = pb.z - pa.z, d = Math.hypot(dx, dz), rr = a.radius + b.radius;
            if (d >= rr || d < 1e-4) continue;
            const nx = dx / d, nz = dz / d, pen = rr - d;
            const ma = a.spec.mass, mb = b.spec.mass, tot = ma + mb;
            a.pos.x -= nx * pen * (mb / tot);
            a.pos.z -= nz * pen * (mb / tot);
            b.pos.x += nx * pen * (ma / tot);
            b.pos.z += nz * pen * (ma / tot);
            const rv = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
            if (rv < 0) {
              const jimp = (-(1.3) * rv) / (1 / ma + 1 / mb);
              a.vel.x -= (jimp / ma) * nx;
              a.vel.z -= (jimp / ma) * nz;
              b.vel.x += (jimp / mb) * nx;
              b.vel.z += (jimp / mb) * nz;
              a.impact(-rv * 0.8, pa);
              b.impact(-rv * 0.8, pb);
              this.G.onCarHit?.(a, b, -rv);
            }
          }
      }
  }
}

export { fwd, right, wrap, laneSegment };
