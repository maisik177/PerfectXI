const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
const code = fs.readFileSync(path.join(__dirname,'../runtime/Tsubasa_MobileStorage.js'),'utf8');
function fixture(store = new Map()) {
  let career = {name:'Fixture',day:4,season:2};
  const c = {TsubasaMobile:{}, console:{error(){}}, JsonEx:JSON,
    $gameSystem:{_soccerDream:career,onBeforeSave(){}},
    DataManager:{makeSaveContents:()=>({system:{_soccerDream:career}})},
    Soccer:{Dream:{get:()=>career,SAVE_KEY:'dream'},Success:{get:()=>career,MAX_SLOTS:3}},
    localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},
    StorageManager:{saveObject:async(k,v)=>store.set(k,JSON.stringify(v))},
    SoundManager:{playSave(){},playBuzzer(){}},SceneManager:{goto(){c.left=true}},Scene_Title:function(){}
  };
  vm.runInNewContext(code,c); return {c,store,career};
}
test('Success persists across fresh runtime; cache changes only after committed write',()=>{
  const {c,store,career}=fixture(); assert.equal(c.Soccer.Success.saveToSlot(1),true);
  const next=fixture(store); assert.equal(next.c.Soccer.Success.loadSlots()[1].name,'Fixture');
  assert.equal(next.c.Soccer.Success.loadSlots()[1].slot,1);
  career.name='Changed'; c.localStorage.setItem=()=>{throw Error('QuotaExceededError');};
  assert.equal(c.Soccer.Success.saveToSlot(1),false); assert.equal(c.Soccer.Success.loadSlots()[1].name,'Fixture');
  assert.equal(fixture(store).c.Soccer.Success.loadSlots()[1].name,'Fixture');
  assert.ok(c.TsubasaMobile.lastStorageError);
});
test('Success refuses invalid slots and protects unreadable existing data',()=>{
  const store=new Map([['tsubasa.mobile.success.v1','broken']]); const {c}=fixture(store);
  for(const i of [-1,3,NaN,1.5]) assert.equal(c.Soccer.Success.saveToSlot(i),false);
  assert.equal(c.Soccer.Success.saveToSlot(0),false); assert.equal(store.get('tsubasa.mobile.success.v1'),'broken');
});
test('Success delete is durable and failed deletion preserves original',()=>{
  const {c,store}=fixture(); c.Soccer.Success.saveToSlot(0);
  c.localStorage.setItem=()=>{throw Error('denied');}; assert.equal(c.Soccer.Success.deleteSlot(0),false);
  assert.ok(c.Soccer.Success.loadSlots()[0]);
  const next=fixture(store); assert.equal(next.c.Soccer.Success.deleteSlot(0),true);
  assert.equal(fixture(store).c.Soccer.Success.loadSlots()[0],null);
});
test('Dream awaits durable write, snapshots data and deduplicates concurrent requests',async()=>{
  const {c,career}=fixture(); let finish, snapshot, calls=0;
  c.StorageManager.saveObject=(k,v)=>{calls++;snapshot=v;return new Promise(r=>finish=r);};
  const p=c.Soccer.Dream.saveCareer(); assert.equal(c.Soccer.Dream.saveCareer(),p);
  assert.equal(career.savedAtDay,undefined); career.day=5; finish(); assert.equal(await p,true);
  assert.equal(calls,1); assert.equal(snapshot.system._soccerDream.day,4); assert.equal(career.savedAtDay,4);
});
test('Dream rejection preserves save markers and save-and-exit stays in scene',async()=>{
  const {c,career}=fixture(); career.savedAtDay=2;
  c.StorageManager.saveObject=async()=>{throw Error('disk full');};
  const scene={draw(){},_quit:true}; c.SceneManager._scene=scene;
  assert.equal(await c.TsubasaMobile.saveDreamUI(scene,true),false);
  assert.equal(career.savedAtDay,2); assert.equal(c.left,undefined); assert.equal(scene._mobileSaving,false);
  assert.equal(scene._quit,false); assert.match(scene._msg,/failed/);
});
test('Dream save-and-exit navigates only after success',async()=>{
  const {c}=fixture(); const scene={draw(){}}; c.SceneManager._scene=scene;
  assert.equal(await c.TsubasaMobile.saveDreamUI(scene,true),true); assert.equal(c.left,true);
});
test('Dream preserves global-progress save and reports its failure',async()=>{
  const {c,career}=fixture(); let calls=0;
  c.Soccer.Global={save(){calls++;return false;}};
  assert.equal(await c.Soccer.Dream.saveCareer(),false);
  assert.equal(calls,1);assert.equal(career.savedAtDay,undefined);
});
test('UI handles unexpected rejected saver without navigating or remaining locked',async()=>{
  const {c}=fixture(); c.Soccer.Dream.saveCareer=async()=>{throw Error('unexpected');};
  const scene={draw(){}}; c.SceneManager._scene=scene;
  assert.equal(await c.TsubasaMobile.saveDreamUI(scene,true),false);
  assert.equal(scene._mobileSaving,false);assert.equal(c.left,undefined);
});
