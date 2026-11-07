// Pedestrians walking the sidewalks, the beach crowd, and police officers on foot.
import * as THREE from 'three';
import { cloneSkinned, Anim, PEOPLE, COPS } from './assets.js';
import { PIER, WATER_Y } from './world.js';

const WALK = 1.35, RUN = 4.2, COP_RUN = 4.7;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const SHIRTS = ['#f2f2ee', '#ff4fa6', '#3d6ea8', '#e3bd52', '#6fa893', '#ef8a3c', '#8a5fb0', '#2fb3a4', '#ffffff', '#b93a3a'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class Person {
  constructor(G, name, x, z, { cop = false } = {}) {
    this.G = G;
    this.name = name;
    const src = (cop ? G.assets.cops : G.assets.people)[name];
    this.body = cloneSkinned(src.scene);
    if (!cop)
      this.body.traverse((o) => {
        if (o.isSkinnedMesh && /shirt|top|tee|blouse/i.test(o.material.name)) {
          o.material = o.material.clone();
          o.material.color.set(pick(SHIRTS));
        }
      });
    this.meshes = [];
    this.body.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      o.geometry.computeBoundingSphere();
      o.boundingSphere = o.geometry.boundingSphere.clone();
      o.boundingSphere.radius *= 1.6;
      o.frustumCulled = true;
      this.meshes.push(o);
    });
    this.shadow = true;
    this.anim = new Anim(this.body, G.assets.clipsFor.get(name));
    G.scene.add(this.body);
    this.pos = new THREE.Vector3(x, G.world.groundY(x, z), z);
    this.yaw = Math.random() * 6.28;
    this.cop = cop;
    this.state = 'walk';
    this.timer = 0;
    this.down = false;
    this.vel = new THREE.Vector3();
    this.loop = null;
    this.corner = 0;
    this.dir = 1;
  }

  knockDown(dir, force = 4) {
    if (this.down) return false;
    this.down = true;
    this.state = 'down';
    this.timer = 3.5 + Math.random() * 2;
    this.vel.copy(dir).setY(0);
    if (this.vel.lengthSq() < 1e-4) this.vel.set(1, 0, 0);
    this.vel.normalize().multiplyScalar(force);
    this.yaw = Math.atan2(-dir.x, -dir.z); // falls backwards, away from the hit
    this.anim.set('knockdown');
    this.G.audio?.oof();
    return true;
  }

  flee(from, t = 6) {
    if (this.down || this.cop || this.state === 'dance') return;
    this.state = 'flee';
    this.threat = from.clone();
    this.timer = t;
  }

  remove() {
    this.G.scene.remove(this.body);
  }
}

export class People {
  constructor(G) {
    this.G = G;
    this.list = [];
    this.cash = [];
    const W = G.world;
    for (let i = 0; i < 46; i++) {
      const loop = W.pedLoops[i % W.pedLoops.length];
      const k = Math.floor(Math.random() * 4), t = Math.random();
      const p0 = loop[k], p1 = loop[(k + 1) % 4];
      const p = new Person(G, pick(PEOPLE), p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t);
      p.loop = loop;
      p.dir = Math.random() < 0.5 ? 1 : -1;
      p.corner = p.dir > 0 ? (k + 1) % 4 : k;
      p.jogger = loop === W.pedLoops[W.pedLoops.length - 1] ? Math.random() < 0.6 : Math.random() < 0.08;
      this.list.push(p);
    }
    // people strolling and chatting in the town square
    for (let i = 0; i < 12; i++) {
      const at = this.squareSpot();
      const p = new Person(G, pick(PEOPLE), at.x, at.z);
      p.state = 'wander';
      p.wanderer = true;
      p.target = this.squareSpot();
      p.pause = Math.random() * 4;
      p.talk = Math.random() < 0.5;
      this.list.push(p);
    }
    // beach crowd and the pier party (they dance at night)
    for (let i = 0; i < 18; i++) {
      const onPier = i < 6;
      const x = onPier ? PIER.end.x0 + 4 + Math.random() * 10 : -100 + Math.random() * 200;
      const z = onPier ? PIER.end.z0 + 2 + Math.random() * 6 : 112 + Math.random() * 8;
      const p = new Person(G, pick(PEOPLE), x, z);
      p.state = 'idle';
      p.beach = true;
      p.dancer = onPier; // the pier crowd is always dancing to the music
      p.home = p.pos.clone();
      p.yaw = onPier ? Math.PI : Math.random() * 6.28;
      p.anim.set(Math.random() < 0.5 ? 'standtalk' : 'idle');
      this.list.push(p);
    }
    // swimmers out in the shallows, inside the buoy line
    for (let i = 0; i < 7; i++) {
      let x = -100 + Math.random() * 200;
      if (Math.abs(x - 30) < 10) x += 20;
      const p = new Person(G, pick(PEOPLE), x, 130 + Math.random() * 12);
      p.state = 'swim';
      p.swimmer = true;
      p.home = p.pos.clone();
      p.yaw = Math.random() * 6.28;
      p.anim.set('tread');
      this.list.push(p);
    }
    this.cashGeo = new THREE.BoxGeometry(0.3, 0.06, 0.16);
    this.cashMat = new THREE.MeshStandardMaterial({ color: '#5fae5a', emissive: '#2f8a2a', emissiveIntensity: 0.8 });
  }

  // a free spot on the town square plaza (not in the fountain, bandstand, clock tower or flower beds)
  squareSpot() {
    const W = this.G.world;
    for (let k = 0; k < 40; k++) {
      const x = (Math.random() - 0.5) * 44, z = (Math.random() - 0.5) * 44;
      if (Math.hypot(x, z) < 8.5 || Math.hypot(x - 14, z + 13) < 6 || Math.hypot(x + 14, z + 14) < 3.5) continue;
      if (W.circles.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 0.8)) continue;
      return new THREE.Vector3(x, 0, z);
    }
    return new THREE.Vector3(18, 0, 18);
  }

  spawnCop(x, z) {
    const c = new Person(this.G, pick(COPS), x, z, { cop: true });
    c.state = 'chase';
    this.list.push(c);
    return c;
  }

  dropCash(pos, amount) {
    const m = new THREE.Mesh(this.cashGeo, this.cashMat);
    m.position.copy(pos).setY(pos.y + 0.2);
    m.castShadow = true;
    this.G.scene.add(m);
    this.cash.push({ m, amount, t: 0 });
  }

  // a car at speed runs into people
  carHits(car) {
    const sp = car.vel.length();
    if (sp < 3.5) return;
    const f = new THREE.Vector3(Math.sin(car.yaw), 0, Math.cos(car.yaw));
    for (const p of this.list) {
      if (p.down) continue;
      const dx = p.pos.x - car.pos.x, dz = p.pos.z - car.pos.z;
      const ahead = dx * f.x + dz * f.z, lat = Math.abs(dx * f.z - dz * f.x);
      if (Math.abs(ahead) < car.halfL + 0.3 && lat < 1.35 && Math.abs(p.pos.y - car.y) < 1.5) {
        p.knockDown(car.vel.clone(), Math.min(9, sp * 0.7));
        car.vel.multiplyScalar(0.92);
        this.G.onPedHit?.(p, car);
      }
    }
  }

  update(dt) {
    const G = this.G, W = G.world, player = G.player;
    const night = G.env.night;
    const cam = G.camera.position;
    for (const c of G.traffic.cars) this.carHits(c);
    this.shadowT = (this.shadowT || 0) - dt;
    if (this.shadowT <= 0) {
      this.shadowT = 0.5;
      for (const p of this.list) {
        const near = p.pos.distanceTo(cam) < 45;
        if (near !== p.shadow) {
          p.shadow = near;
          for (const m of p.meshes) m.castShadow = near;
        }
      }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      const far = p.pos.distanceTo(cam) > 110;
      let speed = 0, anim = 'idle';
      if (p.state === 'down') {
        p.vel.multiplyScalar(Math.exp(-4 * dt));
        p.pos.addScaledVector(p.vel, dt);
        p.timer -= dt;
        anim = 'knockdown';
        if (p.timer <= 0) {
          if (p.cop && p.removeAfter) {
            p.remove();
            this.list.splice(i, 1);
            continue;
          }
          p.state = 'getup';
          p.timer = p.anim.actions.getup?.getClip().duration || 2;
          p.anim.set('getup');
        }
      } else if (p.state === 'getup') {
        anim = 'getup';
        p.timer -= dt;
        if (p.timer <= 0) {
          p.down = false;
          if (p.cop) p.state = 'chase';
          else p.flee(player.pos, 5);
        }
      } else if (p.state === 'flee') {
        const away = p.pos.clone().sub(p.threat).setY(0);
        if (away.lengthSq() < 0.01) away.set(1, 0, 0);
        p.yaw += wrap(Math.atan2(away.x, away.z) - p.yaw) * Math.min(1, dt * 5);
        speed = RUN;
        anim = 'run';
        p.timer -= dt;
        if (p.timer <= 0) this.rejoin(p);
      } else if (p.state === 'chase') {
        // police officer on foot: run to the gator, grab him
        const target = player.car ? player.car.doorWorld() : player.pos;
        const to = target.clone().sub(p.pos).setY(0);
        const d = to.length();
        p.yaw += wrap(Math.atan2(to.x, to.z) - p.yaw) * Math.min(1, dt * 6);
        if (d > 1.3) {
          speed = Math.min(COP_RUN, d * 2);
          anim = speed > 2 ? 'run' : 'walk';
        } else {
          anim = 'punchr';
          p.punch = (p.punch || 0) + dt;
          if (p.punch > 1.1) {
            p.punch = 0;
            p.anim.actions.punchr.reset();
            if (!player.car) player.hurt(6, p.pos);
          }
          if (!player.car) player.grabbed += dt * 1.0;
          else player.grabbed += dt * (player.car.speed < 2 ? 0.8 : 0);
        }
        if (G.police.stars === 0) {
          p.state = 'walk';
          this.rejoinAsLeaving(p);
        }
      } else if (p.state === 'leave') {
        speed = WALK * 1.4;
        anim = 'walk';
        const to = p.exit.clone().sub(p.pos).setY(0);
        p.yaw += wrap(Math.atan2(to.x, to.z) - p.yaw) * Math.min(1, dt * 4);
        if (to.length() < 2 || p.pos.distanceTo(cam) > 80) {
          p.remove();
          this.list.splice(i, 1);
          continue;
        }
      } else if (p.state === 'swim') {
        // drift around their spot, now and then swim a few strokes
        p.st = (p.st || 0) - dt;
        if (p.st <= 0) {
          p.st = 3 + Math.random() * 5;
          p.stroke = Math.random() < 0.45;
          const back = p.home.clone().sub(p.pos).setY(0);
          p.yaw = back.length() > 6 ? Math.atan2(back.x, back.z) : Math.random() * 6.28;
        }
        speed = p.stroke ? 0.9 : 0;
        anim = p.stroke && p.anim.actions.swim ? 'swim' : 'tread';
      } else if (p.state === 'wander') {
        if (p.pause > 0) {
          p.pause -= dt;
          anim = p.talk ? 'standtalk' : 'idle';
        } else {
          const dx = p.target.x - p.pos.x, dz = p.target.z - p.pos.z;
          p.wt = (p.wt || 0) + dt;
          if (Math.hypot(dx, dz) < 0.9 || p.wt > 25) {
            p.wt = 0;
            p.target = this.squareSpot();
            if (Math.random() < 0.55) {
              p.pause = 3 + Math.random() * 7;
              p.talk = Math.random() < 0.5;
            }
          }
          p.yaw += wrap(Math.atan2(dx, dz) - p.yaw) * Math.min(1, dt * 3);
          speed = WALK * 0.85;
          anim = 'walk';
        }
      } else if (p.state === 'walk' && p.loop) {
        const tgt = p.loop[p.corner];
        const dx = tgt.x - p.pos.x, dz = tgt.y - p.pos.z;
        if (Math.hypot(dx, dz) < 0.8) p.corner = (p.corner + p.dir + 4) % 4;
        p.yaw += wrap(Math.atan2(dx, dz) - p.yaw) * Math.min(1, dt * 3);
        speed = p.jogger ? 3.3 : WALK;
        anim = p.jogger ? 'run' : 'walk';
        // a car or a running gator coming at them
        if (player.car && player.car.vel.length() > 12 && player.car.pos.distanceTo(p.pos) < 9) p.flee(player.car.pos, 4);
      } else if (p.state === 'idle' && p.beach) {
        anim = p.dancer || G.partyTime ? 'dance' : p.anim.target === 'dance' ? 'idle' : p.anim.target;
      }
      // stay out of walls and away from the player; nobody follows Macca into the sea
      if (speed > 0) {
        const nx = p.pos.x + Math.sin(p.yaw) * speed * dt, nz = p.pos.z + Math.cos(p.yaw) * speed * dt;
        if (p.swimmer || W.groundY(nx, nz) > -0.75 || W.groundY(nx, nz) > W.groundY(p.pos.x, p.pos.z)) {
          p.pos.x = nx;
          p.pos.z = nz;
        }
      }
      if (!player.car && !p.down) {
        const dx = p.pos.x - player.pos.x, dz = p.pos.z - player.pos.z, d = Math.hypot(dx, dz);
        if (d < 0.9 && d > 1e-3) {
          p.pos.x += (dx / d) * (0.9 - d);
          p.pos.z += (dz / d) * (0.9 - d);
        }
      }
      W.collide(p.pos, 0.35, 0);
      p.pos.y = p.swimmer && !p.down ? WATER_Y - 1.32 + Math.sin(performance.now() / 600 + p.home.x) * 0.06 : W.groundY(p.pos.x, p.pos.z);
      p.body.position.copy(p.pos);
      p.body.rotation.y = p.yaw;
      if (p.anim.target !== anim && !(p.state === 'down' || p.state === 'getup')) p.anim.set(anim);
      if (!far) p.anim.update(dt);
      else if (Math.random() < 0.2) p.anim.update(dt * 5);
    }
    // cash pickups
    for (let i = this.cash.length - 1; i >= 0; i--) {
      const c = this.cash[i];
      c.t += dt;
      c.m.rotation.y += dt * 3;
      c.m.position.y = W.groundY(c.m.position.x, c.m.position.z) + 0.25 + Math.sin(c.t * 4) * 0.08;
      if (!player.car && c.m.position.distanceTo(player.pos) < 1.4) {
        G.addMoney(c.amount);
        G.audio?.coin();
        G.scene.remove(c.m);
        this.cash.splice(i, 1);
      } else if (c.t > 40) {
        G.scene.remove(c.m);
        this.cash.splice(i, 1);
      }
    }
  }

  // back to walking the nearest block loop
  rejoin(p) {
    let best = null, bd = Infinity;
    for (const loop of this.G.world.pedLoops)
      for (let k = 0; k < 4; k++) {
        const d = (loop[k].x - p.pos.x) ** 2 + (loop[k].y - p.pos.z) ** 2;
        if (d < bd) (bd = d), (best = [loop, k]);
      }
    if (p.swimmer) return void (p.state = 'swim');
    p.state = p.beach ? 'idle' : p.wanderer ? 'wander' : 'walk';
    if (p.wanderer) p.target = this.squareSpot();
    if (p.beach || p.wanderer) return;
    p.loop = best[0];
    p.corner = best[1];
  }

  rejoinAsLeaving(p) {
    p.state = 'leave';
    const pl = this.G.player.pos;
    p.exit = p.pos.clone().add(p.pos.clone().sub(pl).setY(0).normalize().multiplyScalar(60));
  }

  // the gator's bite / tail swipe: everyone in front of him within reach
  attack(from, dir, reach = 2.2) {
    const hits = [];
    for (const p of this.list) {
      if (p.down) continue;
      const to = p.pos.clone().sub(from).setY(0);
      const d = to.length();
      if (d < reach && to.normalize().dot(dir) > 0.2) {
        p.knockDown(dir.clone(), 5);
        hits.push(p);
      }
    }
    // everyone around sees it and runs
    for (const p of this.list) if (!p.down && p.pos.distanceTo(from) < 18) p.flee(from, 6);
    return hits;
  }
}
