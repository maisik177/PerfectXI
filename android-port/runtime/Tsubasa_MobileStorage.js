/*: @target MZ
 * @plugindesc Browser storage for Dream and Success; no Node filesystem.
 */
(() => {
  'use strict';
  const M = globalThis.TsubasaMobile;
  const clone = value => JSON.parse(JSON.stringify(value));
  M.storageError = function(error) {
    console.error('[Mobile save]', error);
    M.lastStorageError = String(error && error.message || error);
    if (typeof document === 'undefined') return;
    let el = document.getElementById('mobile-save-error');
    if (!el) {
      el = document.createElement('div'); el.id = 'mobile-save-error';
      el.setAttribute('role', 'alert');
      el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;padding:12px;background:#7c1717;color:white;font:16px sans-serif;text-align:center';
      document.body.appendChild(el);
    }
    el.textContent = 'Save failed. Your latest progress is not saved. Please try saving again before leaving.';
  };
  M.clearStorageError = function() {
    M.lastStorageError = null;
    if (typeof document !== 'undefined') document.getElementById('mobile-save-error')?.remove();
  };
  const D = Soccer.Dream;
  if (D) {
    let pending = null;
    D.saveCareer = function() {
      if (pending) return pending;
      pending = (async () => {
        const career = D.get(); if (!career) return false;
        try {
          if (typeof $gameSystem !== 'undefined') $gameSystem.onBeforeSave?.();
          // Snapshot now; mutations during asynchronous compression cannot change this save.
          const contents = JsonEx.parse(JsonEx.stringify(DataManager.makeSaveContents()));
          const savedCareer = contents.system?._soccerDream;
          const day = career.day || 0, season = career.season || 1;
          if (savedCareer) { savedCareer.savedAtDay = day; savedCareer.savedSeason = season; }
          await StorageManager.saveObject(D.SAVE_KEY, contents);
          if (Soccer.Global?.save && await Soccer.Global.save() === false) throw Error('Global progress could not be saved');
          career.savedAtDay = day; career.savedSeason = season;
          M.clearStorageError();
          return true;
        } catch (error) { M.storageError(error); return false; }
      })().finally(() => { pending = null; });
      return pending;
    };
  }
  M.saveDreamUI = function(scene, leave) {
    if (scene._mobileSaving) return;
    scene._mobileSaving = true; scene._msg = 'Saving...'; scene.draw?.();
    return Promise.resolve().then(() => D.saveCareer()).catch(error => { M.storageError(error); return false; }).then(ok => {
      scene._msg = ok ? 'Career saved.' : 'Save failed. Please try again.';
      (ok ? SoundManager.playSave : SoundManager.playBuzzer).call(SoundManager);
      if (ok && leave) SceneManager.goto(typeof Scene_TitleModes !== 'undefined' ? Scene_TitleModes : Scene_Title);
      else if (SceneManager._scene === scene) { if (!ok) scene._quit = false; scene.draw?.(); }
      return ok;
    }).finally(() => { scene._mobileSaving = false; });
  };
  // Existing navigation is retained; while saving it cannot leave the save screen.
  for (const name of ['Scene_DreamMap', 'Scene_DreamHome', 'Scene_DreamHub']) {
    const C = globalThis[name]; if (!C?.prototype.update) continue;
    const update = C.prototype.update;
    C.prototype.update = function() { if (!this._mobileSaving) return update.apply(this, arguments); };
  }
  const S = Soccer.Success;
  if (S) {
    const key = 'tsubasa.mobile.success.v1';
    const valid = i => Number.isInteger(i) && i >= 0 && i < S.MAX_SLOTS;
    let unreadable = false;
    S.loadSlots = function() {
      if (this._slots) return this._slots;
      try {
        const text = localStorage.getItem(key);
        const data = text === null ? [] : JSON.parse(text);
        if (!Array.isArray(data) || data.some(x => x !== null && (typeof x !== 'object' || Array.isArray(x)))) throw Error('Invalid career save');
        this._slots = Array.from({length:S.MAX_SLOTS}, (_,i) => data[i] || null);
        unreadable = false; return this._slots;
      } catch (error) {
        unreadable = true; M.storageError(error);
        // Do not cache a blank array or overwrite corrupted/unavailable storage.
        return Array(S.MAX_SLOTS).fill(null);
      }
    };
    const commit = slots => {
      try {
        if (unreadable) throw Error('Existing careers could not be read; write blocked');
        localStorage.setItem(key, JSON.stringify(slots));
        S._slots = slots; M.clearStorageError(); return true;
      } catch (error) { M.storageError(error); return false; }
    };
    S.saveSlots = function() { const slots = this.loadSlots(); return commit(clone(slots)); };
    S.saveToSlot = function(i) {
      const d = this.get(); if (!d || !valid(i)) return false;
      try {
        const slots = clone(this.loadSlots()); const saved = clone(d); saved.slot = i; slots[i] = saved;
        if (!commit(slots)) return false;
        d.slot = i; return true;
      } catch (error) { M.storageError(error); return false; }
    };
    S.deleteSlot = function(i) {
      if (!valid(i)) return false;
      const slots = clone(this.loadSlots()); slots[i] = null; return commit(slots);
    };
  }
})();
