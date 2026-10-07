const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function boot(files, extra = {}) {
  function Bitmap() {} function WebAudio() {}
  Bitmap.prototype._startLoading = function() { return this._url; };
  WebAudio.prototype.initialize = function(url) { this.url = url; };
  const c = { TsubasaMobileAssets: files, Bitmap, WebAudio, Video: { play:url=>url, _onError() { throw Error('Video load failed'); } }, console, ...extra };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../runtime/Tsubasa_Mobile.js'),'utf8'), c);
  return c;
}
test('Browser without Node resolves image extension and nested alias', () => {
  const c = boot(['img/pictures/School/Taki.webp']);
  for (const url of ['img/pictures/School/Taki.png', 'img/pictures/Taki.png']) {
    const b = new c.Bitmap(); b._url = url;
    assert.equal(b._startLoading(), 'img/pictures/School/Taki.webp');
  }
});
test('Current menu icons take precedence over archived copies', () => {
  const c = boot(['img/pictures/Modes/_old_icons/Mode_Shop.png','img/pictures/Modes/Mode_Shop.png']);
  assert.equal(c.TsubasaMobile.resolveAsset('img/pictures/Mode_Shop.png'),'img/pictures/Modes/Mode_Shop.png');
});
test('Opening video failure continues to title, other video failures remain visible', () => {
  const calls = [];
  function Intro() {}
  for (const method of ['removeMovieSync','stopVideo','pauseAudio','goTitle']) Intro.prototype[method] = () => calls.push(method);
  const scene = new Intro();
  const c = boot([], { Scene_OpeningMovie: Intro, SceneManager: { _scene: scene } });
  c.Video.play('movies/TsubasaOpening1.mp4');
  c.Video._loading = true;
  assert.doesNotThrow(() => c.Video._onError());
  assert.equal(scene._videoDone, true);
  assert.equal(c.Video._loading, false);
  assert.deepEqual(calls, ['removeMovieSync','stopVideo','pauseAudio','goTitle']);
  calls.length = 0;
  c.Video.play('movies/TsubasaOpening2.mp4');
  c.SceneManager._scene = {};
  assert.doesNotThrow(() => c.Video._onError());
  assert.deepEqual(calls, ['removeMovieSync','stopVideo']);
  c.Video.play('movies/Other.mp4');
  assert.throws(() => c.Video._onError(), /Video load failed/);
});
test('Missing optional Hall of Fame art uses the existing drawn card', () => {
  const Soccer = { HallOfFame: { CARD: { img: 'Mode_HallOfFame' } } };
  boot([], { Soccer });
  assert.equal(Soccer.HallOfFame.CARD.img, null);
});
test('Audio uses available format, preserves explicit format and URL encoding', () => {
  const c = boot(['audio/bgm/My Song.mp3','audio/se/Hit.ogg','audio/se/Hit.mp3']);
  const a = new c.WebAudio(); a.initialize('audio/bgm/My%20Song.ogg');
  assert.equal(a.url,'audio/bgm/My%20Song.mp3');
  assert.equal(c.TsubasaMobile.resolveAsset('audio/se/Hit.mp3'),'audio/se/Hit.mp3');
});
test('Unknown, remote and ambiguous paths are not silently redirected', () => {
  const c = boot(['img/pictures/A/Taki.webp','img/pictures/B/Taki.webp']);
  for (const url of ['img/pictures/Taki.png','img/pictures/Unknown.png','https://example.com/a.png','data:image/png;base64,123']) {
    assert.equal(c.TsubasaMobile.resolveAsset(url),url);
  }
});
test('Actual generated manifest resolves audited missing portrait', () => {
  const m = {}; vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../www/js/mobile-assets.js'),'utf8'),m);
  const c = boot(m.TsubasaMobileAssets);
  const resolved = c.TsubasaMobile.resolveAsset('img/pictures/Elementary%20School%20Portraits/Hajime_Taki%20Shutestu%201.png');
  assert.match(resolved,/\.webp$/);
  assert.ok(fs.existsSync(path.join(__dirname,'../www',decodeURIComponent(resolved))));
});
test('Encoded reserved characters in asset filenames round trip', () => {
  const c = boot(['img/pictures/Test #1.webp']);
  assert.equal(c.TsubasaMobile.resolveAsset('img/pictures/Test%20%231.png'), 'img/pictures/Test%20%231.webp');
});
test('Late title background callback tolerates a destroyed PIXI sprite', () => {
  const text = fs.readFileSync(path.join(__dirname,'../www/js/plugins/Soccer_MatchScene.js'),'utf8');
  const line = text.split('\n').find(l => l.includes('const fit = () => { const s = this._soccerTitleBg;'));
  assert.ok(line);
  const scene = { _soccerTitleBg: { transform:null, get scale() { throw Error('Destroyed transform'); } } };
  const call = new Function(line + '\nfit();');
  assert.doesNotThrow(() => call.call(scene));
});
