/*:
 * @target MZ
 * @plugindesc Android offline asset adapter. Load after game plugins.
 */
(() => {
  'use strict';
  const files = globalThis.TsubasaMobileAssets;
  if (!Array.isArray(files)) throw new Error('Mobile asset manifest missing');
  const exact = new Map(files.map(f => [f.toLowerCase(), f]));
  const images = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'];
  const audio = ['ogg', 'mp3', 'm4a', 'wav'];
  const aliases = new Map();
  for (const file of files) {
    const match = file.match(/^(img\/[^/]+\/)?.*\/([^/]+)\.([^.]+)$/i);
    if (!match || !match[1] || !images.includes(match[3].toLowerCase())) continue;
    const key = (match[1] + match[2]).toLowerCase();
    const candidates = aliases.get(key) || [];
    candidates.push(file); aliases.set(key, candidates);
  }
  function resolve(url) {
    if (typeof url !== 'string' || /^(?:[a-z]+:|\/\/)/i.test(url)) return url;
    let decoded; try { decoded = decodeURIComponent(url); } catch { return url; }
    const match = decoded.match(/^(.*)\.([^.\/]+)$/);
    if (!match) return url;
    const key = decoded.toLowerCase();
    let found = exact.get(key);
    // Current menu artwork lives here; archived _old_icons must not compete.
    if (!found && /^img\/pictures\/mode_[^/]+\.png$/.test(key)) {
      found = exact.get(key.replace('img/pictures/', 'img/pictures/modes/'));
    }
    const extensions = key.startsWith('img/') ? images : key.startsWith('audio/') ? audio : [];
    if (!found) for (const ext of extensions) {
      found = exact.get((match[1] + '.' + ext).toLowerCase());
      if (found) break;
    }
    // A bare picture name may refer to a file moved into a subfolder.
    if (!found && /^img\/[^/]+\/[^/]+$/.test(match[1])) {
      const candidates = aliases.get(match[1].toLowerCase()) || [];
      if (candidates.length === 1) found = candidates[0];
      else if (candidates.length > 1) console.warn('[Mobile] Ambiguous image name:', url, candidates);
    }
    return found ? found.split('/').map(encodeURIComponent).join('/') : url;
  }
  globalThis.TsubasaMobile = { version: '0.1.0', offline: true, resolveAsset: resolve };
  if (typeof Graphics !== 'undefined') {
    Graphics._defaultStretchMode = function() { return true; };
    Graphics._stretchWidth = function() { return document.documentElement.clientWidth; };
    Graphics._stretchHeight = function() { return document.documentElement.clientHeight; };
  }
  // Resolve at the loading boundary to cover both ImageManager and direct URLs.
  const loadBitmap = Bitmap.prototype._startLoading;
  Bitmap.prototype._startLoading = function() { this._url = resolve(this._url); return loadBitmap.apply(this, arguments); };
  const loadAudio = WebAudio.prototype.initialize;
  WebAudio.prototype.initialize = function(url) { return loadAudio.call(this, resolve(url)); };
  const playVideo = Video.play;
  Video.play = function(url) {
    const scene = typeof SceneManager !== 'undefined' && SceneManager._scene;
    this._mobileOpeningScene = typeof Scene_OpeningMovie !== 'undefined' && scene instanceof Scene_OpeningMovie ? scene : null;
    return playVideo.call(this, resolve(url));
  };
  // The upstream intro promises a fallback, but MZ throws from its async
  // video error handler before the scene can perform that fallback.
  const videoError = Video._onError;
  Video._onError = function() {
    const scene = this._mobileOpeningScene;
    if (scene) {
      console.warn('[Mobile] Opening video failed; continuing to title:', this._element && this._element.src);
      scene._videoDone = true;
      scene._done = true;
      this._loading = false;
      if (this._element) this._element.onerror = null;
      scene.removeMovieSync();
      scene.stopVideo();
      // SaveBoot can navigate away while the video is still loading. Do not
      // replace that newer scene or stop its soundtrack from a late callback.
      if (SceneManager._scene === scene) {
        scene.pauseAudio();
        scene.goTitle();
      }
      this._mobileOpeningScene = null;
      return;
    }
    return videoError.apply(this, arguments);
  };
  // This source release has no Hall of Fame artwork; use its drawn card.
  if (typeof Soccer !== 'undefined' && Soccer.HallOfFame && Soccer.HallOfFame.CARD &&
      resolve('img/pictures/Mode_HallOfFame.png') === 'img/pictures/Mode_HallOfFame.png' &&
      !exact.has('img/pictures/mode_halloffame.png')) {
    Soccer.HallOfFame.CARD.img = null;
  }
})();
