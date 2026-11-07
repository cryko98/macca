// HUD: money, wanted stars, health, minimap + GPS, big map, messages, cutscene dialogue.
import { ROADS_X, ROADS_Z, RW, PIER, terrainH, WATER_Y } from './world.js';
import { touchText } from './touch.js';

const $ = (id) => document.getElementById(id);
const MAP_MIN = -260, MAP_SIZE = 520;

export class HUD {
  constructor(G) {
    this.G = G;
    this.el = $('hud');
    this.money = $('money');
    this.stars = $('stars');
    this.hp = $('hpfill');
    this.clock = $('clock');
    this.obj = $('objective');
    this.timerEl = $('timer');
    this.toastEl = $('toast');
    this.hintEl = $('hint');
    this.bigEl = $('big');
    this.speedEl = $('speed');
    this.targetEl = $('target');
    this.dmgEl = $('damage');
    this.mini = $('minimap');
    this.mctx = this.mini.getContext('2d');
    this.mapEl = $('bigmap');
    this.shown = 0;
    this.hintT = 0;
    this.toastT = 0;
    this.shakeAmt = 0;
    this.gpsT = 0;
    this.gps = [];
    this.buildMapImage();
  }

  // the static map: water, beach, grass, blocks, roads, pier
  buildMapImage() {
    const c = document.createElement('canvas');
    c.width = c.height = MAP_SIZE;
    const g = c.getContext('2d');
    const img = g.createImageData(MAP_SIZE, MAP_SIZE);
    for (let y = 0; y < MAP_SIZE; y++)
      for (let x = 0; x < MAP_SIZE; x++) {
        const wx = x + MAP_MIN, wz = y + MAP_MIN, h = terrainH(wx, wz);
        let col;
        if (h < WATER_Y) col = [40, 120, 150];
        else if ((wz > 104 || wx > 126) && h < 2) col = [236, 214, 160];
        else if (h > 14) col = [120, 125, 100];
        else col = [92, 140, 72];
        const i = (y * MAP_SIZE + x) * 4;
        img.data.set([col[0], col[1], col[2], 255], i);
      }
    g.putImageData(img, 0, 0);
    const X = (v) => v - MAP_MIN;
    g.fillStyle = '#c9c2b6';
    for (const r of this.G.world.raised) g.fillRect(X(r.x0), X(r.z0), r.x1 - r.x0, r.z1 - r.z0);
    g.fillStyle = '#e9b9cf';
    for (const s of this.G.world.solids) if (s.h < 60) g.fillRect(X(s.x0), X(s.z0), s.x1 - s.x0, s.z1 - s.z0);
    g.fillStyle = '#3c3f47';
    for (const x of ROADS_X) g.fillRect(X(x - RW), X(ROADS_Z[0] - RW), RW * 2, ROADS_Z[3] - ROADS_Z[0] + RW * 2);
    for (const z of ROADS_Z) g.fillRect(X(ROADS_X[0] - RW), X(z - RW), ROADS_X[3] - ROADS_X[0] + RW * 2, RW * 2);
    g.fillStyle = '#9b6f4b';
    g.fillRect(X(PIER.x0), X(PIER.z0), PIER.x1 - PIER.x0, PIER.z1 - PIER.z0);
    g.fillRect(X(PIER.end.x0), X(PIER.end.z0), PIER.end.x1 - PIER.end.x0, PIER.end.z1 - PIER.end.z0);
    this.mapImg = c;
  }

  update(dt) {
    const G = this.G, pl = G.player;
    this.money.textContent = '$' + String(Math.floor(this.shown)).padStart(8, '0');
    this.shown += (G.money - this.shown) * Math.min(1, dt * 6);
    if (Math.abs(G.money - this.shown) < 1) this.shown = G.money;
    // stars blink while the cops have lost sight of you
    const s = G.police.stars;
    const blink = s && !G.police.seen && Math.floor(performance.now() / 300) % 2;
    let html = '';
    for (let i = 0; i < 5; i++) html += `<span class="${i < s ? (blink ? 'on blink' : 'on') : ''}">★</span>`;
    if (html !== this.starsHTML) (this.stars.innerHTML = html), (this.starsHTML = html);
    this.hp.style.width = pl.health + '%';
    this.hp.style.background = pl.health < 30 ? '#ff4f4f' : '#7dff8a';
    $('drinks').textContent = '🍸'.repeat(pl.drinks) || '—';
    this.clock.textContent = G.env.clockText;
    if (pl.car) {
      this.speedEl.style.display = 'block';
      const kmh = Math.abs(pl.car.speed) * 3.6;
      this.speedEl.innerHTML = `${Math.round(kmh)}<small>KM/H</small><div class="carhp"><i style="width:${Math.max(0, (pl.car.health / pl.car.spec.health) * 100)}%"></i></div>`;
    } else this.speedEl.style.display = 'none';
    if ((this.hintT -= dt) <= 0) this.hintEl.style.opacity = 0;
    if ((this.toastT -= dt) <= 0) this.toastEl.style.opacity = 0;
    this.dmgEl.style.opacity = Math.max(0, parseFloat(this.dmgEl.style.opacity || 0) - dt * 2);
    this.drawMinimap(dt);
    if (this.mapEl.style.display === 'block') this.drawBigMap();
    // context hints
    if (!pl.car && G.state === 'play') {
      const c = pl.nearestCar();
      if (c) this.hint(c.driver && c.driver !== 'player' ? 'Press F to jack this car' : 'Press F to get in');
    }
  }

  // ------------------------------------------------------------------ minimap
  drawMinimap(dt) {
    const G = this.G, g = this.mctx, W = this.mini.width, H = this.mini.height;
    const pl = G.player, P = pl.car ? pl.car.pos : pl.pos;
    const zoom = pl.car ? 1.1 : 1.8; // px per metre
    const rot = G.camYaw;
    g.save();
    g.clearRect(0, 0, W, H);
    g.beginPath();
    g.arc(W / 2, H / 2, W / 2 - 3, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#28788f';
    g.fillRect(0, 0, W, H);
    g.translate(W / 2, H / 2);
    g.rotate(Math.PI + rot);
    g.scale(zoom, zoom);
    g.translate(-(P.x - MAP_MIN), -(P.z - MAP_MIN));
    g.drawImage(this.mapImg, 0, 0);
    // GPS route
    this.gpsT -= dt;
    const blips = G.missions.blips();
    const target = blips.find((b) => b.gps);
    if (target && this.gpsT <= 0) {
      this.gpsT = 0.5;
      const W2 = G.world;
      const path = W2.path(W2.nearestNode(P.x, P.z), W2.nearestNode(target.x, target.z));
      this.gps = [{ x: P.x, z: P.z }, ...path.map((n) => ({ x: n.x, z: n.z })), { x: target.x, z: target.z }];
    }
    if (target && this.gps.length) {
      g.strokeStyle = '#ff4fa6';
      g.lineWidth = 4 / zoom * 1.4;
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(P.x - MAP_MIN, P.z - MAP_MIN);
      for (const p of this.gps.slice(1)) g.lineTo(p.x - MAP_MIN, p.z - MAP_MIN);
      g.stroke();
    }
    const dot = (x, z, col, r) => {
      g.fillStyle = col;
      g.beginPath();
      g.arc(x - MAP_MIN, z - MAP_MIN, r / zoom, 0, Math.PI * 2);
      g.fill();
    };
    const flash = Math.floor(performance.now() / 250) % 2;
    for (const c of G.police.cars) if (!c.dead) dot(c.pos.x, c.pos.z, flash ? '#ff3b3b' : '#3b8bff', 5);
    for (const p of G.peds.list) if (p.cop && !p.down) dot(p.pos.x, p.pos.z, '#3b8bff', 3);
    for (const f of G.missions.flamingos) if (Math.hypot(f.x - P.x, f.z - P.z) < 30) dot(f.x, f.z, '#ff4fa6', 3);
    g.restore();
    // blips clamped to the edge
    for (const b of blips) {
      const dx = b.x - P.x, dz = b.z - P.z;
      const c = Math.cos(Math.PI + rot), s = Math.sin(Math.PI + rot);
      let sx = (dx * c - dz * s) * zoom, sy = (dx * s + dz * c) * zoom;
      const R = W / 2 - 10, d = Math.hypot(sx, sy);
      if (d > R) (sx *= R / d), (sy *= R / d);
      g.fillStyle = b.color;
      g.strokeStyle = '#000';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(W / 2 + sx, H / 2 + sy, b.small ? 4 : 7, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      if (b.label) {
        g.fillStyle = '#000';
        g.font = 'bold 10px sans-serif';
        g.textAlign = 'center';
        g.fillText(b.label, W / 2 + sx, H / 2 + sy + 3.5);
      }
    }
    // the player arrow
    g.save();
    g.translate(W / 2, H / 2);
    g.rotate(-(pl.car ? pl.car.yaw : pl.yaw) + rot);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#ff4fa6';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -9);
    g.lineTo(6, 7);
    g.lineTo(0, 3);
    g.lineTo(-6, 7);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2);
    g.stroke();
    // north marker
    const na = Math.PI + rot;
    g.fillStyle = '#fff';
    g.font = 'bold 12px Anton, sans-serif';
    g.textAlign = 'center';
    g.fillText('N', W / 2 + Math.sin(na) * (W / 2 - 12), H / 2 - Math.cos(na) * (W / 2 - 12) + 4);
  }

  toggleMap() {
    this.mapEl.style.display = this.mapEl.style.display === 'block' ? 'none' : 'block';
  }

  drawBigMap(cv = $('bigmapcv'), info = true) {
    const G = this.G, g = cv.getContext('2d');
    const S = cv.width / MAP_SIZE;
    g.drawImage(this.mapImg, 0, 0, cv.width, cv.height);
    const pt = (x, z) => [(x - MAP_MIN) * S, (z - MAP_MIN) * S];
    const lab = (x, z, t) => {
      const [a, b] = pt(x, z);
      g.font = 'bold 13px Anton, sans-serif';
      g.textAlign = 'center';
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(0,0,0,.6)';
      g.strokeText(t, a, b);
      g.fillStyle = '#fff';
      g.fillText(t, a, b);
    };
    lab(-59, -82, 'POLICE');
    lab(-77, -54, 'CLINIC');
    lab(0, -66, 'SOL GAS');
    lab(70, -70, 'VILLAS');
    lab(-70, 0, 'SHOPS');
    lab(-82, 16, "MACCA'S GARAGE");
    lab(0, 4, 'TOWN SQUARE');
    lab(75, 0, 'SOL MOTEL');
    lab(-63, 76, 'GATOR BAR');
    lab(0, 62, 'FLAMINGO');
    lab(70, 66, 'HOTELS');
    lab(30, 150, 'SOL PIER');
    lab(178, 140, 'LIGHTHOUSE');
    lab(0, -168, 'LEONIDA SIGN');
    for (const b of G.missions.blips()) {
      const [a, c] = pt(b.x, b.z);
      g.fillStyle = b.color;
      g.beginPath();
      g.arc(a, c, b.small ? 4 : 8, 0, Math.PI * 2);
      g.fill();
    }
    const P = G.player.car ? G.player.car.pos : G.player.pos;
    const [a, c] = pt(P.x, P.z);
    g.fillStyle = '#fff';
    g.strokeStyle = '#ff4fa6';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(a, c, 7, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    if (info) $('mapinfo').textContent = `Hidden flamingos: ${G.missions.flamingosFound.size}/10   ·   Story: ${G.missions.done}/${G.missions.missions.length}`;
  }

  // ------------------------------------------------------------------ messages
  hint(text) {
    if (this.G.touch?.on) text = touchText(text);
    this.hintEl.textContent = text;
    this.hintEl.style.opacity = 1;
    this.hintT = 0.15;
  }

  toast(text, secs = 4) {
    if (this.G.touch?.on) text = touchText(text);
    this.toastEl.textContent = text;
    this.toastEl.style.opacity = 1;
    this.toastT = secs;
  }

  objective(text) {
    if (this.G.touch?.on) text = touchText(text);
    this.obj.textContent = text;
    this.obj.style.opacity = text ? 1 : 0;
  }

  timer(t) {
    if (t == null) return (this.timerEl.style.display = 'none');
    this.timerEl.style.display = 'block';
    const s = Math.max(0, Math.ceil(t));
    this.timerEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.timerEl.classList.toggle('low', s <= 15);
  }

  targetHealth(f) {
    if (f == null) return (this.targetEl.style.display = 'none');
    this.targetEl.style.display = 'block';
    this.targetEl.querySelector('i').style.width = Math.max(0, f * 100) + '%';
  }

  big(title, sub = '', color = '#ffd84a', secs = 4) {
    this.bigEl.innerHTML = `<div style="color:${color}">${title}</div><small>${sub}</small>`;
    this.bigEl.classList.remove('show');
    void this.bigEl.offsetWidth;
    this.bigEl.classList.add('show');
    clearTimeout(this.bigTO);
    this.bigTO = setTimeout(() => this.bigEl.classList.remove('show'), secs * 1000);
  }

  flashDamage() {
    this.dmgEl.style.opacity = 0.8;
  }

  shake(k) {
    this.shakeAmt = Math.max(this.shakeAmt, k);
  }

  starsUp() {
    this.stars.classList.remove('pulse');
    void this.stars.offsetWidth;
    this.stars.classList.add('pulse');
  }

  // letterboxed dialogue; lines: [[speaker, text], ...]
  dialogue(title, lines, done) {
    const box = $('cutscene'), who = $('cs-who'), txt = $('cs-text');
    $('cs-title').textContent = title;
    box.classList.add('show');
    let i = 0, typing = null;
    const show = () => {
      if (i >= lines.length) {
        box.classList.remove('show');
        removeEventListener('keydown', next);
        box.removeEventListener('click', next);
        return done();
      }
      const [w, t] = lines[i];
      who.textContent = w;
      who.className = w === 'MACCA' ? 'macca' : 'flo';
      txt.textContent = '';
      let k = 0;
      clearInterval(typing);
      typing = setInterval(() => {
        txt.textContent = t.slice(0, ++k);
        if (k >= t.length) clearInterval(typing);
        if (k % 3 === 0) this.G.audio?.blip(w === 'MACCA' ? 140 : 320);
      }, 22);
    };
    const next = (e) => {
      if (e.type === 'keydown' && !['Space', 'Enter', 'KeyE'].includes(e.code)) return;
      e.preventDefault?.();
      i++;
      show();
    };
    setTimeout(() => {
      addEventListener('keydown', next);
      box.addEventListener('click', next);
    }, 300);
    show();
  }
}
