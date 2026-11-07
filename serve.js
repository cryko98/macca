// Minimal static server (no dependencies): node serve.js  ->  http://localhost:5173
const http = require('http'), fs = require('fs'), path = require('path');
const root = __dirname, port = process.env.PORT || 5173;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
http.createServer((req, res) => {
  const p = path.normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^([\\/]\.\.)+/, '');
  let file = path.join(root, p);
  if (p.endsWith('/') || p.endsWith(path.sep)) file = path.join(file, 'index.html');
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, () => console.log(`Pink Gator demo: http://localhost:${port}`));
