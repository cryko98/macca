// Sol City Stories: Leonida. Boot, input, camera, game loop and the glue between systems.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { setMaxAnisotropy } from './textures.js';
import { World } from './world.js';
import { Environment } from './env.js';
import { loadAssets } from './assets.js';
import { Player } from './player.js';
import { Traffic, Car } from './vehicles.js';
import { People } from './people.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { Help } from './help.js';
import { initSite } from './site.js';
import { Animals } from './animals.js';
import { Beach } from './beach.js';
import { Touch } from './touch.js';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'gatorbay-save-v1';

// pointer lock can be refused (embedded frames, no user gesture): drag-to-look still works
function lockPointer(el) {
  try {
    el.requestPointerLock?.()?.catch?.(() => {});
  } catch {}
}

// ------------------------------------------------------------------ input
class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.hit = new Set();
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.locked = false;
    addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!this.keys.has(e.code)) this.hit.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked && G.state === 'play') lockPointer(canvas);
      this.hit.add('Mouse' + e.button);
      this.keys.add('Mouse' + e.button);
    });
    addEventListener('mouseup', (e) => this.keys.delete('Mouse' + e.button));
    addEventListener('mousemove', (e) => {
      // mouse look when the pointer is locked, or drag with a button held when it isn't
      if (this.locked || (e.buttons && e.target === canvas)) {
        this.dx += e.movementX;
        this.dy += e.movementY;
      }
    });
    addEventListener('wheel', (e) => (this.wheel += Math.sign(e.deltaY)), { passive: true });
    document.addEventListener('pointerlockchange', () => (this.locked = document.pointerLockElement === canvas));
  }
  down(c) {
    return this.keys.has(c);
  }
  pressed(c) {
    return this.hit.has(c);
  }
  consume(c) {
    this.hit.delete(c);
  }
  endFrame() {
    this.hit.clear();
    this.dx = this.dy = this.wheel = 0;
  }
}

// ------------------------------------------------------------------ the game
const G = (window.G = {
  state: 'loading',
  money: 0,
  camYaw: 0,
  camPitch: 0.28,
  camDist: 6,
  partyTime: false,
});

function loadSave() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY)) || {};
  } catch {
    return {};
  }
}

G.persist = () => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ money: G.money, done: G.missions.done, flamingos: [...G.missions.flamingosFound], quality: G.quality, qualityManual: !!G.save.qualityManual, seenIntro: G.save.seenIntro }));
  } catch {}
};

G.addMoney = (n) => {
  G.money = Math.max(0, G.money + n);
};

G.crime = (type, pos) => G.police.crime(type, pos);

G.onPedHit = (p, car) => {
  if (car.driver !== 'player') return;
  G.crime(p.cop ? 'hit-cop' : 'hit-ped', p.pos);
  for (const q of G.peds.list) if (q !== p && q.pos.distanceTo(p.pos) < 16) q.flee(car.pos, 5);
};

G.onCarHit = (a, b, rv) => {
  const mine = a.driver === 'player' ? a : b.driver === 'player' ? b : null;
  if (!mine) return;
  const other = mine === a ? b : a;
  if (other.kind === 'police' && rv > 4 && other.ai?.mode !== 'police') G.crime('ram-cop', other.pos);
};

G.onExplosion = (pos, src) => {
  for (const c of G.traffic.cars) {
    if (c === src) continue;
    const d = c.pos.distanceTo(pos);
    if (d < 9) {
      c.damage((9 - d) * 70);
      c.vel.add(c.pos.clone().sub(pos).setY(0).normalize().multiplyScalar((9 - d) * 1.5));
    }
  }
  for (const p of G.peds.list) {
    const d = p.pos.distanceTo(pos);
    if (d < 8) p.knockDown(p.pos.clone().sub(pos), 7);
    else if (d < 30) p.flee(pos, 6);
  }
  const pl = G.player;
  if (!pl.car && pl.pos.distanceTo(pos) < 7) {
    pl.hurt((7 - pl.pos.distanceTo(pos)) * 12, pos);
    if (!pl.dead) pl.once('Fall', 1.4), (pl.getUpAfter = true);
  }
  if (src && src.driver !== 'player' && pos.distanceTo(pl.car ? pl.car.pos : pl.pos) < 40) G.crime('explode', pos);
  G.hud.shake(Math.max(0, 1 - pos.distanceTo(G.camera.position) / 60));
};

G.onStunt = (car, air) => {
  if (car.driver !== 'player') return;
  const bonus = Math.round(air * 15) * 10;
  G.addMoney(bonus);
  G.hud.big(air > 1.6 ? 'INSANE STUNT BONUS' : 'STUNT BONUS', `$${bonus} · ${air.toFixed(1)}s airtime`, '#3fe0ff', 3);
  G.audio.coin();
};

G.cutscene = (title, lines, done) => {
  G.state = 'cutscene';
  document.exitPointerLock?.();
  G.hud.dialogue(title, lines, () => {
    G.state = 'play';
    done();
  });
};

function endScene(text, color, where, fine) {
  if (G.state !== 'play') return;
  G.state = 'dead';
  const pl = G.player;
  if (pl.car) pl.exitCar();
  pl.dead = true;
  pl.once('Fall', 1.4);
  G.missions.active && G.missions.fail(text === 'WASTED' ? 'You were wasted.' : 'You were busted.');
  G.hud.big(text, `-$${fine}`, color, 4);
  G.audio.failed();
  setTimeout(() => {
    G.addMoney(-fine);
    G.police.clear();
    for (const p of G.peds.list) if (p.cop) G.peds.rejoinAsLeaving(p);
    pl.spawn(where.x, where.z, Math.PI);
    pl.drinks = 3;
    G.state = 'play';
    G.persist();
  }, 4500);
}
G.wasted = () => endScene('WASTED', '#ff4f4f', { x: G.world.places.clinic.x, z: G.world.places.clinic.z }, 100);
G.busted = () => endScene('BUSTED', '#4fb8ff', { x: -42, z: -80 }, 200);

// ------------------------------------------------------------------ boot
async function boot() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.body.prepend(renderer.domElement);
  setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 5000);
  Object.assign(G, { renderer, scene, camera, save: loadSave() });
  G.money = G.save.money ?? 250;
  G.input = new Input(renderer.domElement);
  G.audio = new Audio();

  // web fonts are drawn into canvas textures, so they must be ready first
  await Promise.all(['120px Monoton', '120px Bungee', '170px Anton'].map((f) => document.fonts.load(f).catch(() => {})));
  const bar = $('loadbar');
  G.assets = await loadAssets((p) => (bar.style.width = Math.round(p * 85) + '%'));
  $('loadtext').textContent = 'Building Leonida…';
  await new Promise((r) => setTimeout(r, 30));
  G.world = new World(scene);
  G.env = new Environment(scene, renderer);
  G.fx = new FX(scene);
  G.traffic = new Traffic(G);
  G.peds = new People(G);
  G.animals = new Animals(G);
  G.beach = new Beach(G);
  G.police = new Police(G);
  G.player = new Player(G);
  G.missions = new Missions(G);
  G.hud = new HUD(G);
  G.help = new Help(G);
  G.touch = new Touch(G);
  initSite(G);
  for (let i = 0; i < 12; i++) G.traffic.spawnTraffic(G.player.pos);
  // parked cars
  const parked = [['police', -88, -86, 0], ['police', -80, -86, 0], ['coupe', 54, -4, 0], ['sedan', 76, 16, 0], ['lux', -86, 40.5, Math.PI / 2], ['taxi', -30.5, 60, 0], ['super', 109, -60, 0], ['van', -70, -14, 0]];
  for (const [k, x, z, yaw] of parked) {
    const c = G.traffic.add(new Car(G, k, x, z, yaw, { driver: false }));
    c.parked = true;
  }
  bar.style.width = '100%';

  // HD post chain: a multisampled (MSAA x4) half-float target so edges stay smooth through the passes
  const pr = renderer.getPixelRatio();
  const rt = new THREE.WebGLRenderTarget(innerWidth * pr, innerHeight * pr, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  // ULTRA: ground-contact ambient occlusion (under cars, in corners, along kerbs)
  const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
  gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.2, scale: 1.1 });
  gtao.blendIntensity = 0.85;
  composer.addPass(gtao);
  G.gtao = gtao;
  // bloom only catches really hot spots (explosions, fireworks): no glare from the sun, sky or sea
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.3, 0.35, 8);
  G.bloom = bloom;
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  G.composer = composer;
  // phones and tablets start light; desktops start sharp (both step down by themselves if slow)
  applyQuality(G.save.quality || (G.touch?.on ? 'LOW' : 'HIGH'), true);
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    gtao.setSize(innerWidth, innerHeight);
  });

  // compile shaders up front for smooth play
  G.env.update(0, G.player.pos);
  updateCamera(0);
  renderer.compile(scene, camera);

  $('loading').style.display = 'none';
  $('title').style.display = 'flex';
  G.state = 'title';
  G.camYaw = 2.6;
  $('playbtn').onclick = () => {
    G.audio.init();
    G.touch?.enterFullscreen();
    $('title').style.display = 'none';
    $('hud').style.display = 'block';
    G.state = 'play';
    G.camYaw = G.player.yaw;
    G.camPitch = 0.22;
    lockPointer(renderer.domElement);
    if (!G.save.seenIntro) {
      G.save.seenIntro = true;
      G.hud.toast('Walk into the yellow beam at the GATOR BAR door to start the story. Press ? (or Tab) for help, controls and missions.', 9);
    }
  };
  $('resumebtn').onclick = () => {
    $('pause').style.display = 'none';
    G.state = 'play';
    lockPointer(renderer.domElement);
  };

  let last = performance.now(), saveT = 0;
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    frame(dt);
    if ((saveT += dt) > 10) (saveT = 0), G.persist();
  });
}

// ------------------------------------------------------------------ graphics quality
// LOW: 1x resolution, no MSAA, 2K shadows · HIGH: up to 2x resolution, MSAA x4, 4K shadows · ULTRA: HIGH + ambient occlusion
const QUALITIES = ['LOW', 'HIGH', 'ULTRA'];
function applyQuality(q, quiet = false) {
  if (!QUALITIES.includes(q)) q = 'HIGH';
  G.quality = q;
  const r = G.renderer;
  r.setPixelRatio(q === 'LOW' ? 1 : Math.min(devicePixelRatio, 2));
  r.setSize(innerWidth, innerHeight);
  G.composer.setPixelRatio(r.getPixelRatio());
  G.composer.setSize(innerWidth, innerHeight);
  for (const t of [G.composer.renderTarget1, G.composer.renderTarget2]) {
    t.samples = q === 'LOW' ? 0 : 4;
    t.dispose();
  }
  const sz = q === 'ULTRA' ? 4096 : 2048, sh = G.env.sun.shadow;
  if (sh.mapSize.x !== sz) {
    sh.mapSize.set(sz, sz);
    sh.map?.dispose();
    sh.map = null;
  }
  G.gtao.enabled = q === 'ULTRA';
  G.save.quality = q;
  G.onQuality?.(q);
  if (!quiet) G.hud?.toast(`Graphics: ${q}`, 2);
}
G.cycleQuality = () => {
  G.save.qualityManual = true;
  applyQuality(QUALITIES[(QUALITIES.indexOf(G.quality) + 1) % QUALITIES.length]);
};
G.setQuality = (q) => {
  G.save.qualityManual = true;
  applyQuality(q);
};

// automatic quality: if the game runs below ~24 fps for a few seconds, step down one level
// (only while nobody has picked a level by hand)
const perf = { t: 0, frames: 0, grace: 4 };
function autoQuality(dt) {
  if (G.save.qualityManual || G.state !== 'play' || G.quality === 'LOW') return;
  if ((perf.grace -= dt) > 0) return;
  perf.t += dt;
  perf.frames++;
  if (perf.t < 3) return;
  const fps = perf.frames / perf.t;
  perf.t = perf.frames = 0;
  if (fps < 24) {
    applyQuality(QUALITIES[QUALITIES.indexOf(G.quality) - 1], true);
    perf.grace = 3;
    G.hud.toast(`Graphics set to ${G.quality} for smoother play (${Math.round(fps)} fps). Press P to change.`, 4);
    G.persist();
  }
}

// ------------------------------------------------------------------ camera
const _t = new THREE.Vector3(), _c = new THREE.Vector3();
let camIdle = 0;
function updateCamera(dt) {
  const pl = G.player, inp = G.input;
  if (G.state === 'title') {
    // slow fly-around over the bay
    G.camYaw += dt * 0.05;
    const c = new THREE.Vector3(30 + Math.sin(G.camYaw) * 140, 45, 60 + Math.cos(G.camYaw) * 140);
    G.camera.position.copy(c);
    G.camera.lookAt(10, 8, 40);
    return;
  }
  const sens = 0.0025;
  if (inp.dx || inp.dy) camIdle = 0;
  else camIdle += dt;
  G.camYaw -= inp.dx * sens;
  G.camPitch = THREE.MathUtils.clamp(G.camPitch + inp.dy * sens, -0.25, 1.2);
  G.camDist = THREE.MathUtils.clamp(G.camDist + inp.wheel * 0.8, 3.5, 14);
  const car = pl.car;
  let dist = G.camDist, height = 1.75;
  if (car) {
    dist = G.camDist + 3.5;
    height = 1.6;
    _t.copy(car.pos).setY(car.y + height);
    // swing behind the car when driving and the mouse is idle
    if (camIdle > 0.5 && Math.abs(car.speed) > 2) {
      const behind = car.speed > 0 ? car.yaw : car.yaw + Math.PI;
      const d = Math.atan2(Math.sin(behind - G.camYaw), Math.cos(behind - G.camYaw));
      G.camYaw += d * Math.min(1, dt * 2.5);
      G.camPitch += (0.22 - G.camPitch) * Math.min(1, dt * 2);
    }
  } else {
    _t.copy(pl.pos).setY(pl.pos.y + height * 0.92);
    if (G.state === 'dead') G.camYaw += dt * 0.4;
    // follow: when Macca moves and the mouse is idle, swing round behind him
    const A = inp.analog;
    const moving = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].some((k) => inp.down(k)) || (A && A.active && Math.hypot(A.x, A.y) > 0.18);
    if (moving && camIdle > 0.5 && G.state === 'play') {
      const backward = ((inp.down('KeyS') || inp.down('ArrowDown')) && !(inp.down('KeyW') || inp.down('ArrowUp'))) || (A && A.active && A.y < -0.5 && Math.abs(A.x) < 0.45);
      if (!backward) {
        const d = Math.atan2(Math.sin(pl.yaw - G.camYaw), Math.cos(pl.yaw - G.camYaw));
        G.camYaw += d * Math.min(1, dt * 2.2);
      }
      G.camPitch += (0.28 - G.camPitch) * Math.min(1, dt * 1.5);
    }
  }
  const cp = Math.cos(G.camPitch);
  _c.set(_t.x - Math.sin(G.camYaw) * cp * dist, _t.y + Math.sin(G.camPitch) * dist, _t.z - Math.cos(G.camYaw) * cp * dist);
  // keep the camera out of buildings
  const k = G.world.rayClear(_t.x, _t.z, _c.x, _c.z, _c.y - 1);
  if (k < 1) _c.lerpVectors(_t, _c, Math.max(0.15, k - 0.05));
  _c.y = Math.max(_c.y, G.world.groundY(_c.x, _c.z) + 0.6);
  G.camera.position.lerp(_c, Math.min(1, dt * (car ? 10 : 14)) || 1);
  const sh = G.hud?.shakeAmt || 0;
  if (sh > 0) {
    G.camera.position.x += (Math.random() - 0.5) * sh * 0.6;
    G.camera.position.y += (Math.random() - 0.5) * sh * 0.6;
    G.hud.shakeAmt = Math.max(0, sh - dt * 2.5);
  }
  G.camera.lookAt(_t);
  // a wider view at speed
  const fov = car ? 60 + Math.min(18, Math.abs(car.speed) * 0.4) : 58;
  G.camera.fov += (fov - G.camera.fov) * Math.min(1, dt * 3);
  G.camera.updateProjectionMatrix();
}

// ------------------------------------------------------------------ frame
function frame(dt) {
  const inp = G.input;
  const playing = G.state === 'play';
  if (G.state === 'paused' || G.state === 'help') {
    inp.endFrame();
    return;
  }
  if (playing && inp.pressed('Escape')) {
    G.state = 'paused';
    $('pause').style.display = 'flex';
    document.exitPointerLock?.();
  }
  if (playing && inp.pressed('KeyM')) G.hud.toggleMap();
  if (playing && inp.pressed('KeyP')) G.cycleQuality();
  if (playing && inp.pressed('KeyR')) (G.audio.radioOn = !G.audio.radioOn), G.hud.toast(G.audio.radioOn ? 'Radio: GATOR FM — synthwave' : 'Radio off', 2);
  const focus = G.player.car ? G.player.car.pos : G.player.pos;
  G.env.update(dt, focus);
  G.world.update(dt, performance.now() / 1000, G.env.night);
  G.world.setClock(G.env.hour);
  if (G.state !== 'title') {
    if (playing || G.state === 'dead') G.player.update(dt, playing ? inp : DUMMY, G.camYaw);
    else G.player.mixer.update(dt);
    G.traffic.update(dt);
    G.peds.update(dt);
    G.animals.update(dt);
    G.beach.update(dt);
    G.police.update(dt);
    G.missions.update(dt);
    G.hud.update(dt);
  } else {
    G.traffic.update(dt);
    G.peds.update(dt);
    G.animals.update(dt);
    G.beach.update(dt);
  }
  G.fx.update(dt);
  G.audio.update(G);
  updateCamera(dt);
  G.touch?.update();
  G.composer.render();
  autoQuality(dt);
  inp.endFrame();
}

const DUMMY = { down: () => false, pressed: () => false, consume() {} };

boot().catch((e) => {
  console.error(e);
  $('loadtext').textContent = 'Failed to load: ' + e.message + ' (serve the folder over http, e.g. node serve.js)';
});
