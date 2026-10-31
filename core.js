/* Shared simulation: runs locally for offline play and on the room server for paired devices. */
(function (root) {
  const AvatarArt=typeof module!=='undefined'&&module.exports?require('./avatars.js'):root.MoveRushAvatars;
  const LEVELS = {
    easy: {label:'Easy · Kid mode', speed:12, acceleration:.025, maxBoost:2, spacing:2.5, hp:5, jump:1.1, duck:1.15, inv:2.2, magnet:.64, hopGrace:3000, description:'Gentle pace, fewer obstacles, forgiving jumps. Bumps never end a kid’s solo adventure.'},
    normal: {label:'Normal', speed:19, acceleration:.09, maxBoost:8, spacing:1.35, hp:3, jump:.85, duck:.8, inv:1.4, magnet:.45, hopGrace:1900, description:'A balanced adventure with mixed obstacles and three chances in solo mode.'},
    hard: {label:'Hard', speed:27, acceleration:.13, maxBoost:10, spacing:.9, hp:2, jump:.72, duck:.65, inv:.95, magnet:.4, hopGrace:1500, description:'Faster running, denser obstacles, and tighter timing. Two chances in solo mode.'}
  };
  function cleanDistance(cfg, seconds) {
    const ramp = Math.min(seconds, cfg.maxBoost / cfg.acceleration);
    return cfg.speed * seconds + cfg.acceleration * ramp * ramp / 2 + cfg.maxBoost * (seconds-ramp);
  }
  class Game {
    constructor(options={}) {this.reset(options);}
    reset({mode='solo',difficulty='easy',seed=123456789,raceSeconds=300,appearances=[],playerCount=2}={}) {
      this.cfg=LEVELS[difficulty]||LEVELS.easy;
      this.state={mode:['race','pack'].includes(mode)?mode:'solo', difficulty:LEVELS[difficulty]?difficulty:'easy', seed:seed>>>0, raceSeconds, finishDistance:cleanDistance(this.cfg,raceSeconds), elapsed:0, distance:0, objects:[], effects:[], players:[], running:false, paused:false, phase:'lobby', countdown:3, preparationTime:0, winner:null, nextObject:0};
      const s=this.state;
      s.players=Array.from({length:s.mode==='pack'?Math.max(1,Math.min(15,Math.floor(playerCount)||1)):s.mode==='race'?2:1},(_,index)=>({name:'Runner '+(index+1),connected:true,dnf:false,lastPoseElapsed:-100,lane:0,x:0,jump:0,duck:0,coins:0,hp:this.cfg.hp,inv:0,finished:false,finishTime:null,travel:0,slow:0,bumps:0,motion:false,lastHop:0,spawnAt:24,pattern:0,speed:0,animation:0,ready:false,verified:false,cameraActive:false,calibrated:false,lastTracked:-100,gesture:'Waiting for movement',appearance:AvatarArt.normalize(Array.isArray(appearances)?appearances[index]||{id:index===1?2:0}:{id:index===1?2:0})}));
      return s;
    }
    prepare(){const s=this.state;s.running=false;s.phase='checking';s.countdown=3;s.paused=false;s.players.forEach(p=>{p.ready=false;p.verified=false;});return s;}
    start(){const s=this.state;s.running=true;s.phase='playing';s.elapsed=0;s.players.forEach(p=>{p.jump=0;p.duck=0;p.lastHop=s.mode==='pack'?-100:0;});return s;}
    random(){let n=this.state.seed;n^=n<<13;n^=n>>>17;n^=n<<5;this.state.seed=n>>>0;return (n>>>0)/4294967296;}
    action(action,index=0,value) {
      const s=this.state,p=s.players[index];if(!p)return;
      if(action==='appearance'){if(!s.running)p.appearance=AvatarArt.normalize(value);return;}
      const preparing=s.phase==='checking'||s.phase==='countdown';
      if(action==='camera'){p.motion=s.mode==='pack'||!!value;if(s.mode!=='pack')p.lastHop=s.elapsed;return;}
      if(action==='tracking'){
        p.cameraActive=!!value?.active;p.calibrated=!!value?.calibrated;
        if(value?.valid)p.lastTracked=s.preparationTime;
        if(preparing&&(!p.cameraActive||!p.calibrated)){p.ready=false;if(s.phase==='countdown'){s.phase='checking';s.countdown=3;}}
        return;
      }
      if(action==='ready'&&preparing){if(p.ready)return;
        if(value==='clap'&&(!p.cameraActive||!p.calibrated||!p.verified))return;
        p.ready=true;if(s.players.every(p=>p.ready)&&(s.mode!=='pack'||s.armed)){s.phase='countdown';s.countdown=3;}return;
      }
      if((!s.running&&!preparing)||s.paused||p.finished||p.hp<=0)return;
      if(action==='left'){p.lane=Math.max(-1,p.lane-1);p.verified=true;}
      if(action==='right'){p.lane=Math.min(1,p.lane+1);p.verified=true;}
      if(action==='jump'&&p.jump===0){p.jump=this.cfg.jump;p.verified=true;}
      if(action==='duck'){p.duck=this.cfg.duck;p.verified=true;}
      if(action==='pose'&&value){
        if(Number.isFinite(value.lane))p.lane=Math.max(-1,Math.min(1,Math.round(value.lane)));
        if(s.mode!=='pack'||value.valid&&value.calibrated&&value.active){if(value.hop)p.lastHop=s.elapsed;}if(value.valid&&value.calibrated&&value.active)p.lastPoseElapsed=s.elapsed;if(value.jump&&p.jump===0)p.jump=this.cfg.jump;if(value.duck)p.duck=this.cfg.duck;
        p.gesture=value.gesture|| (value.wave?'WAVE':value.jump?'JUMP':value.duck?'CROUCH':p.lane<0?'LEFT':p.lane>0?'RIGHT':'CENTER');
        if(value.wave||value.jump||value.duck||value.hop||value.lane)p.verified=true;
        if(value.active!==undefined)p.cameraActive=!!value.active;if(value.valid!==undefined){p.calibrated=!!value.valid&&!!value.calibrated;if(value.valid)p.lastTracked=s.preparationTime;if(preparing&&!p.calibrated){p.ready=false;if(s.phase==='countdown'){s.phase='checking';s.countdown=3;}}}
        if(value.clap&&preparing)this.action('ready',index,'clap');
      }
    }
    makePattern(owner,p) {
      // Same obstacle sequence at the same course distance, independent of each runner's speed.
      const n=p.pattern++,lane=((n*7+Math.floor(n/3))%3)-1;
      const type=(n%4===3||this.state.difficulty!=='easy'&&n%2)?'gate':'rock';
      const at=p.spawnAt;
      this.state.objects.push({id:++this.state.nextObject,owner,lane,z:at-p.travel+6,at,type,hit:[]});
      for(let k=0;k<4;k++)this.state.objects.push({id:++this.state.nextObject,owner,lane:lane===1?-1:lane+1,z:at+8+k*6-p.travel+6,at:at+8+k*6,type:'coin',hit:[]});
      p.spawnAt+=this.cfg.speed*this.cfg.spacing;
    }
    step(dt) {
      const s=this.state,cfg=this.cfg;dt=Math.max(0,Math.min(.1,dt));
      if(s.phase==='checking'||s.phase==='countdown'){
        s.preparationTime+=dt;s.players.forEach(p=>{p.x+=(p.lane-p.x)*Math.min(1,dt*12);p.jump=Math.max(0,p.jump-dt);p.duck=Math.max(0,p.duck-dt);p.animation+=dt;if(!p.dnf&&p.cameraActive&&s.preparationTime-p.lastTracked>2){p.calibrated=false;p.ready=false;if(s.phase==='countdown'){s.phase='checking';s.countdown=3;}}});
        if(s.phase==='countdown'&&!s.paused){s.countdown=Math.max(0,s.countdown-dt);if(s.countdown===0){this.start();return [{type:'begin'}];}}
        return [];
      }
      if(!s.running||s.paused)return [];
      if(s.mode==='pack'&&s.elapsed>=900){s.players.forEach(p=>{if(!p.finished){p.finished=true;p.dnf=true;p.finishTime=null;}});}
      const events=[];s.elapsed+=dt;
      s.effects.forEach(e=>e.life-=dt);s.effects=s.effects.filter(e=>e.life>0);
      s.players.forEach((p,index)=>{
        if(p.finished||p.hp<=0)return;
        p.x+=(p.lane-p.x)*Math.min(1,dt*12);p.jump=Math.max(0,p.jump-dt);p.duck=Math.max(0,p.duck-dt);p.inv=Math.max(0,p.inv-dt);
        const base=cfg.speed+Math.min(cfg.maxBoost,s.elapsed*cfg.acceleration);
        const hopping=s.mode==='pack'?p.connected&&p.cameraActive&&p.calibrated&&s.elapsed-p.lastHop<.75&&s.elapsed-p.lastPoseElapsed<.65:!p.motion||(s.elapsed-p.lastHop)*1000<cfg.hopGrace;
        p.speed=base*(p.slow>0?.38:1)*(hopping?1:s.mode==='pack'?0:.1);p.animation+=dt*(p.speed/base);
        const previous=p.travel;p.travel+=p.speed*dt;p.slow=Math.max(0,p.slow-dt);
        while(p.spawnAt<p.travel+140)this.makePattern(index,p);
        for(const o of s.objects){if(o.owner!==index)continue;if(s.mode!=='solo'&&o.at>s.finishDistance)continue;o.z=o.at-p.travel+6;if(o.at<previous||o.at>p.travel||o.hit.includes(index)||Math.abs(p.x-o.lane)>=(o.type==='coin'?cfg.magnet:.43))continue;
          o.hit.push(index);
          if(o.type==='coin'){o.collected=true;p.coins++;s.effects.push({lane:o.lane,z:6,life:.65,max:.65,player:index});events.push({type:'coin',player:index});}
          else if(!p.inv&&!(o.type==='rock'&&p.jump>.12)&&!(o.type==='gate'&&p.duck>0)){
            p.bumps++;p.inv=cfg.inv;p.slow=3;
            if(s.mode==='solo')p.hp=Math.max(s.difficulty==='easy'?1:0,p.hp-1);
            events.push({type:'bump',player:index});
          }
        }
        if(s.mode!=='solo'&&p.travel>=s.finishDistance){const fraction=p.speed>0?(p.travel-s.finishDistance)/p.speed:0;p.travel=s.finishDistance;p.finished=true;p.finishTime=s.elapsed-fraction;p.speed=0;events.push({type:'finish',player:index});}
      });
      s.objects=s.objects.filter(o=>!o.collected&&o.z>-10&&(s.mode==='solo'||o.at<=s.finishDistance));
      s.distance=s.players[0].travel;
      if(s.mode==='solo'&&s.players[0].hp<=0){s.running=false;s.phase='finished';events.push({type:'end'});}
      if(s.mode!=='solo'&&s.players.some(p=>p.finished)){const done=s.players.map((p,i)=>({p,i})).filter(v=>v.p.finished&&!v.p.dnf).sort((a,b)=>a.p.finishTime-b.p.finishTime);s.winner=!done.length||done.length>1&&Math.abs(done[0].p.finishTime-done[1].p.finishTime)<.001?null:done[0].i;}
      if(s.mode!=='solo'&&s.players.every(p=>p.finished)){
        const done=s.players.map((p,i)=>({p,i})).filter(v=>!v.p.dnf).sort((a,b)=>a.p.finishTime-b.p.finishTime);s.winner=!done.length||done.length>1&&Math.abs(done[0].p.finishTime-done[1].p.finishTime)<.001?null:done[0].i;s.running=false;s.phase='finished';events.push({type:'end'});
      }
      return events;
    }
    load(state){this.state=JSON.parse(JSON.stringify(state));this.cfg=LEVELS[this.state.difficulty];}
  }
  const api={Game,LEVELS,cleanDistance};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MoveRushCore=api;
})(globalThis);
