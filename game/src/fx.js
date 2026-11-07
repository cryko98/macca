// Particles: smoke, fire, explosions, sparks, fireworks, pickups sparkle.
import * as THREE from 'three';
import { smokeTexture, radialGlow } from './textures.js';

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
    this.smokeMat = new THREE.SpriteMaterial({ map: smokeTexture(), color: '#888', transparent: true, depthWrite: false });
    this.fireMat = new THREE.SpriteMaterial({ map: radialGlow('#ffa040'), color: new THREE.Color(3, 1.6, 0.5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.lights = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight('#ffb060', 0, 40, 1.6);
      l.userData.t = 0;
      scene.add(l);
      this.lights.push(l);
    }
  }

  spawn(mat, pos, vel, life, size, grow = 1, opts = {}) {
    if (this.parts.length > 600) return;
    const s = new THREE.Sprite(mat.clone());
    s.position.copy(pos);
    s.scale.setScalar(size);
    this.scene.add(s);
    this.parts.push({ s, vel: vel.clone(), life, max: life, size, grow, grav: opts.grav ?? 0, drag: opts.drag ?? 0.6, fade: opts.fade ?? 1, color: opts.color });
    if (opts.color) s.material.color.copy(opts.color);
  }

  smoke(pos, dark = 0, n = 1) {
    for (let i = 0; i < n; i++) {
      const p = this.spawn(this.smokeMat, pos, new THREE.Vector3((Math.random() - 0.5) * 0.8, 1.6 + Math.random(), (Math.random() - 0.5) * 0.8), 2.2, 0.8, 2.2, { color: new THREE.Color().setScalar(0.75 - dark * 0.65) });
    }
  }

  fire(pos) {
    this.spawn(this.fireMat, pos, new THREE.Vector3((Math.random() - 0.5) * 0.6, 2 + Math.random() * 1.5, (Math.random() - 0.5) * 0.6), 0.6, 1.1, 0.4);
  }

  flash(pos, power = 60, dur = 0.5) {
    const l = this.lights.sort((a, b) => a.userData.t - b.userData.t)[0];
    l.position.copy(pos);
    l.intensity = power;
    l.userData.t = dur;
    l.userData.p = power;
    l.userData.max = dur;
  }

  explosion(pos) {
    this.flash(pos.clone().add(new THREE.Vector3(0, 2, 0)), 400, 0.8);
    for (let i = 0; i < 26; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(4 + Math.random() * 6);
      v.y = Math.abs(v.y) + 2;
      this.spawn(this.fireMat, pos, v, 0.7 + Math.random() * 0.4, 2.2, 1.6, { drag: 2.5 });
    }
    for (let i = 0; i < 18; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(2 + Math.random() * 3);
      v.y = Math.abs(v.y) * 2 + 1;
      this.spawn(this.smokeMat, pos, v, 3 + Math.random() * 2, 2.5, 2.4, { color: new THREE.Color().setScalar(0.15), drag: 1.2 });
    }
  }

  sparks(pos, n = 8) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(3 + Math.random() * 4);
      v.y = Math.abs(v.y) * 2;
      this.spawn(this.fireMat, pos, v, 0.35, 0.25, 0.3, { grav: 12, drag: 0.5, color: new THREE.Color(3, 2.5, 1.2) });
    }
  }

  firework(pos) {
    const hue = Math.random();
    const c = new THREE.Color().setHSL(hue, 1, 0.6).multiplyScalar(4);
    const c2 = new THREE.Color().setHSL((hue + 0.15) % 1, 1, 0.6).multiplyScalar(4);
    this.flash(pos, 120, 0.6);
    this.lights.forEach((l) => l.color.copy(c).multiplyScalar(0.25));
    for (let i = 0; i < 70; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(11 + Math.random() * 3);
      this.spawn(this.fireMat, pos, v, 1.3 + Math.random() * 0.6, 0.7, 0.4, { grav: 6, drag: 1.4, color: i % 3 ? c : c2 });
    }
  }

  // white water thrown up (entering the sea, kicking)
  splash(pos, n = 12, power = 1) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 3 * power, (2.5 + Math.random() * 3) * power, (Math.random() - 0.5) * 3 * power);
      this.spawn(this.smokeMat, pos, v, 0.7 + Math.random() * 0.3, 0.35 * (0.6 + power * 0.6), 0.9, { grav: 9, drag: 0.4, color: new THREE.Color(1.1, 1.15, 1.2) });
    }
  }

  // an expanding ring on the water surface
  ripple(pos, size = 1) {
    if (!this.ringGeo) {
      this.ringGeo = new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2);
      this.ripples = [];
    }
    if (this.ripples.length > 40) return;
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false }));
    m.position.copy(pos);
    m.scale.setScalar(0.4 * size);
    this.scene.add(m);
    this.ripples.push({ m, t: 0, size });
  }

  sparkle(pos, color) {
    this.spawn(this.fireMat, pos, new THREE.Vector3((Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2), 0.6, 0.35, 0.2, { grav: 4, color });
  }

  update(dt) {
    for (let i = (this.ripples?.length || 0) - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.t += dt;
      r.m.scale.setScalar((0.4 + r.t * 1.6) * r.size);
      r.m.material.opacity = Math.max(0, 0.55 * (1 - r.t / 1.4));
      if (r.t > 1.4) {
        this.scene.remove(r.m);
        r.m.material.dispose();
        this.ripples.splice(i, 1);
      }
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.s);
        p.s.material.dispose();
        this.parts.splice(i, 1);
        continue;
      }
      p.vel.y -= p.grav * dt;
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.s.position.addScaledVector(p.vel, dt);
      const k = 1 - p.life / p.max;
      p.s.scale.setScalar(p.size * (1 + k * p.grow));
      p.s.material.opacity = Math.min(1, (p.life / p.max) * 1.5) * p.fade;
    }
    for (const l of this.lights) {
      if (l.userData.t > 0) {
        l.userData.t -= dt;
        l.intensity = Math.max(0, (l.userData.t / l.userData.max) * l.userData.p);
      } else {
        l.intensity = 0;
        l.color.set('#ffb060');
      }
    }
  }
}
