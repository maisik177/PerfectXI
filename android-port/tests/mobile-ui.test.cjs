const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const code = fs.readFileSync(require('node:path').join(__dirname,'../runtime/Tsubasa_MobileUI.js'),'utf8');
function harness() {
  const elements = new Map();
  const element = key => {
    if (!elements.has(key)) elements.set(key,{style:{},classList:{toggle(){}},innerHTML:'',hidden:false,setAttribute(){},addEventListener(type,fn){this[type]=fn;},append(){},querySelector:element,getBoundingClientRect(){return {left:10,top:100,width:600,height:200};}});
    return elements.get(key);
  };
  const actor = {actorId:()=>1,name:()=> 'Tsubasa',isActor:()=>true};
  function Match() { this._mode='move';this._active=actor;this._selected=actor;this._queue=[];this._pitch={_panelWidth:1000,_panelHeight:500,setCursorCell(){}};this._scoreboard={scores:()=>[0,0],homeName:()=> 'Japan',awayName:()=> 'Brazil'};this._reach=[{x:2,y:3}];this._cursor={x:0,y:0};this._actionWindow={deactivate(){},callHandler:k=>{this.called=k;}}; }
  Object.assign(Match.prototype,{isBattler:b=>!!b?.isActor,isHumanControlled:()=>true,availableActions:()=>[{name:'Pass',symbol:'pass',enabled:true},{name:'Shoot',symbol:'shoot',enabled:false}],updatePointer(){},screenToCell:()=>({x:2,y:3}),updateMoveReticle(){},drawPassPreview(){},onOk(){this.commits=(this.commits||0)+1;},onCancel(){this.cancels=(this.cancels||0)+1;},openMenu(){this._mode='menu';}});
  const match = new Match();
  const ctx={Scene_SoccerMatch:Match,SceneManager:{_scene:match,updateScene(){}},Graphics:{width:1048,height:652,_canvas:element('canvas'),pageToCanvasX:x=>x,pageToCanvasY:y=>y,_updateAllElements(){this.reset=true;}},Input:{virtualClick(){}},TouchInput:{isTriggered:()=>true,x:30,y:40},PluginManager:{parameters:()=>({})},Soccer:{Portrait:{nameFor:()=>''},Stamina:{get:b=>{assert.equal(typeof b.isActor,'function');return 50;},getMax:()=>100},Hyper:{get:()=>20},Skill:{get:()=>30},Stats:{SPD:()=>90},MatchClock:{displayTime:()=> '1:00'}},TsubasaMobile:{resolveAsset:s=>s},document:{createElement:element,head:{append(){}},body:{append(){}}},scrollX:0,scrollY:0};
  vm.runInNewContext(code,ctx);ctx.SceneManager.updateScene();
  const click = key => elements.get('main').click({target:{closest:()=>({disabled:false,dataset:{mobile:key}})},stopPropagation(){}});
  return {ctx,match,click,elements,actor};
}
test('field tap previews; confirmation commits exactly once',()=>{const h=harness();h.match.updatePointer();assert.equal(h.match.commits,undefined);h.click('confirm');h.click('confirm');assert.equal(h.match.commits,1);});
test('cancel clears pending target without undoing a completed action',()=>{const h=harness();h.match.updatePointer();h.click('cancel');h.click('confirm');assert.equal(h.match.commits,undefined);assert.equal(h.match.cancels,undefined);});
test('turn change invalidates pending confirmation',()=>{const h=harness();h.match.updatePointer();h.match._active={...h.actor,actorId:()=>2};h.ctx.SceneManager.updateScene();h.click('confirm');assert.equal(h.match.commits,undefined);});
test('only enabled engine actions dispatch through registered handlers',()=>{const h=harness();h.click('shoot');assert.equal(h.match.called,undefined);h.click('pass');assert.equal(h.match.called,'pass');assert.equal(h.match._mode,'menu');});
test('transient non-battler active state does not query stamina',()=>{const h=harness();h.match._active=true;assert.doesNotThrow(()=>h.ctx.SceneManager.updateScene());});
test('canvas touch maps using displayed rectangle, and exit restores graphics',()=>{const h=harness();assert.equal(h.ctx.Graphics.pageToCanvasX(310),524);assert.equal(h.ctx.Graphics.pageToCanvasY(200),326);h.ctx.SceneManager._scene={};h.ctx.SceneManager.updateScene();assert.equal(h.ctx.Graphics.reset,true);assert.equal(h.ctx.Graphics.pageToCanvasX(310),310);});

test('guide opened from pause is not covered by the mobile pause sheet',()=>{const h=harness();h.match._mode='pause';h.match._guideOpen=true;h.ctx.SceneManager.updateScene();assert.equal(h.elements.get('.mobile-sheet').hidden,true);});
