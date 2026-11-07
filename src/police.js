// Wanted level, police cruisers, officers on foot and the helicopter.
import * as THREE from 'three';
import { Car } from './vehicles.js';

const CRIME = { assault: 0.6, 'hit-ped': 0.7, jack: 0.6, 'jack-cop': 2, 'assault-cop': 1, 'ram-cop': 0.3, explode: 1.2, steal: 2, 'hit-cop': 1.2 };
const CARS_FOR = [0, 1, 2, 3, 3, 4];

export class Police {
  constructor(G) {
    this.G = G;
    this.heat = 0;
    this.stars = 0;
    this.search = 0; // seconds out of sight
    this.cars = [];
    this.heli = null;
    this.spawnT = 0;
    this.seen = false;
  }

  crime(type, pos) {
    const G = this.G;
    if (G.missions?.active?.noHeat && type !== 'steal') return;
    const v = CRIME[type] ?? 0.5;
    // carjacking a civilian needs a witness
    if (type === 'jack') {
      const witness = G.peds.list.some((p) => !p.down && p.pos.distanceTo(pos) < 22) || this.cars.some((c) => c.pos.distanceTo(pos) < 45);
      if (!witness) return;
    }
    this.heat = Math.min(5.99, this.heat + v);
    const s = Math.min(5, Math.ceil(this.heat));
    if (s > this.stars) {
      this.stars = s;
      G.hud.starsUp();
      G.audio?.sirenBlip();
    }
    this.search = 0;
  }

  setStars(n) {
    this.heat = n;
    this.stars = n;
    this.search = 0;
  }

  clear() {
    this.heat = 0;
    this.stars = 0;
    this.search = 0;
    for (const c of this.cars) {
      c.siren = false;
      if (c.ai) c.ai.mode = 'leave';
    }
    for (const p of this.G.peds.list) if (p.cop && p.state === 'chase') this.G.peds.rejoinAsLeaving(p);
  }

  playerPos() {
    const pl = this.G.player;
    return pl.car ? pl.car.pos : pl.pos;
  }

  spawnCar() {
    const G = this.G, W = G.world, P = this.playerPos();
    const cand = W.nodes.filter((n) => {
      const d = Math.hypot(n.x - P.x, n.z - P.z);
      return d > 70 && d < 150;
    });
    if (!cand.length) return;
    // prefer nodes behind the camera
    const cam = G.camera.position, look = new THREE.Vector3();
    G.camera.getWorldDirection(look);
    cand.sort((a, b) => look.dot(new THREE.Vector3(a.x - cam.x, 0, a.z - cam.z).normalize()) - look.dot(new THREE.Vector3(b.x - cam.x, 0, b.z - cam.z).normalize()));
    const n = cand[0];
    const yaw = Math.atan2(P.x - n.x, P.z - n.z);
    const car = new Car(G, 'police', n.x, n.z, yaw);
    car.siren = true;
    car.ai = { mode: 'police', path: [], replan: 0, officer: false, update: (c, dt) => this.drive(c, dt) };
    car.vel.set(Math.sin(yaw) * 10, 0, Math.cos(yaw) * 10);
    G.traffic.add(car);
    this.cars.push(car);
  }

  drive(car, dt) {
    const G = this.G, W = G.world, T = G.traffic, pl = G.player;
    const ai = car.ai;
    const P = this.playerPos();
    const d = car.pos.distanceTo(P);
    if (ai.mode === 'leave') {
      car.siren = false;
      if (!ai.away) {
        const far = W.nodes.slice().sort((a, b) => Math.hypot(b.x - P.x, b.z - P.z) - Math.hypot(a.x - P.x, a.z - P.z))[0];
        ai.away = W.path(W.nearestNode(car.pos.x, car.pos.z), far);
      }
      while (ai.away.length > 1 && Math.hypot(ai.away[0].x - car.pos.x, ai.away[0].z - car.pos.z) < 9) ai.away.shift();
      const n = ai.away[0];
      T.steerTo(car, new THREE.Vector3(n.x, 0, n.z));
      T.drive(car, 12, dt);
      if (d > 110) car.remove(), (car.removed = true);
      return;
    }
    car.siren = true;
    let target, want;
    if (d < 30) {
      target = P.clone();
      if (pl.car) target.addScaledVector(pl.car.vel, 0.4);
      want = pl.car ? 34 : Math.max(0, (d - 7) * 1.4);
    } else {
      ai.replan -= dt;
      if (ai.replan <= 0 || !ai.path.length) {
        ai.replan = 1.5;
        const f = new THREE.Vector3(Math.sin(car.yaw), 0, Math.cos(car.yaw));
        const ahead = car.pos.clone().addScaledVector(f, 10);
        ai.path = W.path(W.nearestNode(ahead.x, ahead.z), W.nearestNode(P.x, P.z));
      }
      while (ai.path.length && Math.hypot(ai.path[0].x - car.pos.x, ai.path[0].z - car.pos.z) < 8) ai.path.shift();
      const n = ai.path[0];
      target = n ? new THREE.Vector3(n.x, 0, n.z) : P.clone();
      want = 26;
    }
    const ang = Math.abs(T.steerTo(car, target));
    if (ang > 0.7 && car.speed > 10) want = Math.min(want, 9);
    T.drive(car, want, dt);
    car.input.handbrake = ang > 1.1 && car.speed > 8;
    // stopped next to a gator on foot: an officer gets out
    if (!pl.car && !ai.officer && d < 16 && car.speed < 3) {
      ai.officer = true;
      const door = car.doorWorld();
      car.removeDriver();
      car.driver = { body: new THREE.Object3D(), anim: { update() {} }, name: 'parked' };
      const cop = G.peds.spawnCop(door.x, door.z);
      cop.fromCar = car;
      car.input = { throttle: 0, steer: 0, brake: 1, handbrake: false };
      car.ai.update = () => {
        car.input.throttle = 0;
        car.input.brake = 1;
      };
    }
  }

  update(dt) {
    const G = this.G, pl = G.player;
    this.cars = this.cars.filter((c) => !c.removed && G.traffic.cars.includes(c));
    const P = this.playerPos();
    if (this.stars > 0) {
      // seen? a cop car or officer close, or the helicopter overhead
      const close = this.cars.some((c) => !c.dead && c.pos.distanceTo(P) < 55) || G.peds.list.some((p) => p.cop && !p.down && p.pos.distanceTo(P) < 35) || (this.heli && this.heli.on);
      this.seen = close;
      if (close) this.search = 0;
      else this.search += dt;
      if (this.search > 9 + this.stars * 2.5) {
        this.clear();
        G.hud.toast('You lost the cops.');
      }
      this.spawnT -= dt;
      const want = CARS_FOR[this.stars];
      const active = this.cars.filter((c) => !c.dead && c.ai?.mode === 'police' && !c.ai.officer).length;
      if (active < want && this.spawnT <= 0) {
        this.spawnT = 3;
        this.spawnCar();
      }
      // busted: officers holding a gator on foot, or boxed in at the wheel
      if (pl.car) {
        const boxed = pl.car.speed < 1.5 && this.cars.some((c) => !c.dead && c.pos.distanceTo(pl.car.pos) < 6.5);
        if (boxed) pl.grabbed += dt * 0.6;
      }
      if (pl.grabbed > 2.4) G.busted();
    }
    this.updateHeli(dt);
  }

  updateHeli(dt) {
    const G = this.G;
    const want = this.stars >= 3;
    if (want && !this.heli) {
      const root = G.assets.heli.scene.clone(true);
      root.traverse((o) => o.isMesh && (o.castShadow = true));
      const P = this.playerPos();
      root.position.set(P.x + 150, 45, P.z - 150);
      G.scene.add(root);
      const spot = new THREE.SpotLight('#eaf4ff', 0, 120, 0.22, 0.5, 1.2);
      G.scene.add(spot, spot.target);
      this.heli = { root, spot, ang: 0, on: false, rotor: root.getObjectByName('rotor_main'), tail: root.getObjectByName('rotor_tail'), leaving: false };
    }
    if (!this.heli) return;
    const h = this.heli, P = this.playerPos();
    h.leaving = !want;
    h.ang += dt * 0.25;
    const goal = h.leaving ? new THREE.Vector3(P.x + 300, 60, P.z - 300) : new THREE.Vector3(P.x + Math.cos(h.ang) * 26, 30 + Math.sin(h.ang * 2) * 3, P.z + Math.sin(h.ang) * 26);
    const prev = h.root.position.clone();
    h.root.position.lerp(goal, Math.min(1, dt * 0.6));
    const v = h.root.position.clone().sub(prev);
    if (v.lengthSq() > 1e-6) h.root.rotation.y += ((Math.atan2(v.x, v.z) - h.root.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 2);
    h.root.rotation.x = Math.min(0.25, v.length() / dt / 120);
    if (h.rotor) h.rotor.rotation.y += dt * 40;
    if (h.tail) h.tail.rotation.x += dt * 50;
    h.spot.position.copy(h.root.position);
    h.spot.target.position.copy(P);
    h.spot.intensity = h.leaving ? 0 : 400 + 1600 * G.env.night;
    h.on = !h.leaving && h.root.position.distanceTo(goal) < 30;
    G.audio?.heli(h.root.position);
    if (h.leaving && h.root.position.distanceTo(P) > 250) {
      G.scene.remove(h.root, h.spot, h.spot.target);
      this.heli = null;
      G.audio?.heli(null);
    }
  }
}
