// Development-server-only integration probe, never included by the build script.
// Calls existing scene methods; does not change input mapping or match logic.
(() => {
  if (location.port !== '8175') throw Error('Use isolated match-test origin on port 8175');
  const panel = document.createElement('pre'); panel.id='mobile-match-test';
  panel.style.cssText='position:fixed;bottom:0;left:0;z-index:99999;background:#102438;color:white;padding:8px;font:12px monospace;max-width:95vw;white-space:pre-wrap';
  document.body.appendChild(panel);
  let stage=0, since=Date.now(), ticks=0;
  const trace=[];
  function log(s){trace.push(s);panel.textContent=trace.join('\n');console.log('[Match probe]',s);}
  log('Waiting for actual game boot; input mapping unchanged.');
  const timer=setInterval(()=>{
    try {
      if(Date.now()-since>120000) throw Error('Timed out, stage '+stage);
      if(typeof SceneManager==='undefined'||!SceneManager._scene||SceneManager.isSceneChanging()) return;
      const sc=SceneManager._scene;
      if(stage===0 && typeof Scene_FriendlyMatchup!=='undefined' && typeof $dataSystem!=='undefined' && $dataSystem && typeof $gameSystem!=='undefined' && $gameSystem){
        if(typeof Video!=='undefined' && Video._element){Video._element.pause();Video._element.style.display='none';}
        Soccer.Match._localMode='1p'; SceneManager.goto(Scene_FriendlyMatchup); stage=1; log('Opened actual Friendlies team-selection scene.');
      } else if(stage===1 && sc instanceof Scene_FriendlyMatchup && sc._teams?.length && sc._panel) {
        const unlocked=sc._teams.map((name,i)=>({name,i})).filter(t=>!sc.teamLocked(t.name));
        if(unlocked.length<2) throw Error('Fewer than two unlocked teams');
        sc._you=unlocked[0].i;sc._opp=unlocked[1].i;
        log('Teams: '+unlocked[0].name+' vs '+unlocked[1].name); sc.play(); stage=2;
      } else if(stage===2 && sc instanceof Scene_MatchSetup && sc._sprite) {
        log('Entered actual pre-match setup.'); sc.kickOff(); stage=3;
      } else if(stage===3 && typeof Scene_MatchPrep!=='undefined' && sc instanceof Scene_MatchPrep) {
        log('Starting from actual line-up preparation.'); sc.commandStart(); stage=4;
      } else if(stage===4 && typeof Scene_PreMatch!=='undefined' && sc instanceof Scene_PreMatch && sc._home && sc._away) {
        log('Ceremony initialized; completing ceremony for smoke test.'); sc.finish(); stage=5;
      } else if(stage>=3 && stage<6 && sc instanceof Scene_SoccerMatch && sc._pitch) {
        if(++ticks<20)return;
        const players=Soccer.Core.allMatchParticipants();
        if(players.length<22) throw Error('Missing participants: '+players.length);
        log('PASS: offline match rendered with '+players.length+' participants; mode='+sc._mode+'.');
        sc.startKickoff(); stage=6; ticks=0;
      } else if(stage===6 && sc instanceof Scene_SoccerMatch) {
        if(++ticks<20)return;
        if(sc._awaitingKickoff || !sc._active) throw Error('Kickoff did not activate a player');
        log('PASS: after kickoff, mode='+sc._mode+', active='+(sc._active?.name?.()||'none')+'.');
        clearInterval(timer);
      }
    } catch(e){log('FAIL: '+e.stack);clearInterval(timer);}
  },250);
})();

