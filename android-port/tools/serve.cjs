const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../www');
const port = Number(process.argv[2] || 8173);
const mime = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.css':'text/css', '.wasm':'application/wasm', '.png':'image/png', '.webp':'image/webp', '.ogg':'audio/ogg', '.mp3':'audio/mpeg', '.mp4':'video/mp4' };
http.createServer((req,res) => {
  if (req.url === '/__match-test.html') {
    const html = fs.readFileSync(path.join(root, 'index.html'),'utf8').replace('</body>', '<script src="/__match-test.js"></script></body>');
    res.writeHead(200, {'Content-Type':'text/html'}).end(html); return;
  }
  let file;
  try { file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)); }
  catch { res.writeHead(400).end(); return; }
  if (file === root) file = path.join(root, 'index.html');
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  if (file === path.join(root, '__storage-test.html')) file = path.resolve(__dirname, '../tests/storage-browser.html');
  if (file === path.join(root, '__match-test.js')) file = path.resolve(__dirname, '../tests/match-browser.js');
  fs.stat(file, (err,stat) => {
    if (err || !stat.isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type':mime[path.extname(file)] || 'application/octet-stream', 'Content-Length':stat.size });
    const stream = fs.createReadStream(file); stream.on('error', () => res.destroy()); stream.pipe(res);
  });
}).listen(port, '127.0.0.1', () => console.log('http://127.0.0.1:' + port));
