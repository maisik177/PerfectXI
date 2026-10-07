const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function fixture(fetchOverride) {
  class Events {
    constructor() { this.events = new Map(); }
    addEventListener(k, f) { if (!this.events.has(k)) this.events.set(k, new Set()); this.events.get(k).add(f); }
    removeEventListener(k, f) { this.events.get(k)?.delete(f); }
    emit(k) { for (const f of this.events.get(k) || []) f(); }
  }
  const el = new Events();
  Object.assign(el, { pause() { this.paused = true; }, play() { this.paused = false; return Promise.resolve(); }, load() {}, removeAttribute() { this.src = ''; }, muted: true, videoWidth:1280, videoHeight:720 });
  const document = new Events(); document.hidden = false;
  const revokes = [], timers = new Map(), store = new Map(); let timer = 0;
  function Base() {}
  Base.prototype.create = Base.prototype.update = Base.prototype.terminate = function() {};
  function Intro() {}
  Intro.prototype = Object.create(Base.prototype);
  Intro.prototype.addChild = function() {};
  Intro.prototype.goTitle = function() { this.title = true; };
  const response = { ok:true, headers:{get:()=> '10'}, blob: async()=>({size:10}) };
  const c = { Scene_OpeningMovie:Intro, Scene_Base:Base, ScreenSprite:class {setColor(){}},
    Scene_SoccerMatch:{OPENING_MOVIES:['TsubasaOpening1','TsubasaOpening2']}, Soccer:{},
    AudioManager:{stopBgm(){},stopBgs(){},stopMe(){},stopSe(){}},
    Video:{_element:el,_volume:0.7,_updateVisibility(v){this.visible=v;}}, document,
    localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},
    Input:{clear(){},isTriggered:()=>false},TouchInput:{clear(){},isTriggered:()=>false},
    fetch:fetchOverride || (async()=>response), AbortController,
    URL:{createObjectURL:()=> 'blob:local',revokeObjectURL:u=>revokes.push(u)},
    setTimeout:f=>{timers.set(++timer,f);return timer;},clearTimeout:i=>timers.delete(i),
    console:{log(){},warn(){}} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../runtime/Tsubasa_MobileIntro.js'),'utf8'), c);
  const scene = new Intro(); scene.create();
  return {c,scene,el,document,revokes,timers,response};
}
test('Intro plays local Blob with embedded audio and cleans up on natural end', async()=>{
  const {scene,c,el,revokes} = fixture();
  await scene._introPromise;
  assert.equal(el.src,'blob:local'); assert.equal(el.muted,false); assert.equal(el.volume,0.7);
  el.emit('playing'); assert.equal(c.Video.visible,true); assert.equal(c.Video._loading,false);
  el.emit('ended'); scene.update();
  assert.equal(scene.title,true); assert.equal(el.paused,true);
  assert.deepEqual(revokes,['blob:local']); assert.equal(el.src,'');
  scene.terminate(); assert.equal(revokes.length,1);
});
test('Leaving while fetch is pending aborts and never starts late playback',async()=>{
  let resolveFetch;
  const {scene,el,response,revokes} = fixture(()=>new Promise(r=>resolveFetch=r));
  scene.terminate(); assert.equal(scene._introAbort.signal.aborted,true);
  resolveFetch(response); await scene._introPromise;
  assert.equal(el.src,''); assert.equal(revokes.length,0);
});
test('Existing skip input cancels loading and returns to title',async()=>{
  const {scene,c} = fixture(); await scene._introPromise;
  scene._introFrames=31; c.Input.isTriggered=k=>k==='ok'; scene.update();
  assert.equal(scene.title,true); assert.equal(scene._introClosed,true);
});
test('Video pauses in background and resumes without an independent audio clock',async()=>{
  const {scene,document,el} = fixture(); await scene._introPromise;
  document.hidden=true; document.emit('visibilitychange'); assert.equal(el.paused,true);
  document.hidden=false; document.emit('visibilitychange'); assert.equal(el.paused,false);
  scene.terminate(); document.emit('visibilitychange'); assert.equal(el.paused,true);
});
test('HTTP failure, oversized or incomplete media falls back without uncaught errors',async()=>{
  for (const response of [
    {ok:false,status:404},
    {ok:true,headers:{get:()=>String(49*1024*1024)}},
    {ok:true,headers:{get:()=> '10'},blob:async()=>({size:9})}
  ]) {
    const {scene}=fixture(async()=>response); await scene._introPromise; scene.update();
    assert.equal(scene.title,true); assert.equal(scene._introClosed,true);
  }
});
test('Movie rotation survives restart using the stored index',async()=>{
  const {scene,c}=fixture(); await scene._introPromise; scene.terminate();
  const next=new c.Scene_OpeningMovie(); next.create(); await next._introPromise;
  assert.equal(next._introName,'TsubasaOpening2'); next.terminate();
});
