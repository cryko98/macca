// Loads the models: the gator (player), Sol City's cars, helicopter and Rocketbox people + clips.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export const CAR_KINDS = ['sedan', 'coupe', 'taxi', 'super', 'lux', 'van', 'police'];
export const PEOPLE = ['Business_Female_02', 'Business_Male_02', 'Female_Adult_01', 'Female_Adult_05', 'Female_Adult_08', 'Female_Adult_12', 'Male_Adult_01', 'Male_Adult_03', 'Male_Adult_05', 'Male_Adult_14', 'Female_Adult_03', 'Female_Adult_15', 'Male_Adult_08', 'Male_Adult_18'];
export const COPS = ['Police_Male_01', 'Police_Female_01'];
const CLIPS = ['idle', 'walk', 'run', 'sprint', 'knockdown', 'getup', 'dance', 'drive', 'punchr', 'standtalk', 'hit', 'tread', 'swim'];

export async function loadAssets(onProgress) {
  const loader = new GLTFLoader();
  const jobs = [];
  const out = { cars: {}, people: {}, cops: {} };
  const add = (url, fn) => jobs.push(() => loader.loadAsync(url).then(fn));
  add('assets/models/gator.glb', (g) => (out.gator = g));
  add('assets/models/rb_hero.glb', (g) => (out.hero = g));
  add('assets/models/heli_police.glb', (g) => (out.heli = g));
  for (const k of CAR_KINDS) add(`assets/models/car_${k}.glb`, (g) => (out.cars[k] = g));
  for (const p of PEOPLE) add(`assets/models/people/${p}.glb`, (g) => (out.people[p] = g));
  for (const p of COPS) add(`assets/models/people/${p}.glb`, (g) => (out.cops[p] = g));
  let done = 0;
  await Promise.all(jobs.map((j) => j().then(() => onProgress?.(++done / jobs.length))));

  // the hero's motion capture clips, ready for every Rocketbox body
  const heroPelvis = pelvisHeight(out.hero.scene);
  const base = {};
  for (const n of CLIPS) {
    const c = out.hero.animations.find((a) => a.name === n);
    if (!c) continue;
    if (['walk', 'run', 'sprint'].includes(n)) removeDrift(c);
    base[n] = c;
  }
  out.clipsFor = new Map();
  for (const [name, g] of [...Object.entries(out.people), ...Object.entries(out.cops)]) {
    const k = pelvisHeight(g.scene) / heroPelvis;
    const clips = {};
    for (const [n, c] of Object.entries(base)) {
      clips[n] = Math.abs(k - 1) < 0.005 ? c : new THREE.AnimationClip(n, c.duration, c.tracks.map((t) => {
        if (t.name !== 'Bip01_Pelvis.position') return t;
        const u = t.clone();
        for (let i = 0; i < u.values.length; i++) u.values[i] *= k;
        return u;
      }));
    }
    out.clipsFor.set(name, clips);
    g.scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
      }
    });
  }
  for (const g of Object.values(out.cars)) g.scene.traverse((o) => o.isMesh && ((o.castShadow = true), (o.receiveShadow = true)));
  out.gator.scene.traverse((o) => o.isMesh && ((o.castShadow = true), (o.frustumCulled = false)));
  return out;
}

function pelvisHeight(scene) {
  const pel = scene.getObjectByName('Bip01_Pelvis');
  scene.updateMatrixWorld(true);
  return scene.worldToLocal(pel.getWorldPosition(new THREE.Vector3())).y;
}

// walk cycles step on the spot, but the pelvis drifts over a loop: take the drift out
function removeDrift(c) {
  const pt = c.tracks.find((t) => t.name === 'Bip01_Pelvis.position');
  if (!pt) return;
  const v = pt.values, n = pt.times.length, dur = pt.times[n - 1] - pt.times[0] || 1;
  const d = [0, 1, 2].map((k) => v[(n - 1) * 3 + k] - v[k]);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) v[i * 3 + k] -= (d[k] * (pt.times[i] - pt.times[0])) / dur;
}

export function cloneSkinned(scene) {
  return SkeletonUtils.clone(scene);
}

// A blended animation set for a Rocketbox person
export class Anim {
  constructor(root, clips) {
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {};
    this.w = {};
    for (const [n, c] of Object.entries(clips)) {
      const a = this.mixer.clipAction(c);
      if (['knockdown', 'getup', 'punchr', 'hit'].includes(n)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      a.time = Math.random() * c.duration;
      this.actions[n] = a;
      this.w[n] = 0;
    }
    this.target = 'idle';
    this.w.idle = 1;
    this.actions.idle.play();
  }
  set(name) {
    if (this.target === name) return;
    this.target = name;
    const a = this.actions[name];
    if (a.loop === THREE.LoopOnce) a.reset();
    a.play();
  }
  update(dt, rate = 10) {
    const k = 1 - Math.exp(-rate * dt);
    for (const n in this.actions) {
      const t = n === this.target ? 1 : 0;
      this.w[n] += (t - this.w[n]) * k;
      const a = this.actions[n];
      if (!t && this.w[n] < 0.01) {
        this.w[n] = 0;
        if (a.isRunning()) a.stop();
        continue;
      }
      a.setEffectiveWeight(this.w[n]);
    }
    this.mixer.update(dt);
  }
}
