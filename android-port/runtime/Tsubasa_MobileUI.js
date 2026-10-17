/*:
 * @target MZ
 * @plugindesc Mobile alpha HUD connected to the offline match. Load last.
 */
(() => {
  'use strict';
  const basic = new Set(['free', 'move', 'menu', 'target', 'facing', 'ai']);
  let scene, root, dock, slot, pending, signature = '', more = false;
  const hidden = ['_scoreboard','_turnHud','_faceHud','_specialHeader','_miniMap','_commentary','_info','_guideHint','_inspect'];
  const saved = new Map();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const button = (label, action, disabled = false) => `<button data-mobile="${esc(action)}" ${disabled ? 'disabled' : ''}>${esc(label)}</button>`;
  const face = b => {
    const name = b && Soccer.Portrait?.nameFor(b);
    return name ? `<img alt="" src="${esc(TsubasaMobile.resolveAsset('img/pictures/' + name + '.png'))}">` : '';
  };
  function mount() {
    if (root) return;
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'css/mobile-ui.css'; document.head.append(css);
    root = document.createElement('main'); root.id = 'mobile-match'; root.hidden = true;
    root.innerHTML = '<header></header><section class="mobile-queue"></section><section class="mobile-middle"><div class="mobile-slot"></div><nav aria-label="Player actions"></nav></section><section class="mobile-resources"></section><footer role="status"></footer><section class="mobile-sheet" hidden></section>';
    document.body.append(root);
    dock = document.createElement('nav'); dock.id = 'mobile-menu-controls'; dock.setAttribute('aria-label','Touch menu controls');
    dock.innerHTML = ['up','left','right','down','ok','cancel'].map(k=>button(({up:'↑',left:'←',right:'→',down:'↓',ok:'OK',cancel:'Back'})[k],'key:'+k)).join('');
    for (const type of ['pointerdown','pointerup','touchstart','touchend','mousedown','mouseup']) dock.addEventListener(type,e=>e.stopPropagation());
    dock.addEventListener('click',e=>{const b=e.target.closest('[data-mobile]');if(b){e.stopPropagation();pulse(b.dataset.mobile.slice(4));}});document.body.append(dock);
    slot = root.querySelector('.mobile-slot');
    // Stop at the DOM boundary: an action must never also tap the pitch.
    for (const type of ['pointerdown','pointerup','touchstart','touchend','mousedown','mouseup']) root.addEventListener(type, e => { if (more || scene?._mode === 'pause' || !e.target.closest('.mobile-slot')) e.stopPropagation(); });
    root.addEventListener('click', e => { const b = e.target.closest('[data-mobile]'); if (b && !b.disabled) { e.stopPropagation(); dispatch(b.dataset.mobile); } });
  }
  function actions() {
    return scene && ['move','menu'].includes(scene._mode) && scene._selected && scene.isHumanControlled(scene._selected) ? scene.availableActions() : [];
  }
  function pulse(key) { Input.virtualClick(key); }
  function dispatch(key) {
    if (!scene || SceneManager._scene !== scene) return;
    restore();
    if (key === 'more') { more = !more; signature = ''; return; }
    if (key === 'pause') { more = false; scene.openPause(); return; }
    if (key === 'resume') { scene.closePause(); return; }
    if (key === 'zoom') { scene._zoom = scene._zoom > 1 ? 1 : 1.45; scene._ballCamOn = false; scene._panX = 0; scene._panY = 0; scene.applyPitchTransform(); if (scene._zoom > 1) scene.focusCameraOnActive(); return; }
    if (key === 'cancel') { if (pending) { pending = null; return; } more = false; if (['move','target'].includes(scene._mode)) scene.onCancel(); else pulse('cancel'); return; }
    if (key === 'confirm') {
      if (pending && pending.mode === scene._mode && pending.actor === scene._active) { scene._cursor = {x:pending.x,y:pending.y}; pending = null; scene.onOk(); }
      return;
    }
    if (key.startsWith('key:')) { pulse(key.slice(4)); return; }
    if (key.startsWith('pause:') && scene._mode === 'pause') { const c = scene._pauseCmds[Number(key.slice(6))]; if (c) c.act(); return; }
    const action = actions().find(a => a.symbol === key);
    if (!action?.enabled) return;
    pending = null; more = false;
    if (scene._mode === 'move') scene.openMenu();
    scene._actionWindow.deactivate(); scene._actionWindow.callHandler(key);
  }
  function render() {
    const b = scene.isBattler(scene._active) ? scene._active : null, sb = scene._scoreboard;
    const queue = [b].concat(scene._queue || []).filter(p => scene.isBattler(p)).slice(0,4);
    const list = actions();
    const side = b && Soccer.Core ? Soccer.Core.sideOf(b) : "home";
    const tactic = Soccer.Tactics?.currentFor?.(side);
    const edge = Soccer.Tactics?.liveCounterEdge?.() || 0;
    const native = !basic.has(scene._mode) || scene._shotGame?.visible || scene._guideOpen || scene._keyMoment || scene._subUI;
    const main = ['pass','callpass','shoot','special','tackle','chaseball','dribble'].map(k => list.find(a => a.symbol === k)).filter(Boolean).slice(0,3);
    const sta = b && Soccer.Stamina ? Math.round(Soccer.Stamina.get(b)) : 0;
    const max = b && Soccer.Stamina ? Math.round(Soccer.Stamina.getMax(b)) : 100;
    const hyper = b && Soccer.Hyper ? Math.round(Soccer.Hyper.get(b)) : 0;
    const sup = b && Soccer.Skill ? Math.round(Soccer.Skill.get(b)) : 0;
    const state = JSON.stringify([scene._mode,b?.actorId(),queue.map(p=>p.actorId()),list,sta,max,hyper,sup,sb?.scores(),Soccer.MatchClock?.displayTime(),pending,more,!!scene._guideOpen,tactic?.name,edge,scene._pauseCmds?.map(c=>c.label),scene._lastCommLine], (k,v) => k === 'actor' ? v?.actorId() : v);
    if (state === signature) return; signature = state;
    root.querySelector('header').innerHTML = `<b>${esc(sb?.homeName())}</b><strong>${sb?.scores().join(' : ')}</strong><b>${esc(sb?.awayName())}</b><time>${esc(Soccer.MatchClock?.displayTime())}</time>${button('Pause','pause', !basic.has(scene._mode))}`;
    root.querySelector('.mobile-queue').innerHTML = '<small>TURN ORDER</small>' + queue.map((p,i)=>`<div class="${i ? '' : 'current'}">${face(p)}<span><small>${i ? 'NEXT ' + i : 'ACTIVE'}</small><b>${esc(p.name())}</b></span><em>${Soccer.Stats?.SPD(p) ?? ''}</em></div>`).join('');
    root.querySelector('nav').innerHTML = native ? ['up','left','right','down','ok','shift','pageup','pagedown','cancel'].map(k=>button(({up:'↑',left:'←',right:'→',down:'↓',ok:'OK / Stop',shift:'Feint / Stance',pageup:'Previous',pagedown:'Next',cancel:'Back'})[k],'key:'+k)).join('') : (tactic ? `<small class="mobile-tactic">${esc(tactic.name || tactic.key)}${edge ? '<br>' + ((side === 'away' ? edge < 0 : edge > 0) ? 'TACTICAL EDGE' : 'OUT-TACTICKED') : ''}</small>` : '') + main.map(a=>button(a.name,a.symbol,!a.enabled)).join('') + button('More','more',!list.length) + button('Zoom','zoom') + (scene._mode === 'facing' ? ['up','left','right','down','ok'].map(k=>button(k === 'ok' ? 'Confirm facing' : {up:'↑',left:'←',right:'→',down:'↓'}[k],'key:'+k)).join('') : '');
    const meter = (name,v,m) => `<label>${name}<b>${v}${name==='STAMINA' ? '/' + m : '%'}</b><progress max="${m}" value="${v}"></progress></label>`;
    root.querySelector('.mobile-resources').innerHTML = `<div class="mobile-identity">${face(b)}<b>${esc(b?.name() || 'Kickoff')}</b></div>${meter('STAMINA',sta,max)}${meter('HYPER',hyper,100)}${meter('SUPER',sup,100)}${button('Cancel','cancel')}${button('Confirm','confirm',!pending)}`;
    root.querySelector('footer').textContent = pending ? 'Selected: '+ pending.x + ', ' + pending.y + ' — Confirm to commit, or tap another field.' : scene._mode === 'move' ? 'Tap a field to preview movement, then Confirm. Choose an action on the right.' : scene._mode === 'target' ? 'Tap a highlighted teammate, then Confirm.' : (typeof scene._lastCommLine === 'string' ? scene._lastCommLine : scene._lastCommLine?.text) || 'Match in progress';
    const sheet = root.querySelector('.mobile-sheet');
    sheet.hidden = !more && (scene._mode !== 'pause' || scene._guideOpen);
    root.classList.toggle('sheet-open', !sheet.hidden);
    sheet.innerHTML = scene._mode === 'pause' ? '<h2>Paused</h2>' + (scene._pauseCmds || []).map((c,i)=>button(c.name || c.label || 'Resume','pause:'+i)).join('') : '<h2>Player actions</h2>' + list.filter(a=>!main.includes(a)).map(a=>button(a.symbol === 'wait' ? 'Facing' : a.name,a.symbol,!a.enabled)).join('') + button('Close','more');
  }
  function restore() {
    for (const [sprite, visible] of saved) if (!sprite.destroyed) sprite.visible = visible;
    saved.clear();
  }
  function layout() {
    const canvas = Graphics._canvas;
    if (!canvas || !scene) return;
    const compact = basic.has(scene._mode) && !scene._shotGame?.visible && !scene._guideOpen && !scene._keyMoment && !scene._subUI;
    root.classList.toggle('native-overlay', !compact && (scene._mode !== 'pause' || scene._guideOpen));
    restore();
    if (compact) for (const key of hidden.concat('_actionWindow')) { const s = scene[key]; if (s) { saved.set(s,s.visible); s.visible = false; } }
    if (scene._mode === 'pause' && scene._pausePanel) { saved.set(scene._pausePanel,scene._pausePanel.visible); scene._pausePanel.visible = false; }
    const r = slot.getBoundingClientRect();
    const p = scene._pitch;
    const px = Number(PluginManager.parameters('Soccer_MatchScene').sideMarginSides || 24);
    const py = Number(PluginManager.parameters('Soccer_MatchScene').sideMarginTop || 64) + 40;
    const w = compact ? p._panelWidth : Graphics.width, h = compact ? p._panelHeight : Graphics.height;
    const scale = Math.min(r.width/w, r.height/h);
    const x = r.left + (r.width-w*scale)/2 - (compact ? px*scale : 0), y = r.top+(r.height-h*scale)/2-(compact ? py*scale : 0);
    canvas.style.cssText = `position:fixed;margin:0;left:${x}px;top:${y}px;width:${Graphics.width*scale}px;height:${Graphics.height*scale}px;z-index:1;clip-path:inset(${compact ? py : 0}px ${compact ? Graphics.width-px-w : 0}px ${compact ? Graphics.height-py-h : 0}px ${compact ? px : 0}px)`;
    // CSS clip lengths are physical pixels, unlike renderer dimensions.
    canvas.style.clipPath = compact ? `inset(${py*scale}px ${(Graphics.width-px-w)*scale}px ${(Graphics.height-py-h)*scale}px ${px*scale}px)` : 'none';
    Graphics._realScale = scale;
  }
  const oldX = Graphics.pageToCanvasX, oldY = Graphics.pageToCanvasY;
  Graphics.pageToCanvasX = function(x) { const r = this._canvas?.getBoundingClientRect(); return scene && r ? Math.round((x-scrollX-r.left)*this.width/r.width) : oldX.call(this,x); };
  Graphics.pageToCanvasY = function(y) { const r = this._canvas?.getBoundingClientRect(); return scene && r ? Math.round((y-scrollY-r.top)*this.height/r.height) : oldY.call(this,y); };
  const pointer = Scene_SoccerMatch.prototype.updatePointer;
  Scene_SoccerMatch.prototype.updatePointer = function() {
    if (scene !== this || !['move','target'].includes(this._mode)) return pointer.apply(this,arguments);
    if (!TouchInput.isTriggered()) return false;
    const c = this.screenToCell(TouchInput.x,TouchInput.y);
    if (!c) return false;
    const allowed = this._mode === 'target' ? this._targets : this._reach;
    if (Array.isArray(allowed) && !allowed.some(p=>p.x===c.x && p.y===c.y)) return true;
    this._cursor = {x:c.x,y:c.y}; this._pitch.setCursorCell(c.x,c.y);
    if (this._mode === 'move') this.updateMoveReticle(c);
    else if (this._action === 'pass') this.drawPassPreview();
    pending = {...c,mode:this._mode,actor:this._active};
    return true;
  };
  const update = SceneManager.updateScene;
  SceneManager.updateScene = function() {
    restore();
    const result = more && this._scene === scene ? undefined : update.apply(this,arguments);
    mount();
    const current = this._scene instanceof Scene_SoccerMatch && this._scene._pitch ? this._scene : null;
    dock.hidden = !!current || /Opening|Boot/.test(this._scene?.constructor?.name || 'Boot');
    if (current !== scene) { scene = current; pending = null; more = false; signature = ''; root.hidden = !scene; if (!scene) { Graphics._canvas.style.clipPath = ''; Graphics._updateAllElements(); } }
    if (scene) { if (pending && (pending.mode !== scene._mode || pending.actor !== scene._active)) pending=null; render(); layout(); }
    return result;
  };
})();
