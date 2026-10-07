const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const source = path.resolve(process.argv[2] || 'D:/irch/captain-tsubasa-perfectxi');
const target = path.resolve(__dirname, '../source-snapshot');
if (fs.existsSync(target)) throw Error('Snapshot already exists; refusing to overwrite it');
if (!fs.existsSync(path.join(source, 'game.rmmzproject'))) throw Error('Source project missing');
const hash = file => {
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.alloc(1024 * 1024);
  const digest = crypto.createHash('sha256');
  try { let n; while ((n = fs.readSync(fd, buffer, 0, buffer.length, null))) digest.update(buffer.subarray(0,n)); }
  finally { fs.closeSync(fd); }
  return digest.digest('hex');
};
const files = [];
function copy(relative = '') {
  fs.mkdirSync(path.join(target, relative), {recursive:true});
  for (const entry of fs.readdirSync(path.join(source, relative), {withFileTypes:true})) {
    const rel = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw Error('Unexpected link: ' + rel);
    if (entry.isDirectory()) { copy(rel); continue; }
    if (!entry.isFile()) throw Error('Unexpected entry: ' + rel);
    const from = path.join(source, rel), to = path.join(target, rel);
    fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
    const sha256 = hash(from);
    if (sha256 !== hash(to)) throw Error('Snapshot differs: ' + rel);
    files.push({path:rel.replaceAll('\\','/'), bytes:fs.statSync(to).size, sha256});
    if (files.length % 1000 === 0) console.log('Copied and verified ' + files.length + ' files');
  }
}
copy();
const report = {createdAt:new Date().toISOString(), originalSource:source, snapshot:target, files};
fs.writeFileSync(path.resolve(__dirname, '../source-snapshot-manifest.json'), JSON.stringify(report,null,2));
console.log(JSON.stringify({snapshot:target,files:files.length,bytes:files.reduce((sum,f)=>sum+f.bytes,0),verification:'SHA256 of every file matched'}));
