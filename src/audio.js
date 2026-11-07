// All sound is synthesized: engine, siren, helicopter, effects and a synthwave car radio.
export class Audio {
  constructor() {
    this.ctx = null;
    this.radioOn = true;
  }

  init() {
    if (this.ctx) return;
    const C = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = C.createGain();
    this.master.gain.value = 0.7;
    const comp = C.createDynamicsCompressor();
    this.master.connect(comp).connect(C.destination);
    this.sfx = C.createGain();
    this.sfx.connect(this.master);
    this.music = C.createGain();
    this.music.gain.value = 0;
    this.music.connect(this.master);
    // noise buffer
    const len = C.sampleRate * 2;
    this.noiseBuf = C.createBuffer(1, len, C.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // engine
    this.eng = C.createOscillator();
    this.eng.type = 'sawtooth';
    this.eng2 = C.createOscillator();
    this.eng2.type = 'square';
    const ef = C.createBiquadFilter();
    ef.type = 'lowpass';
    ef.frequency.value = 700;
    this.engGain = C.createGain();
    this.engGain.gain.value = 0;
    this.eng.connect(ef);
    this.eng2.connect(ef);
    ef.connect(this.engGain).connect(this.sfx);
    this.eng.start();
    this.eng2.start();
    // siren
    this.sir = C.createOscillator();
    this.sir.type = 'triangle';
    this.sirGain = C.createGain();
    this.sirGain.gain.value = 0;
    this.sir.connect(this.sirGain).connect(this.sfx);
    this.sir.start();
    // helicopter: noise chopped by an LFO
    const hn = this.noise(true);
    const hf = C.createBiquadFilter();
    hf.type = 'lowpass';
    hf.frequency.value = 300;
    this.heliGain = C.createGain();
    this.heliGain.gain.value = 0;
    const chop = C.createGain();
    const lfo = C.createOscillator();
    lfo.frequency.value = 14;
    const lg = C.createGain();
    lg.gain.value = 0.5;
    lfo.connect(lg).connect(chop.gain);
    chop.gain.value = 0.5;
    hn.connect(hf).connect(chop).connect(this.heliGain).connect(this.sfx);
    lfo.start();
    hn.start();
    this.startRadio();
  }

  noise(loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = loop;
    return s;
  }

  env(node, t, a, peak, dur) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(g);
    return g;
  }

  tone(freq, dur, type = 'sine', vol = 0.2, when = 0, slide) {
    if (!this.ctx) return;
    const C = this.ctx, t = C.currentTime + when;
    const o = C.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    this.env(o, t, 0.005, vol, dur).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  burst(dur, freq, vol = 0.4, type = 'lowpass', when = 0) {
    if (!this.ctx) return;
    const C = this.ctx, t = C.currentTime + when;
    const n = this.noise();
    const f = C.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    n.connect(f);
    this.env(f, t, 0.005, vol, dur).connect(this.sfx);
    n.start(t);
    n.stop(t + dur + 0.05);
  }

  crash(k) {
    this.burst(0.35, 900, 0.3 + k * 0.5);
    this.tone(80, 0.25, 'square', 0.15 * k);
  }
  boom() {
    this.burst(1.6, 300, 1);
    this.burst(0.4, 2000, 0.4);
    this.tone(50, 1, 'sine', 0.6, 0, 25);
  }
  chomp() {
    this.burst(0.08, 2500, 0.3, 'bandpass');
    this.tone(220, 0.12, 'square', 0.12, 0.08, 90);
  }
  coin() {
    this.tone(988, 0.08, 'square', 0.1);
    this.tone(1319, 0.25, 'square', 0.1, 0.08);
  }
  checkpoint() {
    this.tone(660, 0.1, 'triangle', 0.25);
    this.tone(990, 0.2, 'triangle', 0.25, 0.1);
  }
  passed() {
    [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, 0.25, 'square', 0.12, i * 0.12));
  }
  failed() {
    [392, 330, 262].forEach((f, i) => this.tone(f, 0.35, 'sawtooth', 0.12, i * 0.2));
  }
  horn(pos, mine) {
    if (!this.ctx || (!mine && this.listener && Math.hypot(pos.x - this.listener.x, pos.z - this.listener.z) > 40)) return;
    const v = mine ? 0.14 : 0.06;
    this.tone(415, 0.45, 'square', v);
    this.tone(523, 0.45, 'square', v * 0.8);
  }
  oof() {
    this.tone(180 + Math.random() * 80, 0.18, 'sawtooth', 0.08, 0, 110);
  }
  door() {
    this.burst(0.05, 1500, 0.2, 'bandpass');
    this.burst(0.06, 600, 0.25, 'lowpass', 0.12);
  }
  splash(k = 1) {
    this.burst(0.5 * k + 0.2, 1400, 0.35 * k + 0.1, 'lowpass');
    this.burst(0.25, 4000, 0.12 * k, 'highpass', 0.05);
  }
  bark(pos) {
    if (!this.ctx || (this.listener && pos && pos.distanceTo(this.listener) > 30)) return;
    for (let i = 0; i < 2; i++) {
      this.tone(480 + Math.random() * 120, 0.09, 'square', 0.06, i * 0.16, 260);
      this.burst(0.07, 900, 0.08, 'bandpass', i * 0.16);
    }
  }
  squawk() {
    this.tone(1500 + Math.random() * 300, 0.18, 'sawtooth', 0.025, 0, 900);
    this.tone(1300 + Math.random() * 300, 0.15, 'sawtooth', 0.02, 0.2, 800);
  }
  jump() {
    this.tone(200, 0.25, 'sine', 0.12, 0, 500);
  }
  slurp() {
    for (let i = 0; i < 4; i++) this.burst(0.12, 1200 + i * 200, 0.12, 'bandpass', i * 0.18);
  }
  firework() {
    this.burst(0.12, 3000, 0.3, 'highpass');
    this.burst(0.8, 400, 0.5, 'lowpass', 0.05);
    for (let i = 0; i < 6; i++) this.burst(0.03, 5000, 0.12, 'highpass', 0.3 + Math.random() * 0.6);
  }
  blip(f) {
    this.tone(f + Math.random() * 40, 0.04, 'square', 0.03);
  }
  sirenBlip() {
    this.tone(700, 0.15, 'square', 0.08);
    this.tone(1000, 0.15, 'square', 0.08, 0.15);
  }

  heli(pos) {
    this.heliPos = pos;
  }

  // continuous sounds, every frame
  update(G) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const pl = G.player, P = pl.car ? pl.car.pos : pl.pos;
    this.listener = P;
    if (pl.car && !pl.car.dead) {
      const sp = Math.abs(pl.car.speed);
      const gear = sp / 9;
      const rpm = 55 + (gear % 1) * 90 + Math.floor(gear) * 12 + (pl.car.input.throttle > 0 ? 25 : 0);
      this.eng.frequency.setTargetAtTime(rpm, t, 0.05);
      this.eng2.frequency.setTargetAtTime(rpm * 0.5, t, 0.05);
      this.engGain.gain.setTargetAtTime(0.09 + Math.min(0.08, sp * 0.003), t, 0.1);
    } else this.engGain.gain.setTargetAtTime(0, t, 0.1);
    // siren from the nearest police car
    let nd = Infinity;
    for (const c of G.police.cars) if (c.siren && !c.dead) nd = Math.min(nd, c.pos.distanceTo(P));
    if (pl.car?.siren) nd = 0;
    const sv = nd < 120 ? 0.06 * (1 - nd / 120) : 0;
    this.sirGain.gain.setTargetAtTime(sv, t, 0.1);
    this.sir.frequency.setTargetAtTime(700 + 350 * Math.sin(t * 5), t, 0.02);
    const hv = this.heliPos ? Math.max(0, 0.35 * (1 - this.heliPos.distanceTo(P) / 160)) : 0;
    this.heliGain.gain.setTargetAtTime(hv, t, 0.2);
    // radio: loud in a car, soft on foot near the bar / at the party
    const nearParty = G.partyTime || Math.hypot(P.x - G.world.places.bar.x, P.z - G.world.places.bar.z) < 25;
    const mv = !this.radioOn ? 0 : pl.car ? 0.32 : G.state === 'title' ? 0.25 : nearParty ? 0.18 : 0;
    this.music.gain.setTargetAtTime(mv, t, 0.4);
  }

  // ------------------------------------------------------------------ synthwave radio
  startRadio() {
    const C = this.ctx;
    const bpm = 104, step = 60 / bpm / 4;
    let next = C.currentTime + 0.1, i = 0;
    const prog = [[45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59], [40, 47, 52, 55]]; // Am F G Em
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const out = this.music;
    const verb = C.createDelay();
    verb.delayTime.value = step * 3;
    const fb = C.createGain();
    fb.gain.value = 0.3;
    verb.connect(fb).connect(verb);
    const wet = C.createGain();
    wet.gain.value = 0.35;
    verb.connect(wet).connect(out);
    const voice = (f, t, dur, type, vol, cutoff, dest = out) => {
      const o = C.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const flt = C.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.setValueAtTime(cutoff, t);
      flt.frequency.exponentialRampToValueAtTime(cutoff * 0.3, t + dur);
      const g = C.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(flt).connect(g).connect(dest);
      g.connect(verb);
      o.start(t);
      o.stop(t + dur + 0.05);
    };
    const drum = (t, kind) => {
      if (kind === 'k') {
        const o = C.createOscillator();
        o.frequency.setValueAtTime(130, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
        const g = C.createGain();
        g.gain.setValueAtTime(0.9, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + 0.35);
      } else {
        const n = this.noise();
        const f = C.createBiquadFilter();
        f.type = kind === 's' ? 'bandpass' : 'highpass';
        f.frequency.value = kind === 's' ? 1800 : 8000;
        const g = C.createGain();
        const v = kind === 's' ? 0.5 : 0.12;
        g.gain.setValueAtTime(v, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 's' ? 0.2 : 0.05));
        n.connect(f).connect(g).connect(out);
        if (kind === 's') g.connect(verb);
        n.start(t);
        n.stop(t + 0.25);
      }
    };
    const tick = () => {
      while (next < C.currentTime + 0.25) {
        const bar = Math.floor(i / 16) % 4, s = i % 16, ch = prog[bar];
        if (s % 4 === 0) drum(next, 'k');
        if (s === 4 || s === 12) drum(next, 's');
        if (s % 2 === 1) drum(next, 'h');
        // bass: driving eighths on the root
        if (s % 2 === 0) voice(mtof(ch[0] - 12 + (s % 8 === 6 ? 12 : 0)), next, step * 1.8, 'sawtooth', 0.22, 900);
        // arpeggio
        voice(mtof(ch[[1, 2, 3, 2][s % 4]] + 12), next, step * 0.9, 'square', 0.05, 2600);
        // pad on each bar
        if (s === 0) for (const n of ch.slice(1)) voice(mtof(n), next, step * 15, 'sawtooth', 0.04, 1400);
        next += step;
        i++;
      }
    };
    this.radioTimer = setInterval(tick, 50);
  }
}
