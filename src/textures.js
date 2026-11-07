// Procedural canvas textures: facades, roads, sidewalks, neon signs, stripes.
import * as THREE from 'three';

const cache = new Map();
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);

// deterministic PRNG for repeatable layouts
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

let MAX_ANISO = 8;
export function setMaxAnisotropy(n) {
  MAX_ANISO = n;
}

// logical size w x h, drawn at `scale` x resolution (HD) with the best anisotropic filtering
export function canvasTexture(key, w, h, draw, { repeat = true, srgb = true, scale = 2 } = {}) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const g = c.getContext('2d');
  g.scale(scale, scale);
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAX_ANISO;
  cache.set(key, t);
  return t;
}

function noise(g, w, h, alpha, n = 4000, light = false) {
  for (let i = 0; i < n; i++) {
    const v = Math.random();
    g.fillStyle = light ? `rgba(255,255,255,${alpha * v})` : `rgba(0,0,0,${alpha * v})`;
    g.fillRect(Math.random() * w, Math.random() * h, 0.5 + Math.random() * 1.5, 0.5 + Math.random() * 1.5);
  }
}

const shade = (hex, k) => {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, k);
  return '#' + c.getHexString();
};

// A 2 bay x 2 floor facade tile (6.4 m x 6.8 m), drawn in HD with frames, sills, mullions and curtains.
// style: 'deco' | 'plain' | 'motel' | 'house' | 'office'
export function facade(style, color, seed = 1) {
  const key = `facade-${style}-${color}-${seed}`;
  if (cache.has(key)) return cache.get(key);
  const R = rng(seed * 7919 + style.length);
  const W = 256, H = 256, bw = W / 2, fh = H / 2;
  const curtains = ['#f4e1c1', '#e8eef2', '#f7c6d9', '#c9e7e3', '#fff3c9', '#d9d2f2'];
  const glass = (g, x, y, w, h) => {
    const gr = g.createLinearGradient(x, y, x + w * 0.6, y + h);
    gr.addColorStop(0, '#24496a');
    gr.addColorStop(0.45, '#6f9fc4');
    gr.addColorStop(0.55, '#3d6b91');
    gr.addColorStop(1, '#16304a');
    g.fillStyle = gr;
    g.fillRect(x, y, w, h);
    if (R() < 0.6) {
      // curtains behind the glass
      g.fillStyle = curtains[Math.floor(R() * curtains.length)];
      g.globalAlpha = 0.55;
      const cw = w * (0.2 + R() * 0.25);
      g.fillRect(x, y, cw, h);
      g.fillRect(x + w - cw * (0.5 + R() * 0.5), y, cw, h);
      g.globalAlpha = 1;
    } else if (R() < 0.5) {
      // half-drawn blinds
      g.fillStyle = 'rgba(240,240,235,0.5)';
      for (let k = 0; k < h * 0.45; k += 3) g.fillRect(x, y + k, w, 1.4);
    }
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.beginPath();
    g.moveTo(x, y + h * 0.75);
    g.lineTo(x + w * 0.55, y);
    g.lineTo(x + w * 0.8, y);
    g.lineTo(x, y + h);
    g.fill();
  };
  // frame + mullions + sill with a soft shadow under it
  const windowAt = (g, x, y, w, h, frame = '#f7f4ee', mullion = true) => {
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(x - 2, y - 2, w + 4, h + 4);
    glass(g, x, y, w, h);
    g.strokeStyle = frame;
    g.lineWidth = 2.5;
    g.strokeRect(x, y, w, h);
    if (mullion) {
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(x + w / 2, y);
      g.lineTo(x + w / 2, y + h);
      g.moveTo(x, y + h * 0.32);
      g.lineTo(x + w, y + h * 0.32);
      g.stroke();
    }
    g.fillStyle = frame;
    g.fillRect(x - 4, y + h, w + 8, 3.5);
    const sh = g.createLinearGradient(0, y + h + 3.5, 0, y + h + 12);
    sh.addColorStop(0, 'rgba(0,0,0,0.22)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh;
    g.fillRect(x - 4, y + h + 3.5, w + 8, 9);
  };
  const map = canvasTexture(key, W, H, (g) => {
    g.fillStyle = color;
    g.fillRect(0, 0, W, H);
    // stucco: fine grain, soft blotches, a little grime towards each floor line
    noise(g, W, H, 0.05, 9000);
    noise(g, W, H, 0.05, 4000, true);
    for (let k = 0; k < 18; k++) {
      g.fillStyle = `rgba(0,0,0,${0.015 + R() * 0.02})`;
      g.beginPath();
      g.ellipse(R() * W, R() * H, 10 + R() * 30, 6 + R() * 20, R() * 3, 0, Math.PI * 2);
      g.fill();
    }
    for (let fy = 0; fy < 2; fy++) {
      const gr = g.createLinearGradient(0, fy * fh + fh - 26, 0, fy * fh + fh);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(1, 'rgba(0,0,0,0.08)');
      g.fillStyle = gr;
      g.fillRect(0, fy * fh + fh - 26, W, 26);
      for (let bx = 0; bx < 2; bx++) {
        const x = bx * bw, y = fy * fh;
        if (style === 'deco') {
          g.fillStyle = shade(color, -0.1);
          g.fillRect(x, y + fh - 9, bw, 9);
          g.fillStyle = '#ffffff';
          g.fillRect(x, y + fh - 15, bw, 6);
          g.fillStyle = 'rgba(0,0,0,0.18)';
          g.fillRect(x, y + fh - 9, bw, 2);
          windowAt(g, x + 26, y + 24, bw - 52, fh - 56);
          g.fillStyle = '#ffffff';
          g.fillRect(x + 20, y + 16, bw - 40, 5);
          g.fillStyle = 'rgba(0,0,0,0.2)';
          g.fillRect(x + 20, y + 21, bw - 40, 2);
          g.fillStyle = shade(color, 0.08);
          g.fillRect(x + 4, y, 6, fh - 15);
        } else if (style === 'motel') {
          if (bx === 0) {
            g.fillStyle = shade(color, -0.28);
            g.fillRect(x + 32, y + 30, 44, fh - 30);
            g.strokeStyle = '#ffffff';
            g.lineWidth = 2;
            g.strokeRect(x + 32, y + 30, 44, fh - 30);
            g.fillStyle = '#ffd25a';
            g.beginPath();
            g.arc(x + 68, y + 80, 2.5, 0, 7);
            g.fill();
            g.fillStyle = '#ffffff';
            g.font = 'bold 10px Inter, sans-serif';
            g.fillText(String(10 + Math.floor(R() * 89)), x + 47, y + 46);
          } else windowAt(g, x + 16, y + 36, bw - 32, 46, '#ffffff', false);
          g.fillStyle = 'rgba(0,0,0,0.1)';
          g.fillRect(x, y + fh - 4, bw, 4);
        } else if (style === 'office') {
          windowAt(g, x + 6, y + 10, bw - 12, fh - 26, '#cfd6dd');
          g.fillStyle = shade(color, 0.12);
          g.fillRect(x, y + fh - 12, bw, 12);
        } else if (style === 'house') {
          windowAt(g, x + 34, y + 30, bw - 68, fh - 62);
          for (const sx of [x + 18, x + bw - 32]) {
            g.fillStyle = shade(color, -0.2);
            g.fillRect(sx, y + 30, 14, fh - 62);
            g.fillStyle = 'rgba(0,0,0,0.18)';
            for (let k = 4; k < fh - 62; k += 5) g.fillRect(sx, y + 30 + k, 14, 1);
          }
          if (fy === 1 && R() < 0.6) {
            g.fillStyle = '#7a4a2a';
            g.fillRect(x + 30, y + fh - 30, bw - 60, 7);
            for (let k = 0; k < 9; k++) {
              g.fillStyle = ['#ff4fa6', '#ffd84a', '#ffffff', '#ff7a3c'][k % 4];
              g.beginPath();
              g.arc(x + 34 + k * ((bw - 68) / 8), y + fh - 32, 3, 0, 7);
              g.fill();
            }
          }
        } else {
          windowAt(g, x + 22, y + 24, bw - 44, fh - 52);
          if (R() < 0.35) {
            g.fillStyle = '#d9d9d4';
            g.fillRect(x + bw / 2 - 12, y + fh - 22, 24, 14);
            g.fillStyle = 'rgba(0,0,0,0.25)';
            for (let k = 0; k < 4; k++) g.fillRect(x + bw / 2 - 10, y + fh - 19 + k * 3, 20, 1);
          }
        }
      }
    }
  });
  const res = { map, em: null };
  cache.set(key, res);
  return res;
}

export function storefront(color, seed = 1) {
  const key = `store-${color}-${seed}`;
  const map = canvasTexture(key, 256, 128, (g, w, h) => {
    g.fillStyle = shade(color, -0.05);
    g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 20, 0, h);
    gr.addColorStop(0, '#355a7a');
    gr.addColorStop(1, '#0f1d2b');
    g.fillStyle = gr;
    g.fillRect(14, 22, 150, h - 22);
    g.fillRect(186, 30, 56, h - 30);
    g.strokeStyle = '#d9d9d9';
    g.lineWidth = 4;
    g.strokeRect(14, 22, 150, h - 22);
    g.strokeRect(186, 30, 56, h - 30);
    g.beginPath();
    g.moveTo(89, 22);
    g.lineTo(89, h);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,.15)';
    g.fillRect(20, 26, 30, h - 30);
  });
  const em = canvasTexture(key + '-em', 256, 128, (g, w, h) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd9a0';
    g.fillRect(14, 22, 150, h - 22);
    g.fillStyle = '#a07040';
    g.fillRect(186, 30, 56, h - 30);
  });
  return { map, em };
}

export function stripes(colors, key = colors.join('-'), vertical = true) {
  return canvasTexture('stripes-' + key + vertical, 128, 128, (g, w, h) => {
    const n = colors.length * 2;
    for (let i = 0; i < n; i++) {
      g.fillStyle = colors[i % colors.length];
      if (vertical) g.fillRect((i * w) / n, 0, w / n + 1, h);
      else g.fillRect(0, (i * h) / n, w, h / n + 1);
    }
  });
}

export function roadTexture() {
  return canvasTexture('road', 256, 512, (g, w, h) => {
    g.fillStyle = '#3a3b40';
    g.fillRect(0, 0, w, h);
    noise(g, w, h, 0.25, 9000);
    noise(g, w, h, 0.05, 3000, true);
    // tyre tracks
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (const x of [0.15, 0.33, 0.67, 0.85]) g.fillRect(x * w - 10, 0, 20, h);
    g.fillStyle = '#e8e4d8';
    g.fillRect(8, 0, 5, h);
    g.fillRect(w - 13, 0, 5, h);
    g.fillStyle = '#f2c230';
    g.fillRect(w / 2 - 8, 0, 5, h);
    g.fillRect(w / 2 + 3, 0, 5, h);
  });
}

export function asphaltTexture() {
  return canvasTexture('asphalt', 256, 256, (g, w, h) => {
    g.fillStyle = '#3a3b40';
    g.fillRect(0, 0, w, h);
    noise(g, w, h, 0.25, 9000);
    noise(g, w, h, 0.05, 3000, true);
  });
}

export function sidewalkTexture() {
  return canvasTexture('sidewalk', 256, 256, (g, w, h) => {
    g.fillStyle = '#b4ab9c';
    g.fillRect(0, 0, w, h);
    noise(g, w, h, 0.12, 5000);
    g.strokeStyle = 'rgba(80,70,60,0.35)';
    g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo((i * w) / 4, 0);
      g.lineTo((i * w) / 4, h);
      g.moveTo(0, (i * h) / 4);
      g.lineTo(w, (i * h) / 4);
      g.stroke();
    }
  });
}

export function plazaTexture() {
  return canvasTexture('plaza', 256, 256, (g, w, h) => {
    const cols = ['#d9b48f', '#c48e6a', '#e6c9a3', '#b8805e'];
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        g.fillStyle = cols[(x + y * 3 + ((x * y) % 3)) % 4];
        g.fillRect(x * 32, y * 32, 31, 31);
      }
    noise(g, w, h, 0.08, 3000);
  });
}

export function grassTexture() {
  return canvasTexture('grass', 256, 256, (g, w, h) => {
    g.fillStyle = '#5f9a3e';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const v = Math.random();
      g.fillStyle = v < 0.5 ? `rgba(40,90,30,${0.4 * Math.random()})` : `rgba(160,200,90,${0.35 * Math.random()})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1, 2 + Math.random() * 3);
    }
  });
}

export function sandTexture() {
  return canvasTexture('sand', 256, 256, (g, w, h) => {
    g.fillStyle = '#ecd9ad';
    g.fillRect(0, 0, w, h);
    noise(g, w, h, 0.12, 9000);
    noise(g, w, h, 0.1, 3000, true);
  });
}

export function woodTexture() {
  return canvasTexture('wood', 128, 256, (g, w, h) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#8a6040' : '#9b6f4b';
      g.fillRect((i * w) / 8, 0, w / 8, h);
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.fillRect((i * w) / 8, 0, 1, h);
    }
    noise(g, w, h, 0.15, 2000);
  });
}

// Water normal map (tileable value-noise bumps)
export function waterNormals() {
  return canvasTexture('water-n', 256, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    const hgt = new Float32Array(w * h);
    const waves = [];
    for (let i = 0; i < 24; i++) waves.push([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6) * (Math.random() < 0.5 ? -1 : 1), Math.random() * 6.28, 0.3 + Math.random()]);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let v = 0;
        for (const [a, b, p, amp] of waves) v += amp * Math.sin(((a * x + b * y) / w) * 6.2832 + p) / (a + Math.abs(b));
        hgt[y * w + x] = v;
      }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const dx = hgt[y * w + ((x + 1) % w)] - hgt[y * w + ((x - 1 + w) % w)];
        const dy = hgt[((y + 1) % h) * w + x] - hgt[((y - 1 + h) % h) * w + x];
        const n = new THREE.Vector3(-dx * 3, -dy * 3, 1).normalize();
        const i = (y * w + x) * 4;
        img.data[i] = (n.x * 0.5 + 0.5) * 255;
        img.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
        img.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
        img.data[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
  }, { srgb: false, scale: 1 });
}

// Neon text sign: returns { tex, aspect }
export function neonSign(text, color = '#ff4fa6', { font = '700 120px "Monoton", "Bungee", sans-serif', bg = null, border = true } = {}) {
  const key = `neon-${text}-${color}-${font}-${bg}`;
  if (cache.has(key)) return cache.get(key);
  const m = document.createElement('canvas').getContext('2d');
  m.font = font;
  const tw = Math.ceil(m.measureText(text).width);
  const W = Math.min(2048, tw + 120), H = 220;
  const tex = canvasTexture(key, W, H, (g) => {
    if (bg) {
      g.fillStyle = bg;
      g.beginPath();
      g.roundRect(6, 6, W - 12, H - 12, 30);
      g.fill();
    }
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = color;
    for (const [blur, a] of [[40, 0.9], [18, 1], [6, 1]]) {
      g.shadowBlur = blur;
      g.fillStyle = color;
      g.globalAlpha = a;
      g.fillText(text, W / 2, H / 2 + 6);
    }
    g.globalAlpha = 1;
    g.shadowBlur = 0;
    g.fillStyle = '#fff6fb';
    g.fillText(text, W / 2, H / 2 + 6);
    if (border) {
      g.shadowBlur = 20;
      g.strokeStyle = color;
      g.lineWidth = 8;
      g.beginPath();
      g.roundRect(14, 14, W - 28, H - 28, 26);
      g.stroke();
    }
  }, { repeat: false, scale: 1.5 });
  const res = { tex, aspect: W / H };
  cache.set(key, res);
  return res;
}

export function lighthouseTexture() {
  return canvasTexture('lighthouse', 64, 256, (g, w, h) => {
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i % 2 ? '#f4f1ea' : '#d9363e';
      g.fillRect(0, (i * h) / 6, w, h / 6 + 1);
    }
    noise(g, w, h, 0.1, 800);
  });
}

export function letterTexture(ch) {
  return canvasTexture('letter-' + ch, 128, 160, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.font = '900 170px "Anton", Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffffff';
    g.fillText(ch, w / 2, h / 2 + 8);
  }, { repeat: false });
}

export function radialGlow(color = '#ffffff') {
  return canvasTexture('glow-' + color, 64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, color);
    gr.addColorStop(0.3, color + 'aa');
    gr.addColorStop(1, color + '00');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  }, { repeat: false });
}

export function smokeTexture() {
  return canvasTexture('smoke', 64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  }, { repeat: false });
}
