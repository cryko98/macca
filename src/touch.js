// Touch controls for phones and tablets: a floating joystick (left thumb), drag-to-look and pinch-to-zoom
// (right thumb), and context buttons that change on foot / in a car. Buttons press the same "keys" the
// keyboard does, so the rest of the game doesn't need to know where input comes from.
// Force it on a desktop with ?touch in the URL.
const $ = (id) => document.getElementById(id);

export const isTouch = () =>
  /[?&]touch\b/.test(location.search) || matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && 'ontouchstart' in window);

const FOOT = [
  ['KeyK', 'BITE', 'big a'],
  ['Space', 'JUMP', 'b'],
  ['KeyF', 'CAR', 'c', 'car'],
  ['KeyE', 'USE', 'd', 'use'],
  ['KeyX', 'DANCE', 'e'],
];
const CAR = [
  ['KeyW', 'GAS', 'big a'],
  ['KeyS', 'BRAKE', 'b'],
  ['Space', 'DRIFT', 'c'],
  ['ShiftLeft', 'NITRO', 'd'],
  ['KeyH', 'HORN', 'e'],
  ['KeyF', 'EXIT', 'f'],
];

// what the keyboard hints mean on a touch screen
export function touchText(s) {
  if (!s) return s;
  return s
    .replace(/Press ([?]) \(or Tab\)/g, 'Tap ?')
    .replace(/Press E to buy/g, 'Tap USE to buy')
    .replace(/[Pp]ress F to (jack|get in)/g, 'Tap CAR to $1')
    .replace(/press F\b/g, 'tap CAR')
    .replace(/Press F\b/g, 'Tap CAR')
    .replace(/\(X\)/g, '(DANCE)')
    .replace(/\(E\)/g, '(USE)')
    .replace(/ ?Key <kbd>P<\/kbd> cycles them\./g, '')
    .replace(/Shift swims faster/g, 'Push the stick all the way to swim faster')
    .replace(/Press P to change/g, 'Change it in the ? help');
}

export class Touch {
  constructor(G) {
    this.G = G;
    this.on = isTouch();
    if (!this.on) return;
    document.body.classList.add('touch');
    const input = G.input;
    input.analog = { x: 0, y: 0, active: false };
    this.root = $('touch');
    this.stick = $('tc-stick');
    this.knob = $('tc-knob');
    this.build('tc-foot', FOOT);
    this.build('tc-car', CAR);
    this.carBtn = this.root.querySelector('[data-role=car]');
    this.useBtn = this.root.querySelector('[data-role=use]');
    // top row
    this.root.querySelector('[data-act=map]').onpointerdown = (e) => (e.preventDefault(), G.hud.toggleMap());
    this.root.querySelector('[data-act=radio]').onpointerdown = (e) => {
      e.preventDefault();
      G.audio.radioOn = !G.audio.radioOn;
      G.hud.toast(G.audio.radioOn ? 'Radio: GATOR FM' : 'Radio off', 2);
    };
    this.root.querySelector('[data-act=pause]').onpointerdown = (e) => {
      e.preventDefault();
      G.state = 'paused';
      $('pause').style.display = 'flex';
    };

    // the play area: left half = joystick, right half = look; two fingers on the right = pinch zoom
    const zone = $('tc-zone');
    this.stickId = null;
    this.look = new Map();
    this.pinch = 0;
    const R = 62;
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        zone.setPointerCapture(e.pointerId);
      } catch {}
      if (e.clientX < innerWidth * 0.45 && this.stickId === null) {
        this.stickId = e.pointerId;
        this.origin = { x: e.clientX, y: e.clientY };
        this.stick.style.left = e.clientX + 'px';
        this.stick.style.top = e.clientY + 'px';
        this.stick.classList.add('on');
        this.knob.style.transform = 'translate(-50%, -50%)';
        input.analog.active = true;
        input.analog.x = input.analog.y = 0;
      } else {
        this.look.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.look.size === 2) this.pinch = this.pinchDist();
      }
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickId) {
        let dx = e.clientX - this.origin.x, dy = e.clientY - this.origin.y;
        const d = Math.hypot(dx, dy);
        if (d > R) (dx *= R / d), (dy *= R / d);
        this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        input.analog.x = dx / R;
        input.analog.y = -dy / R;
        this.stick.classList.toggle('run', Math.hypot(dx, dy) / R > 0.88);
        return;
      }
      const p = this.look.get(e.pointerId);
      if (!p) return;
      if (this.look.size >= 2) {
        p.x = e.clientX;
        p.y = e.clientY;
        const d = this.pinchDist();
        if (Math.abs(d - this.pinch) > 24) {
          input.wheel += d < this.pinch ? 1 : -1;
          this.pinch = d;
        }
        return;
      }
      input.dx += (e.clientX - p.x) * 1.7;
      input.dy += (e.clientY - p.y) * 1.7;
      p.x = e.clientX;
      p.y = e.clientY;
    });
    const end = (e) => {
      if (e.pointerId === this.stickId) {
        this.stickId = null;
        this.stick.classList.remove('on', 'run');
        input.analog.active = false;
        input.analog.x = input.analog.y = 0;
      }
      this.look.delete(e.pointerId);
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    // no page scrolling, zooming or long-press menus while playing
    for (const ev of ['touchstart', 'touchmove', 'gesturestart', 'contextmenu'])
      this.root.addEventListener(ev, (e) => e.preventDefault(), { passive: false });

    // no keyboard talk on a phone
    $('help-close').textContent = 'Close ✕';
    // tapping the big map closes it
    $('bigmap').addEventListener('click', () => G.hud.toggleMap());
    // rotate-your-phone prompt (can be dismissed)
    $('rotate-anyway').onclick = () => document.body.classList.add('portrait-ok');
  }

  pinchDist() {
    const [a, b] = [...this.look.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  build(id, list) {
    const box = $(id), input = this.G.input;
    for (const [code, label, cls, role] of list) {
      const b = document.createElement('button');
      b.className = 'tc-btn ' + cls;
      b.textContent = label;
      if (role) b.dataset.role = role;
      b.dataset.code = code;
      const up = () => (input.keys.delete(code), b.classList.remove('down'));
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          b.setPointerCapture(e.pointerId);
        } catch {}
        if (!input.keys.has(code)) input.hit.add(code);
        input.keys.add(code);
        b.classList.add('down');
        navigator.vibrate?.(8);
      });
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      box.appendChild(b);
    }
  }

  // the first tap: full screen and landscape where the browser allows it
  enterFullscreen() {
    if (!this.on) return;
    const el = document.documentElement;
    const p = el.requestFullscreen?.({ navigationUI: 'hide' }) || el.webkitRequestFullscreen?.();
    Promise.resolve(p)
      .then(() => screen.orientation?.lock?.('landscape'))
      .catch(() => {});
  }

  update() {
    if (!this.on) return;
    const G = this.G, pl = G.player;
    const show = G.state === 'play' && !G.help?.open;
    this.root.classList.toggle('show', show);
    if (!show && this.G.input.analog.active) {
      this.G.input.analog.active = false;
      this.stickId = null;
      this.stick.classList.remove('on', 'run');
    }
    // switching between the on-foot and in-car buttons: let go of anything still held
    // (a hidden button never gets its finger-up, so GAS would otherwise stay pressed)
    const driving = !!pl.car;
    if (driving !== this.wasDriving || !show) {
      for (const b of this.root.querySelectorAll('.tc-btn.down')) {
        this.G.input.keys.delete(b.dataset.code);
        b.classList.remove('down');
      }
      this.wasDriving = driving;
    }
    this.root.classList.toggle('driving', driving);
    // light up the buttons that do something right now
    this.tick = (this.tick || 0) + 1;
    if (this.tick % 10 === 0 && !pl.car) {
      this.carBtn.classList.toggle('glow', !!pl.nearestCar());
      this.useBtn.classList.toggle('glow', !!G.refillSpot);
    }
  }
}
