const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = path.resolve(process.argv[2] || path.join(root, 'source-snapshot'));
const output = path.join(root, 'www');
if (source === output || source.startsWith(output + path.sep)) throw Error('Source must be outside output');
if (!fs.existsSync(path.join(source, 'game.rmmzproject'))) throw Error('RPG Maker project not found');
// Only managed web assets are copied. No saves, executables or desktop runtime.
const folders = ['audio', 'css', 'data', 'effects', 'fonts', 'icon', 'img', 'js', 'movies'];
fs.mkdirSync(output, { recursive: true });
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name, 'en')).flatMap(e => {
    if (e.isSymbolicLink()) throw Error('Unexpected symlink: ' + e.name);
    const f = path.join(dir, e.name);
    return e.isDirectory() ? walk(f) : [f];
  });
}
const files = folders.flatMap(folder => walk(path.join(source, folder)));
const mediaRoot = path.join(root, 'mobile-media');
const media = JSON.parse(fs.readFileSync(path.join(mediaRoot, 'intro-manifest.json'), 'utf8').replace(/^\uFEFF/, ''));
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
for (const name of ['TsubasaOpening1.mp4', 'TsubasaOpening2.mp4']) {
  const entry = media.find(item => item.name === name);
  if (!entry || sha256(path.join(source, 'movies', name)) !== entry.sourceSha256 ||
      sha256(path.join(mediaRoot, 'movies', name)) !== entry.outputSha256) {
    throw Error('Intro cache missing or outdated. Run tools/prepare-intro.ps1 for this source.');
  }
}
for (const file of files) {
  const relative = path.relative(source, file);
  if (/SAVEPOINT|_editor_entry/i.test(relative)) continue;
  const dest = path.join(output, relative);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const mobileIntro = /^movies[\\/]TsubasaOpening[12]\.mp4$/.test(relative);
  fs.copyFileSync(mobileIntro ? path.join(mediaRoot, relative) : file, dest);
}
const assets = files.map(f => path.relative(source, f).replaceAll('\\', '/'))
  .filter(f => /^(img|audio|movies)\//.test(f));
fs.writeFileSync(path.join(output, 'js/mobile-assets.js'), 'globalThis.TsubasaMobileAssets = ' + JSON.stringify(assets) + ';\n');
const ctx = {};
vm.runInNewContext(fs.readFileSync(path.join(source, 'js/plugins.js'), 'utf8'), ctx, { timeout: 10000 });
// Disable transport and online-only extensions; keep shared offline game systems.
const disabled = [];
for (const plugin of ctx.$plugins) {
  if (/^Soccer_Online/.test(plugin.name) || ['Soccer_NetCode','Soccer_ShootoutOnline','MCP_Debug'].includes(plugin.name)) {
    if (plugin.status) disabled.push(plugin.name);
    plugin.status = false;
  }
}
ctx.$plugins.push({ name: 'Tsubasa_Mobile', status: true, description: 'Android offline adapters', parameters: {} });
ctx.$plugins.push({ name: 'Tsubasa_MobileStorage', status: true, description: 'Offline career storage', parameters: {} });
ctx.$plugins.push({ name: 'Tsubasa_MobileIntro', status: true, description: 'Offline mobile intro playback', parameters: {} });
fs.writeFileSync(path.join(output, 'js/plugins.js'), 'var $plugins = ' + JSON.stringify(ctx.$plugins) + ';\n');
fs.copyFileSync(path.join(root, 'runtime/Tsubasa_Mobile.js'), path.join(output, 'js/plugins/Tsubasa_Mobile.js'));
fs.copyFileSync(path.join(root, 'runtime/Tsubasa_MobileStorage.js'), path.join(output, 'js/plugins/Tsubasa_MobileStorage.js'));
fs.copyFileSync(path.join(root, 'runtime/Tsubasa_MobileIntro.js'), path.join(output, 'js/plugins/Tsubasa_MobileIntro.js'));
const matchPath = path.join(output, 'js/plugins/Soccer_MatchScene.js');
let match = fs.readFileSync(matchPath, 'utf8');
function replaceOnce(before, after) {
  if (match.split(before).length !== 2) throw Error('Source changed; review mobile patch: ' + before);
  match = match.replace(before, after);
}
// PIXI scale is a getter reading transform; destroyed sprites have null transform.
replaceOnce('const s = this._soccerTitleBg; if (!s || !s.scale) return;',
  'const s = this._soccerTitleBg; if (!s || s.destroyed || !s.transform) return;');
replaceOnce('    // Per-card BGM override from the Plugin Manager',
  '    for (let i = MODES.length - 1; i >= 0; i--) { if (["casualonline", "exit"].includes(MODES[i].key)) MODES.splice(i, 1); }\n\n    // Per-card BGM override from the Plugin Manager');
const dreamSaveLines = match.split('\n').filter(l => l.includes('const ok = Soccer.Dream.saveCareer ?'));
if (dreamSaveLines.length !== 3) throw Error('Dream save callers changed; review mobile UI integration');
for (const line of dreamSaveLines) {
  const condition = line.includes('this._quitSel === 0') ? 'if (this._quitSel === 0)' : line.includes('key === "save"') ? 'if (key === "save")' : 'else if (act === "save")';
  replaceOnce(line, '        ' + condition + ' { return TsubasaMobile.saveDreamUI(this, ' + line.includes('this._quitSel === 0') + '); }');
}
replaceOnce('if (k === "quit") { SoundManager.playOk(); try { Soccer.Success.saveToSlot(Soccer.Success.get().slot || 0); } catch (e) {} return this.popScene(); }',
  'if (k === "quit") { if (!Soccer.Success.saveToSlot(Soccer.Success.get().slot || 0)) { SoundManager.playBuzzer(); this._msg = "Save failed. Please try again."; return this.draw(); } SoundManager.playOk(); return this.popScene(); }');
replaceOnce('Soccer.Success.deleteSlot(this._confirmDel); this._msg = "Career deleted.";',
  'if (!Soccer.Success.deleteSlot(this._confirmDel)) { this._msg = "Delete failed. Career retained."; this._confirmDel = null; SoundManager.playBuzzer(); return this.draw(); } this._msg = "Career deleted.";');
fs.writeFileSync(matchPath, match);
let main = fs.readFileSync(path.join(source, 'js/main.js'), 'utf8');
main = main.replace(/^\s*"js\/libs\/peerjs.min.js",?\r?\n/m, '\n');
fs.writeFileSync(path.join(output, 'js/main.js'), main);
let html = fs.readFileSync(path.join(source, 'index.html'), 'utf8');
html = html.replace('content="user-scalable=no"', 'content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"');
html = html.replace('<script type="text/javascript" src="js/main.js">', '<script src="js/mobile-assets.js"></script>\n        <script type="text/javascript" src="js/main.js">');
fs.writeFileSync(path.join(output, 'index.html'), html);
const report = { source, output, generatedAt: new Date().toISOString(), assets: assets.length, disabled,
  status: 'Web assets for Android offline alpha; APK built separately with tools/build-apk.ps1', pending: ['Touch controls','Remaining career modes and large save tests','Android runtime tests'] };
fs.writeFileSync(path.join(root, 'build-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
