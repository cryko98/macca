// Pack PNG favicons into a .ico (PNG-compressed entries): node tools/make_ico.js game/assets
const fs = require('fs'), path = require('path');
const dir = process.argv[2] || 'game/assets';
const sizes = [16, 32, 48];
const pngs = sizes.map((s) => fs.readFileSync(path.join(dir, `favicon-${s}.png`)));
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(sizes.length, 4);
let offset = head.length;
sizes.forEach((s, i) => {
  const e = 6 + i * 16;
  head.writeUInt8(s % 256, e);
  head.writeUInt8(s % 256, e + 1);
  head.writeUInt8(0, e + 2);
  head.writeUInt8(0, e + 3);
  head.writeUInt16LE(1, e + 4);
  head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(pngs[i].length, e + 8);
  head.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});
fs.writeFileSync(path.join(dir, 'favicon.ico'), Buffer.concat([head, ...pngs]));
console.log('favicon.ico', offset, 'bytes');
