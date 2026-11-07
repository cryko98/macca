// Sky, sun, moon, stars, fog and the day/night clock.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Environment {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.hour = 14.5; // always a sunny afternoon in Leonida
    this.speed = 0; // the clock stands still: it never gets dark
    this.sky = new Sky();
    this.sky.scale.setScalar(4500);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 2.2;
    u.rayleigh.value = 3.6;
    u.mieCoefficient.value = 0.0015;
    u.mieDirectionalG.value = 0.7;
    scene.add(this.sky);

    this.hemi = new THREE.HemisphereLight('#cfe8ff', '#5a4a3a', 0.8);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffffff', 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    const c = this.sun.shadow.camera;
    c.left = c.bottom = -60;
    c.right = c.top = 60;
    c.near = 1;
    c.far = 400;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target);
    this.moon = new THREE.DirectionalLight('#8fb0ff', 0);
    scene.add(this.moon, this.moon.target);

    // stars
    const n = 1500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection();
      v.y = Math.abs(v.y) * 0.9 + 0.05;
      v.normalize().multiplyScalar(2000);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.stars = new THREE.Points(sg, this.starMat);
    scene.add(this.stars);

    scene.fog = new THREE.Fog('#f2b38a', 120, 900);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new Sky();
    this.envSky.scale.setScalar(1000);
    this.envScene.add(this.envSky);
    this.lastEnvHour = -10;
    this.sunDir = new THREE.Vector3();
    this.night = 0;
  }

  // sun rises in the north-east, is high in the south-east at noon and sets over the sea in the south-west
  sunDirection(hour, out) {
    const day = (hour - 6.2) / 13.6; // 0 sunrise (~06:00) .. 1 sunset (~19:30)
    const el = Math.sin(day * Math.PI) * 1.15 - 0.06;
    const az = -Math.PI / 4 + day * Math.PI; // angle on the (x, z) plane
    const ce = Math.cos(el);
    return out.set(Math.cos(az) * ce, Math.sin(el), Math.sin(az) * ce).normalize();
  }

  update(dt, focus) {
    this.hour = (this.hour + dt * this.speed) % 24;
    const d = this.sunDirection(this.hour, this.sunDir);
    const elev = d.y;
    this.night = 1 - smooth(-0.12, 0.06, elev);
    const golden = 1 - smooth(0.05, 0.35, elev);
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(d).multiplyScalar(1000);
    this.renderer.toneMappingExposure = 0.6;
    // sun light: warm and low in the evening, off at night
    const sunCol = new THREE.Color('#ffffff').lerp(new THREE.Color('#ff9a52'), golden);
    this.sun.color.copy(sunCol);
    this.sun.intensity = 2.5 * smooth(-0.04, 0.12, elev);
    this.sun.position.copy(focus).addScaledVector(d, 180);
    this.sun.target.position.copy(focus);
    // moon opposite-ish
    this.moon.intensity = 0.55 * this.night;
    this.moon.position.copy(focus).add(new THREE.Vector3(-60, 120, -40));
    this.moon.target.position.copy(focus);
    this.hemi.intensity = 0.2 + 0.4 * (1 - this.night);
    this.hemi.color.set('#a9cdf2').lerp(new THREE.Color('#ffb98a'), golden * (1 - this.night)).lerp(new THREE.Color('#3b4a8a'), this.night);
    this.hemi.groundColor.set('#6a5442').lerp(new THREE.Color('#1a1428'), this.night);
    this.starMat.opacity = this.night * 0.9;
    this.stars.position.copy(focus);
    // fog: peachy at sunset, blue haze by day, deep purple at night
    const fogDay = new THREE.Color('#8fb8e0'), fogSet = new THREE.Color('#f2a27a'), fogNight = new THREE.Color('#1a1238');
    this.scene.fog.color.copy(fogDay).lerp(fogSet, golden).lerp(fogNight, this.night);
    this.scene.fog.near = 220;
    this.scene.fog.far = 900 + 600 * (1 - this.night);
    // reflections: rebuild the environment map from the sky every ~15 game minutes
    if (Math.abs(this.hour - this.lastEnvHour) > 0.25) {
      this.lastEnvHour = this.hour;
      const eu = this.envSky.material.uniforms;
      for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) eu[k].value = u[k].value;
      eu.sunPosition.value.copy(u.sunPosition.value);
      if (this.envRT) this.envRT.dispose();
      this.envRT = this.pmrem.fromScene(this.envScene, 0.02);
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = 0.15 + 0.4 * (1 - this.night);
    }
  }

  get clockText() {
    const h = Math.floor(this.hour), m = Math.floor((this.hour % 1) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
