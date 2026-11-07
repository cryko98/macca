// Macca the gator: on foot (walk, run, bite, drink, dance, swim) and at the wheel.
import * as THREE from 'three';
import { Person } from './people.js';
import { WATER_Y } from './world.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const WALK = 2.1, RUN = 6.2, SWIM = 2.8;

export class Player {
  constructor(G) {
    this.G = G;
    this.model = G.assets.gator.scene;
    this.model.scale.setScalar(0.92);
    G.scene.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const c of G.assets.gator.animations) {
      const a = this.mixer.clipAction(c);
      if (['Drink', 'Jump', 'Attack', 'Fall'].includes(c.name)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions[c.name] = a;
    }
    this.current = null;
    this.play('Idle');
    this.pos = new THREE.Vector3();
    this.yaw = Math.PI;
    this.health = 100;
    this.car = null;
    this.busy = 0; // a one-shot clip is playing
    this.grabbed = 0;
    this.dead = false;
    this.dancing = false;
    this.swimming = false;
    this.drinks = 3;
    this.attackCd = 0;
    // start on the beach next to the pier, looking out to sea
    this.spawn(16, 112, 0.25);
  }

  spawn(x, z, yaw = 0) {
    this.pos.set(x, this.G.world.groundY(x, z), z);
    this.yaw = yaw;
    this.health = 100;
    this.dead = false;
    this.grabbed = 0;
    this.busy = 0;
    this.model.visible = true;
    this.actions.Fall.stop();
    this.play('Idle', 0.01);
  }

  play(name, fade = 0.2, timeScale = 1) {
    const a = this.actions[name];
    if (!a) return;
    a.timeScale = timeScale;
    if (this.current === a) return;
    a.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (this.current) this.current.fadeOut(fade);
    this.current = a;
  }

  once(name, dur) {
    const a = this.actions[name];
    a.reset();
    a.timeScale = 1;
    a.setEffectiveWeight(1).fadeIn(0.1).play();
    if (this.current && this.current !== a) this.current.fadeOut(0.1);
    this.current = a;
    this.busy = dur ?? a.getClip().duration;
  }

  hurt(n, from) {
    if (this.dead || this.G.state !== 'play') return;
    this.health = Math.max(0, this.health - n);
    this.G.hud.flashDamage();
    if (this.health <= 0) this.G.wasted();
  }

  // ------------------------------------------------------------------ cars
  nearestCar(maxD = 5) {
    let best = null, bd = maxD;
    for (const c of this.G.traffic.cars) {
      if (c.dead) continue;
      const d = Math.min(c.pos.distanceTo(this.pos) - 1.2, c.doorWorld().distanceTo(this.pos));
      if (d < bd) (bd = d), (best = c);
    }
    return best;
  }

  enterCar(car) {
    const G = this.G;
    const isCop = car.kind === 'police';
    if (car.driver && car.driver !== 'player') {
      // carjack: pull the driver out and throw them on the road
      const name = car.removeDriver();
      const door = car.doorWorld();
      if (name && name !== 'parked') {
        const p = new Person(G, name, door.x, door.z, { cop: name.startsWith('Police') });
        p.knockDown(new THREE.Vector3().subVectors(door, car.pos), 3);
        G.peds.list.push(p);
        G.crime(isCop ? 'jack-cop' : 'jack', door);
        G.audio?.oof();
      } else if (isCop) G.crime('jack-cop', door);
    } else if (isCop && !car.parked) G.crime('jack-cop', car.pos);
    if (isCop) G.police.cars = G.police.cars.filter((c) => c !== car);
    if (car.ai && car.ai.mode !== 'mission-keep') car.ai = null;
    car.driver = 'player';
    car.keep = true;
    this.car = car;
    this.model.visible = false;
    this.dancing = false;
    G.onEnterCar?.(car);
    G.audio?.door();
  }

  exitCar() {
    const G = this.G, car = this.car;
    const fast = car.speed > 9;
    const door = car.doorWorld();
    this.pos.copy(door);
    G.world.collide(this.pos, 0.5, 0);
    this.pos.y = G.world.groundY(this.pos.x, this.pos.z);
    this.yaw = car.yaw + Math.PI / 2;
    car.driver = null;
    car.input = { throttle: 0, steer: 0, brake: fast ? 0 : 1, handbrake: false };
    car.keep = false;
    this.car = null;
    this.model.visible = true;
    G.audio?.door();
    if (fast) {
      this.hurt(Math.min(25, car.speed * 0.8));
      this.once('Fall', 1.4);
      this.getUpAfter = true;
    }
  }

  // ------------------------------------------------------------------ update
  update(dt, input, camYaw) {
    const G = this.G, W = G.world;
    this.attackCd -= dt;
    if (this.car) return this.drive(dt, input);
    if (this.dead) {
      this.mixer.update(dt);
      this.syncModel();
      return;
    }
    // F is remembered for a moment, so it also works right after a bite, jump or sip
    if (input.pressed('KeyF')) this.wantCar = 0.6;
    this.wantCar = Math.max(0, (this.wantCar || 0) - dt);
    if (this.wantCar > 0 && this.busy <= 0) {
      const c = this.nearestCar();
      if (c) {
        this.wantCar = 0;
        return this.enterCar(c);
      }
      if (input.pressed('KeyF')) G.hud.toast('No car close enough: walk right up to one and press F.', 2.5);
    }
    if (this.busy > 0) {
      this.busy = Math.max(0, this.busy - dt);
      if (this.busy <= 0 && this.getUpAfter) {
        // stand back up: the fall clip reversed
        this.getUpAfter = false;
        const a = this.actions.Fall;
        a.paused = false;
        a.timeScale = -1.4;
        a.play();
        this.busy = a.getClip().duration / 1.4;
      }
    }
    // movement
    let mx = 0, mz = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) mz += 1;
    if (input.down('KeyS') || input.down('ArrowDown')) mz -= 1;
    if (input.down('KeyA') || input.down('ArrowLeft')) mx -= 1;
    if (input.down('KeyD') || input.down('ArrowRight')) mx += 1;
    const moving = (mx || mz) && this.busy <= 0;
    const running = input.down('ShiftLeft') || input.down('ShiftRight');
    // water: wade in the shallows, swim once it is deeper than ~0.9 m (a little hysteresis)
    const g = W.groundY(this.pos.x, this.pos.z);
    const depth = WATER_Y - g;
    const wasSwimming = this.swimming;
    this.swimming = this.swimming ? depth > 0.6 : depth > 0.9;
    if (this.swimming !== wasSwimming) {
      this.dancing = false;
      G.fx.splash(new THREE.Vector3(this.pos.x, WATER_Y, this.pos.z), this.swimming ? 26 : 12);
      G.audio?.splash(this.swimming ? 1 : 0.5);
      if (this.swimming && !this.toldSwim) {
        this.toldSwim = true;
        G.hud.toast('Swimming! Shift swims faster. Swim back to the beach or the pier to climb out.', 4);
      }
    }
    const wading = !this.swimming && depth > 0.05;
    let speed = 0;
    if (moving) {
      this.dancing = false;
      // camera relative
      const fwdX = Math.sin(camYaw), fwdZ = Math.cos(camYaw);
      const dx = fwdX * mz - fwdZ * mx, dz = fwdZ * mz + fwdX * mx;
      const target = Math.atan2(dx, dz);
      this.yaw += wrap(target - this.yaw) * Math.min(1, dt * (this.swimming ? 5 : 12));
      speed = this.swimming ? SWIM * (running ? 1.7 : 1) : (running ? RUN : WALK) * (wading ? 0.82 : 1);
      this.pos.x += Math.sin(this.yaw) * speed * dt;
      this.pos.z += Math.cos(this.yaw) * speed * dt;
    }
    // wake and ripples
    this.wakeT = (this.wakeT || 0) - dt;
    if ((this.swimming || wading) && this.wakeT <= 0) {
      this.wakeT = this.swimming ? (moving ? 0.12 : 0.6) : moving ? 0.25 : 1;
      const back = new THREE.Vector3(this.pos.x - Math.sin(this.yaw) * 0.8, WATER_Y + 0.02, this.pos.z - Math.cos(this.yaw) * 0.8);
      G.fx.ripple(this.swimming && moving ? back : new THREE.Vector3(this.pos.x, WATER_Y + 0.02, this.pos.z), this.swimming ? 1.3 : 0.9);
      if (this.swimming && moving) G.fx.splash(back, running ? 3 : 1, 0.5);
    }
    // actions
    if (this.busy <= 0) {
      if ((input.pressed('Mouse0') || input.pressed('KeyK')) && this.attackCd <= 0 && !this.swimming) this.attack();
      else if (input.pressed('Space') && !this.swimming) this.once('Jump', 1.1), G.audio?.jump();
      else if (input.pressed('KeyE') && !this.swimming && !G.refillSpot) this.drink();
      else if (input.pressed('KeyX') && !this.swimming) (this.dancing = !this.dancing), G.onDance?.(this.dancing);
    }
    // collisions: buildings, cars, deep water edge
    W.collide(this.pos, 0.5, this.pos.y);
    for (const c of G.traffic.cars) {
      const f = new THREE.Vector3(Math.sin(c.yaw), 0, Math.cos(c.yaw));
      for (const o of [-1.3, 0, 1.3]) {
        const cx = c.pos.x + f.x * o * (c.halfL / 2.35), cz = c.pos.z + f.z * o * (c.halfL / 2.35);
        const dx = this.pos.x - cx, dz = this.pos.z - cz, d = Math.hypot(dx, dz), rr = c.radius + 0.45;
        if (d < rr && d > 1e-4) {
          this.pos.x += (dx / d) * (rr - d);
          this.pos.z += (dz / d) * (rr - d);
          const sp = c.vel.length();
          if (sp > 4 && this.busy <= 0) {
            // run over!
            this.hurt(sp * 2.2, c.pos);
            this.once('Fall', 1.4);
            this.getUpAfter = true;
            if (c.ai?.mode === 'police') G.police.rammed = true;
          }
        }
      }
    }
    const gy = W.groundY(this.pos.x, this.pos.z);
    if (this.swimming) {
      // float at the surface with a gentle bob (lower when treading water)
      const t = performance.now() / 1000;
      const fy = WATER_Y - (moving ? 0.42 : 0.62) + Math.sin(t * (moving ? 5 : 2.2)) * 0.04;
      this.pos.y += (fy - this.pos.y) * Math.min(1, dt * 6);
    } else if (this.pos.y > gy + 0.05) {
      // dropping off the pier / climbing out: ease to the ground instead of snapping
      this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 8);
    } else this.pos.y = gy;
    if (gy < -9) {
      // too far out to sea: the current carries Macca back towards the bay
      const d = Math.hypot(this.pos.x, this.pos.z) || 1;
      this.pos.x -= (this.pos.x / d) * dt * 3;
      this.pos.z -= (this.pos.z / d) * dt * 3;
      if (!this.toldSea) (this.toldSea = true), G.hud.toast('The current is too strong out here. Swim back to the bay.', 3);
    } else this.toldSea = false;
    // animation choice
    if (this.busy <= 0) {
      if (this.swimming) this.play(moving ? 'Swim' : 'Tread', 0.35, moving ? (running ? 1.6 : 1.05) : 1);
      else if (moving) this.play(running ? 'Run' : 'Walk', 0.2, running ? 1.05 : 1.15);
      else if (this.dancing) this.play('Dance', 0.3);
      else this.play('Idle', 0.3);
    }
    // busted meter fades when nobody holds him
    this.grabbed = Math.max(0, this.grabbed - dt * 0.5);
    this.mixer.update(dt);
    this.syncModel();
  }

  syncModel() {
    this.model.position.copy(this.pos);
    this.model.rotation.y = this.yaw;
  }

  attack() {
    const G = this.G;
    this.once('Attack', 0.62);
    this.attackCd = 0.75;
    G.audio?.chomp();
    const dir = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    setTimeout(() => {
      const hits = G.peds.attack(this.pos, dir);
      for (const p of hits) {
        if (p.cop) G.crime('assault-cop', p.pos);
        else {
          G.crime('assault', p.pos);
          if (Math.random() < 0.7) G.peds.dropCash(p.pos, 5 + Math.floor(Math.random() * 35));
        }
      }
      // tail-whip cars too: a dent and a wobble
      for (const c of G.traffic.cars) {
        if (c.pos.distanceTo(this.pos) < 3.2) {
          c.vel.addScaledVector(dir, 2);
          c.damage(40);
        }
      }
      G.onAttack?.(hits);
    }, 260);
  }

  drink() {
    if (this.drinks <= 0) return this.G.hud.toast('No cocktails left. Buy a refill at the Gator Bar or TIKI hut (E).');
    this.drinks--;
    this.once('Drink', 2.4);
    this.G.audio?.slurp();
    setTimeout(() => (this.health = Math.min(100, this.health + 35)), 1200);
  }

  drive(dt, input) {
    const car = this.car;
    if (car.dead) {
      // inside a burning wreck
      this.exitCar();
      this.hurt(40);
      return;
    }
    let th = 0, st = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) th += 1;
    if (input.down('KeyS') || input.down('ArrowDown')) th -= 1;
    if (input.down('KeyA') || input.down('ArrowLeft')) st += 1;
    if (input.down('KeyD') || input.down('ArrowRight')) st -= 1;
    car.input.throttle = th;
    car.input.steer = st;
    car.input.brake = 0;
    car.input.handbrake = input.down('Space');
    car.input.nitro = input.down('ShiftLeft') && th > 0;
    if (input.pressed('KeyH')) this.G.audio?.horn(car.pos, true), this.G.peds.list.forEach((p) => p.pos.distanceTo(car.pos) < 14 && p.flee(car.pos, 3));
    if (input.pressed('KeyF')) this.exitCar();
    if (car.kind === 'police' && input.pressed('KeyG')) car.siren = !car.siren;
    this.pos.copy(car.pos);
    this.yaw = car.yaw;
    this.mixer.update(dt);
  }
}
