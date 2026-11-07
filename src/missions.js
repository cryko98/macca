// Story missions for Macca, hidden flamingos, checkpoints, the party finale.
import * as THREE from 'three';
import { Car } from './vehicles.js';
import { radialGlow } from './textures.js';
import { PIER, terrainH } from './world.js';

const V = (x, z) => new THREE.Vector3(x, 0, z);

function beamMesh(color, r = 2.2, h = 30) {
  const g = new THREE.Group();
  const c = new THREE.Color(color);
  const tex = (() => {
    const cv = document.createElement('canvas');
    cv.width = 4;
    cv.height = 128;
    const x = cv.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(1, 'rgba(255,255,255,0.9)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 4, 128);
    const t = new THREE.CanvasTexture(cv);
    return t;
  })();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 32, 1, true), new THREE.MeshBasicMaterial({ map: tex, color: c.clone().multiplyScalar(0.55), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  beam.position.y = h / 2;
  const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.25, r, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(2), transparent: true, opacity: 0.9, toneMapped: false, side: THREE.DoubleSide }));
  ring.position.y = 0.06;
  g.add(beam, ring);
  return g;
}

export class Missions {
  constructor(G) {
    this.G = G;
    const save = G.save;
    this.done = save.done || 0; // missions finished
    this.flamingosFound = new Set(save.flamingos || []);
    this.active = null;
    this.markers = [];
    this.startMarker = beamMesh('#ffd84a', 1.6, 26);
    G.scene.add(this.startMarker);
    this.cp = beamMesh('#ff4fa6', 3.2, 40);
    this.cp.visible = false;
    G.scene.add(this.cp);
    this.pickups = [];
    this.buildFlamingos();
    this.missions = [this.happyHour(), this.pinkPearl(), this.hotWheels(), this.crocBros(), this.heatWave(), this.beachParty()];
  }

  get next() {
    return this.missions[this.done] || null;
  }

  // ------------------------------------------------------------------ the four story missions
  happyHour() {
    return {
      title: 'HAPPY HOUR',
      desc: 'Pick up limes (TIKI hut on the beach), ice (SOL GAS) and umbrellas (the 24/7 shop) and bring them back to the Gator Bar, all within 3:30. Any car will do.',
      intro: [
        ['FLO', "Macca! Today's the Leonida Beach Party and the bar is bone dry."],
        ['FLO', 'Get some wheels: limes at the TIKI hut, ice from SOL GAS, umbrellas at the 24/7.'],
        ['MACCA', 'Three stops, one gator. Easy.'],
        ['FLO', 'Three and a half minutes, sugar. Ice melts.'],
      ],
      reward: 500,
      start: (m) => {
        m.stops = [
          { p: V(-20, 99), label: 'Limes at the TIKI hut' },
          { p: V(0, -62), label: 'Ice at SOL GAS' },
          { p: V(-38.5, -1), label: 'Umbrellas at the 24/7' },
          { p: V(-63, 91.5), label: 'Back to the Gator Bar' },
        ];
        m.i = 0;
        m.time = 210;
        this.setCheckpoint(m.stops[0].p);
        this.G.hud.objective(`Get a car. ${m.stops[0].label}.`);
      },
      update: (m, dt) => {
        m.time -= dt;
        this.G.hud.timer(m.time);
        if (m.time <= 0) return this.fail('Out of time. The ice melted!');
        const s = m.stops[m.i];
        if (this.inCheckpoint(s.p, 4.5)) {
          this.G.audio?.checkpoint();
          m.i++;
          if (m.i >= m.stops.length) return this.pass();
          this.G.hud.toast(['Limes: check.', 'Ice: check.', 'Umbrellas: check.'][m.i - 1] || 'Check.');
          this.setCheckpoint(m.stops[m.i].p);
          this.G.hud.objective(m.stops[m.i].label + '.');
        }
      },
    };
  }

  pinkPearl() {
    return {
      title: 'PINK PEARL',
      desc: "Steal the pink supercar parked at the Flamingo Hotel valet and deliver it to Macca's Garage. The valet calls the cops: expect 2 stars.",
      intro: [
        ['FLO', 'Every party needs a grand entrance.'],
        ['FLO', "Some tourist left a pink supercar with the Flamingo Hotel valet. It's practically yours."],
        ['MACCA', 'Pink is my colour.'],
        ['FLO', "Bring it to your garage in one piece. The valet WILL call the cops."],
      ],
      reward: 1000,
      start: (m) => {
        const v = this.G.world.places.valet;
        m.car = new Car(this.G, 'super', v.x, v.z, v.yaw, { color: '#ff4fa6', driver: false });
        m.car.keep = true;
        m.car.parked = true;
        this.G.traffic.add(m.car);
        m.stolen = false;
        this.setCheckpoint(m.car.pos, 'car');
        this.G.hud.objective('Steal the pink supercar at the Flamingo Hotel valet.');
      },
      update: (m) => {
        const G = this.G;
        if (m.car.dead) return this.fail('The pink supercar is a wreck.');
        if (!m.stolen) {
          this.cpFollow(m.car.pos);
          if (G.player.car === m.car) {
            m.stolen = true;
            G.police.crime('steal', m.car.pos);
            G.police.setStars(Math.max(2, G.police.stars));
            this.setCheckpoint(G.world.places.garage ? V(G.world.places.garage.x, G.world.places.garage.z) : V(-82, 29));
            G.hud.objective("Take it to MACCA'S GARAGE. Keep the paint shiny!");
          }
        } else {
          if (G.player.car !== m.car) G.hud.objective('Get back in the pink supercar.');
          else G.hud.objective("Take it to MACCA'S GARAGE. Keep the paint shiny!");
          if (G.player.car === m.car && this.inCheckpoint(this.cpPos, 4)) {
            G.police.clear();
            G.player.exitCar();
            m.car.keep = true;
            m.car.parked = true;
            return this.pass(`Damage: ${Math.round(100 - (m.car.health / m.car.spec.health) * 100)}%`);
          }
        }
      },
      cleanup: (m, ok) => {
        if (!ok && m.car && !m.car.dead && this.G.player.car !== m.car) {
          m.car.keep = false;
          m.car.parked = false;
        }
      },
    };
  }

  crocBros() {
    return {
      title: 'CROC BROTHERS',
      desc: "Find the Croc Brothers' green van (red marker on the map) and ram it until it burns, within 2:30.",
      intro: [
        ['FLO', "The Croc Brothers are driving round town tearing down our party posters."],
        ['MACCA', 'Crocodiles. In MY town.'],
        ['FLO', "Green van. Ram it 'til it burns. You've got two and a half minutes."],
      ],
      reward: 1500,
      noHeat: false,
      start: (m) => {
        const G = this.G;
        const car = G.traffic.spawnTraffic(G.player.pos);
        if (!car) return this.fail('The Croc Brothers chickened out.');
        // swap it for a green van with a croc at the wheel
        car.remove();
        G.traffic.cars.splice(G.traffic.cars.indexOf(car), 1);
        const van = new Car(G, 'van', car.pos.x, car.pos.z, car.yaw, { color: '#2e8b3a' });
        van.ai = { ...car.ai, cruise: 15 };
        van.spec.max = 34;
        van.spec.health = van.health = 1500;
        van.keep = true;
        G.traffic.add(van);
        m.van = van;
        m.time = 150;
        this.setCheckpoint(van.pos, 'target');
        G.hud.objective('Wreck the Croc Brothers\' green van.');
      },
      update: (m, dt) => {
        const G = this.G, van = m.van;
        m.time -= dt;
        G.hud.timer(m.time);
        this.cpFollow(van.pos);
        if (!van.dead) {
          // they speed up and run lights once they spot Macca
          const d = van.pos.distanceTo(G.player.pos);
          van.ai.cruise = d < 40 ? 22 : 15;
          G.hud.targetHealth(van.health / van.spec.health);
        }
        if (van.dead) {
          G.hud.targetHealth(null);
          van.keep = false;
          return this.pass('Croc van: toast.');
        }
        if (m.time <= 0) {
          G.hud.targetHealth(null);
          van.keep = false;
          return this.fail('The Croc Brothers got away.');
        }
      },
      cleanup: (m) => {
        this.G.hud.targetHealth(null);
        if (m.van) m.van.keep = false;
      },
    };
  }

  hotWheels() {
    return {
      title: 'HOT WHEELS',
      desc: 'A street race round the whole of Leonida: 8 checkpoints in 2 minutes. You need a car; the clock starts when you are in one.',
      intro: [
        ['FLO', 'The Leonida street racers want a gator on the start line.'],
        ['MACCA', 'I drive like I swim. Fast and a little sideways.'],
        ['FLO', 'Eight checkpoints round town, two minutes. Grab something quick, the supercars are fastest.'],
      ],
      reward: 1200,
      start: (m) => {
        m.stops = [V(-105, 60), V(-105, -20), V(-70, -105), V(0, -105), V(70, -105), V(105, -35), V(70, 35), V(-20, 95)];
        m.i = 0;
        m.time = 120;
        m.go = false;
        this.setCheckpoint(m.stops[0]);
        this.G.hud.objective('Get a car. The race starts when you are behind the wheel.');
      },
      update: (m, dt) => {
        const G = this.G;
        if (!G.player.car && !m.go) return G.hud.objective('Get a car. The race starts when you are behind the wheel.');
        m.go = true;
        m.time -= dt;
        G.hud.timer(m.time);
        if (m.time <= 0) return this.fail('Too slow, gator.');
        if (G.player.car && this.inCheckpoint(m.stops[m.i], 7, true)) {
          G.audio?.checkpoint();
          m.i++;
          if (m.i >= m.stops.length) return this.pass(`${Math.ceil(m.time)} s to spare`);
          this.setCheckpoint(m.stops[m.i]);
        }
        G.hud.objective(G.player.car ? `Race: checkpoint ${m.i + 1}/${m.stops.length}` : 'Get back in a car!');
      },
    };
  }

  heatWave() {
    return {
      title: 'HEAT WAVE',
      desc: "Flo's cousin is sneaking the party fireworks past the police station. You start with 3 wanted stars: shake the cops off within 3 minutes without getting busted.",
      intro: [
        ['FLO', 'My cousin Rico has a van full of party fireworks, and the police station is on his way.'],
        ['FLO', 'I need every cop in Leonida looking at you. I already called it in.'],
        ['MACCA', "Three stars? I've had worse Tuesdays."],
        ['FLO', "Lose them inside three minutes. And don't get busted, sugar."],
      ],
      reward: 2000,
      start: (m) => {
        m.time = 180;
        m.t = 0;
        this.cp.visible = false;
        this.G.police.setStars(3);
        this.G.hud.objective('Lose the cops! Stay out of their sight until the stars go out.');
      },
      update: (m, dt) => {
        const G = this.G;
        m.t += dt;
        m.time -= dt;
        G.hud.timer(m.time);
        if (m.t > 3 && G.police.stars === 0) return this.pass('The fireworks got through.');
        if (m.time <= 0) return this.fail('The cops are still on your tail.');
      },
    };
  }

  beachParty() {
    return {
      title: 'BEACH PARTY',
      desc: 'The finale. On foot, collect 8 cocktail glasses on the beach in 90 seconds, then dance (X) at the end of the pier for the fireworks.',
      intro: [
        ['FLO', "Party's on! The whole town's on the beach and the DJ dropped every cocktail in the sand."],
        ['MACCA', 'On foot. Eight glasses. Ninety seconds.'],
        ['FLO', 'Then up to the end of the pier and show them how a gator dances.'],
      ],
      reward: 2500,
      night: true,
      start: (m) => {
        const G = this.G;
        if (G.player.car) G.player.exitCar();
        G.player.spawn(-20, 106, Math.PI);
        m.glasses = [];
        const spots = [[-100, 112], [-75, 118], [-40, 110], [-5, 121], [15, 112], [55, 118], [85, 111], [110, 120]];
        for (const [x, z] of spots) m.glasses.push(this.addPickup(x, terrainH(x, z) + 0.9, z, '#3fe0ff'));
        m.time = 90;
        m.phase = 'collect';
        this.cp.visible = false;
        G.hud.objective('Collect the 8 cocktail glasses on the beach (on foot).');
      },
      update: (m, dt) => {
        const G = this.G;
        if (m.phase === 'collect') {
          m.time -= dt;
          G.hud.timer(m.time);
          const left = m.glasses.filter((p) => !p.taken).length;
          G.hud.objective(`Collect the cocktail glasses on the beach: ${8 - left}/8`);
          if (m.time <= 0) return this.fail('The party ran dry.');
          if (!left) {
            m.phase = 'pier';
            G.hud.timer(null);
            this.setCheckpoint(V(PIER.end.x0 + 16, PIER.end.z0 + 6));
            G.hud.objective('Get to the end of the pier and dance (X)!');
          }
        } else if (m.phase === 'pier') {
          if (this.inCheckpoint(this.cpPos, 5) && G.player.dancing) {
            m.phase = 'show';
            m.t = 0;
            G.partyTime = true;
            this.cp.visible = false;
            G.hud.objective('Keep dancing!');
          }
        } else if (m.phase === 'show') {
          m.t += dt;
          if (Math.random() < dt * 3) G.fx.firework(new THREE.Vector3(30 + (Math.random() - 0.5) * 120, 40 + Math.random() * 30, 230 + Math.random() * 60)), G.audio?.firework();
          if (m.t > 7) return this.pass('LEONIDA IS YOURS!');
        }
      },
      cleanup: (m) => {
        for (const p of m.glasses || []) this.removePickup(p);
        this.G.hud.timer(null);
      },
    };
  }

  // ------------------------------------------------------------------ flow
  start() {
    const G = this.G, def = this.next;
    if (!def) return;
    this.active = { def, t: 0 };
    G.police.clear();
    this.startMarker.visible = false;
    G.cutscene(def.title, def.intro, () => {
      def.start(this.active);
    });
  }

  pass(extra = '') {
    const G = this.G, a = this.active;
    a.def.cleanup?.(a, true);
    this.active = null;
    this.cp.visible = false;
    G.hud.timer(null);
    G.hud.objective('');
    this.done++;
    G.addMoney(a.def.reward);
    G.audio?.passed();
    G.hud.big('MISSION PASSED', `$${a.def.reward}${extra ? ' · ' + extra : ''}`, '#ffd84a');
    G.persist();
    if (this.done >= this.missions.length)
      setTimeout(() => G.hud.toast('You finished the story! Keep exploring: hidden flamingos, stunts, and the cops still want you.', 8), 4000);
  }

  fail(reason) {
    const G = this.G, a = this.active;
    if (!a) return;
    a.def.cleanup?.(a, false);
    this.active = null;
    this.cp.visible = false;
    G.hud.timer(null);
    G.hud.objective('');
    G.partyTime = false;
    G.hud.big('MISSION FAILED', reason, '#ff4f4f');
  }

  setCheckpoint(p, kind) {
    this.cpPos = p.clone();
    this.cp.visible = true;
    this.cp.position.set(p.x, this.G.world.groundY(p.x, p.z), p.z);
    this.cpKind = kind;
  }

  cpFollow(p) {
    this.cpPos.copy(p);
    this.cp.position.set(p.x, p.y + 2.5, p.z);
  }

  inCheckpoint(p, r, anySpeed = false) {
    const pl = this.G.player;
    const at = pl.car ? pl.car.pos : pl.pos;
    return Math.hypot(at.x - p.x, at.z - p.z) < r && (!pl.car || anySpeed || pl.car.vel.length() < 14);
  }

  // ------------------------------------------------------------------ pickups + flamingos
  addPickup(x, y, z, color) {
    const g = new THREE.Group();
    const glassM = new THREE.MeshStandardMaterial({ color: '#dff6ff', transparent: true, opacity: 0.5, roughness: 0.05, emissive: color, emissiveIntensity: 0.6 });
    const bowl = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.32, 16, 1, true).rotateX(Math.PI), glassM);
    bowl.position.y = 0.32;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3), glassM);
    stem.position.y = 0.05;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialGlow(color), color: new THREE.Color(color).multiplyScalar(2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    glow.scale.setScalar(1.6);
    glow.position.y = 0.2;
    g.add(bowl, stem, glow);
    g.position.set(x, y, z);
    this.G.scene.add(g);
    const p = { g, taken: false, color, pos: new THREE.Vector3(x, y, z) };
    this.pickups.push(p);
    return p;
  }

  removePickup(p) {
    this.G.scene.remove(p.g);
    const i = this.pickups.indexOf(p);
    if (i >= 0) this.pickups.splice(i, 1);
  }

  buildFlamingos() {
    // 10 hidden pink flamingo lawn statues
    this.flamingoSpots = [[-110, -110], [88, -54], [-88, 8], [30, 200], [178, 140], [-14, -16.5], [100, 22], [-118, 120], [0, -176], [60, 86]];
    this.flamingos = [];
    const pink = new THREE.MeshStandardMaterial({ color: '#ff5fae', roughness: 0.4, emissive: '#ff2f8e', emissiveIntensity: 0.25 });
    const dark = new THREE.MeshStandardMaterial({ color: '#222' });
    this.flamingoSpots.forEach(([x, z], i) => {
      if (this.flamingosFound.has(i)) return;
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), pink);
      body.scale.set(1, 0.8, 1.5);
      body.position.y = 1.0;
      const neck = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.05, 6, 12, Math.PI * 1.2), pink);
      neck.position.set(0, 1.35, 0.3);
      neck.rotation.y = Math.PI / 2;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), pink);
      head.position.set(0, 1.55, 0.45);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 6).rotateX(Math.PI / 1.4), dark);
      beak.position.set(0, 1.5, 0.55);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8), pink);
      leg.position.y = 0.4;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialGlow('#ff4fa6'), color: new THREE.Color(2, 0.6, 1.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      glow.scale.setScalar(2.4);
      glow.position.y = 1;
      g.add(body, neck, head, beak, leg, glow);
      const y = this.G.world.groundY(x, z);
      g.position.set(x, y, z);
      this.G.scene.add(g);
      this.flamingos.push({ g, i, x, z });
    });
  }

  update(dt) {
    const G = this.G, pl = G.player;
    const t = performance.now() / 1000;
    // start marker at the bar door
    const bar = G.world.places.bar;
    this.startMarker.visible = !this.active && !!this.next && G.state === 'play';
    if (this.startMarker.visible) {
      this.startMarker.position.set(bar.x, G.world.groundY(bar.x, bar.z), bar.z);
      if (!pl.car && Math.hypot(pl.pos.x - bar.x, pl.pos.z - bar.z) < 1.8 && G.police.stars === 0) this.start();
      else if (!pl.car && Math.hypot(pl.pos.x - bar.x, pl.pos.z - bar.z) < 1.8) G.hud.hint('Lose the cops before you start a mission.');
    }
    this.cp.children[0].material.opacity = 0.5 + 0.2 * Math.sin(t * 4);
    if (this.active?.def.update && G.state === 'play') this.active.def.update(this.active, dt);
    // pickups spin
    for (const p of this.pickups) {
      if (p.taken) continue;
      p.g.rotation.y += dt * 2;
      p.g.position.y = p.pos.y + Math.sin(t * 3 + p.pos.x) * 0.15;
      if (!pl.car && pl.pos.distanceTo(p.pos) < 1.8) {
        p.taken = true;
        G.audio?.coin();
        for (let k = 0; k < 10; k++) G.fx.sparkle(p.pos, new THREE.Color(p.color).multiplyScalar(3));
        this.removePickup(p);
      }
    }
    for (let k = this.flamingos.length - 1; k >= 0; k--) {
      const f = this.flamingos[k];
      f.g.rotation.y += dt;
      const at = pl.car ? pl.car.pos : pl.pos;
      if (Math.hypot(at.x - f.x, at.z - f.z) < 2) {
        G.scene.remove(f.g);
        this.flamingos.splice(k, 1);
        this.flamingosFound.add(f.i);
        const n = this.flamingosFound.size;
        G.addMoney(100);
        G.audio?.coin();
        if (n === 10) {
          G.addMoney(1000);
          G.hud.big('ALL FLAMINGOS FOUND', '$1000 bonus', '#ff4fa6');
        } else G.hud.toast(`Hidden flamingo ${n}/10  +$100`);
        G.persist();
      }
    }
    // cocktail refills at the bar door and the tiki hut
    G.refillSpot = false;
    for (const [x, z] of [[bar.x + 3, bar.z], [-20, 112]]) {
      if (!pl.car && Math.hypot(pl.pos.x - x, pl.pos.z - z) < 3 && pl.drinks < 3) {
        G.refillSpot = true;
        G.hud.hint('Press E to buy 3 cocktails ($20)');
        if (G.input.pressed('KeyE') && G.money >= 20) {
          G.addMoney(-20);
          pl.drinks = 3;
          G.audio?.coin();
          G.input.consume('KeyE');
        }
      }
    }
  }

  blips() {
    const out = [];
    if (this.startMarker.visible) out.push({ x: this.G.world.places.bar.x, z: this.G.world.places.bar.z, color: '#ffd84a', label: 'G' });
    if (this.cp.visible) out.push({ x: this.cpPos.x, z: this.cpPos.z, color: this.cpKind === 'target' ? '#ff4f4f' : '#ff4fa6', gps: true });
    for (const p of this.pickups) if (!p.taken) out.push({ x: p.pos.x, z: p.pos.z, color: p.color, small: true });
    return out;
  }
}
