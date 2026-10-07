/*:
 * @target MZ
 * @plugindesc Offline mobile intro: bounded Blob loading and one synchronized A/V track.
 */
(() => {
  'use strict';
  if (typeof Scene_OpeningMovie === 'undefined') return;
  const proto = Scene_OpeningMovie.prototype;
  const MAX_BYTES = 48 * 1024 * 1024;
  proto.create = function() {
    Scene_Base.prototype.create.call(this);
    this._navigated = false;
    this._introClosed = false;
    this._introEnded = false;
    this._introStarted = false;
    this._introFrames = 0;
    this._introOff = [];
    this._black = new ScreenSprite();
    this._black.setColor(0, 0, 0);
    this.addChild(this._black);
    for (const method of ['stopBgm','stopBgs','stopMe','stopSe']) AudioManager[method]();
    const list = Scene_SoccerMatch.OPENING_MOVIES || [];
    if (!list.length) { this._introEnded = true; return; }
    let previous = -1;
    try { previous = Number.parseInt(localStorage.getItem('soccerOpenMovieIdx'), 10); } catch (_) {}
    if (!Number.isFinite(previous)) previous = -1;
    const index = ((previous + 1) % list.length + list.length) % list.length;
    Soccer._openMovieIdx = index;
    try { localStorage.setItem('soccerOpenMovieIdx', String(index)); } catch (_) {}
    const name = list[index];
    if (!/^TsubasaOpening[12]$/.test(name)) { this._introEnded = true; return; }
    this._introName = name;
    const el = Video._element;
    this._introElement = el;
    el.pause();
    el.onerror = el.onloadeddata = el.onended = null;
    el.removeAttribute('src');
    el.load();
    el.muted = false;
    el.volume = Video._volume == null ? 1 : Video._volume;
    el.loop = false;
    Video._loading = true;
    Video._updateVisibility(false);
    const on = (target, event, listener) => {
      target.addEventListener(event, listener);
      this._introOff.push(() => target.removeEventListener(event, listener));
    };
    on(el, 'playing', () => {
      if (this._introClosed) return;
      this._introStarted = true;
      Video._loading = false;
      Video._updateVisibility(true);
      console.log('[MobileIntro] playing', name, el.videoWidth, el.videoHeight, 'audioMuted=' + el.muted);
    });
    on(el, 'ended', () => {
      console.log('[MobileIntro] ended', name, el.currentTime);
      this._introEnded = true;
    });
    on(el, 'error', () => this.mobileIntroFail('media error ' + (el.error && el.error.code)));
    on(document, 'visibilitychange', () => {
      if (document.hidden) el.pause();
      else this.mobileIntroPlay();
    });
    // Retry autoplay denial with the existing user gesture; no new key mapping.
    on(document, 'keydown', () => this.mobileIntroPlay());
    on(document, 'touchend', () => this.mobileIntroPlay());
    Input.clear();
    if (TouchInput.clear) TouchInput.clear();
    this._introAbort = new AbortController();
    this._introTimer = setTimeout(() => this.mobileIntroFail('loading timeout'), 30000);
    this._introPromise = this.mobileIntroLoad('movies/' + name + '.mp4');
  };
  proto.mobileIntroLoad = async function(path) {
    try {
      const response = await fetch(path, { signal: this._introAbort.signal });
      if (!response.ok) throw Error('HTTP ' + response.status);
      const size = Number(response.headers.get('Content-Length'));
      if (!size || size > MAX_BYTES) throw Error('invalid intro size');
      const blob = await response.blob();
      if (blob.size !== size || blob.size > MAX_BYTES) throw Error('incomplete intro');
      if (this._introClosed) return;
      this._introUrl = URL.createObjectURL(blob);
      this._introElement.src = this._introUrl;
      this._introElement.load();
      clearTimeout(this._introTimer);
      this._introTimer = setTimeout(() => {
        if (!this._introStarted) this.mobileIntroFail('decoder timeout');
      }, 30000);
      this.mobileIntroPlay();
    } catch (error) {
      if (!this._introClosed) this.mobileIntroFail(String(error));
    }
  };
  proto.mobileIntroPlay = function() {
    if (this._introClosed || this._introEnded || !this._introUrl || document.hidden) return;
    const promise = this._introElement.play();
    if (promise && promise.catch) promise.catch(error => {
      if (error.name !== 'NotAllowedError' && error.name !== 'AbortError') this.mobileIntroFail(String(error));
    });
  };
  proto.mobileIntroFail = function(reason) {
    if (this._introClosed || this._introEnded) return;
    console.warn('[MobileIntro] failed', this._introName, reason);
    this._introEnded = true;
    if (this._introAbort) this._introAbort.abort();
  };
  proto.update = function() {
    Scene_Base.prototype.update.call(this);
    if (this._introClosed) return;
    if (document.hidden) return;
    this._introFrames++;
    const skip = this._introFrames > 30 && (Input.isTriggered('ok') || Input.isTriggered('cancel') || TouchInput.isTriggered());
    if (this._introEnded || skip) {
      this.mobileIntroDispose();
      this.goTitle();
    }
  };
  proto.mobileIntroDispose = function() {
    if (this._introClosed) return;
    this._introClosed = true;
    clearTimeout(this._introTimer);
    if (this._introAbort) this._introAbort.abort();
    for (const off of this._introOff || []) off();
    this._introOff = [];
    const el = this._introElement;
    if (el) {
      el.pause();
      el.onerror = el.onloadeddata = el.onended = null;
      el.removeAttribute('src');
      el.load();
    }
    if (this._introUrl) { URL.revokeObjectURL(this._introUrl); this._introUrl = null; }
    Video._loading = false;
    Video._updateVisibility(false);
  };
  proto.terminate = function() {
    this.mobileIntroDispose();
    Scene_Base.prototype.terminate.call(this);
  };
})();
