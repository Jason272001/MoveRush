const assert=require('node:assert/strict');
const {Game}=require('./core.js'),{PackRoom,cleanName}=require('./pack-room.js'),{Peer}=require('./peer-rooms.test.cjs');
const flush=()=>new Promise(r=>setImmediate(r));
const pose={active:true,valid:true,calibrated:true,hop:true,wave:true,lane:0};
async function main(){
 const g=new Game({mode:'pack',playerCount:15,raceSeconds:1});assert.equal(g.state.players.length,15);g.start();
 for(let i=0;i<15;i++)g.action('pose',i,pose);g.step(.1);assert.ok(g.state.players.every(p=>p.speed>0));
 for(let i=0;i<12;i++){for(let p=1;p<15;p++)g.action('pose',p,pose);g.step(.1);}
 assert.equal(g.state.players[0].speed,0,'stale motion stops at zero');assert.ok(g.state.players[1].travel>g.state.players[0].travel);
 const stopped=g.state.players[0].travel;for(let i=0;i<10;i++)g.step(.1);assert.equal(g.state.players[0].travel,stopped,'no idle creep');
 g.action('pose',0,pose);g.step(.1);assert.ok(g.state.players[0].speed>0);g.action('pose',0,{...pose,valid:false});g.step(.1);assert.equal(g.state.players[0].speed,0,'tracking loss stops immediately');
 for(let i=0;i<100;i++){for(let p=0;p<15;p++)g.action('pose',p,pose);g.step(.1);}assert.ok(g.state.players.every(p=>p.finished));assert.equal(g.state.phase,'finished');assert.notEqual(g.state.winner,0);
 const shared=new Game({mode:'pack',playerCount:15});shared.start();for(let i=0;i<15;i++)shared.action('pose',i,pose);shared.step(.1);const course=i=>shared.state.objects.filter(o=>o.owner===i).map(({lane,at,type})=>({lane,at,type}));for(let i=1;i<15;i++)assert.deepEqual(course(i),course(0),'identical course pattern');
 const timeout=new Game({mode:'pack',playerCount:3});timeout.start();timeout.state.elapsed=900;timeout.step(.1);assert.equal(timeout.state.phase,'finished');assert.equal(timeout.state.winner,null);assert.ok(timeout.state.players.every(p=>p.dnf));
 const opened=[];const make=()=>{const received=[];const r=new PackRoom({Peer,onState:s=>received.push(structuredClone(s))});opened.push(r);r.received=received;return r;};
 try{
  const host=make();await host.create({name:'John'});clearInterval(host.timer);const clients=[];
  for(let i=1;i<15;i++){const r=make();await r.join({code:host.code,name:'Runner '+i});clients.push(r);}
  assert.equal(host.game.state.players.length,15);assert.deepEqual(clients.map(c=>c.player),Array.from({length:14},(_,i)=>i+1));
  const excess=make();await assert.rejects(()=>excess.join({code:host.code,name:'Extra'}),/15 runners/);
  const invalidPhone=make();await assert.rejects(()=>invalidPhone.join({code:host.code,role:'controller',token:'wrong'}),/private phone link/);
  const phone=make();await phone.join({code:host.code,role:'controller',token:clients[0].token});assert.equal(phone.player,1);
  assert.throws(()=>clients[0].launch(),/host/);assert.throws(()=>host.launch(),/Every runner/);
  host.action('pose',pose);host.action('ready','button');for(const c of clients){(c.player===1?phone:c).action('pose',pose);c.action('ready','button');}await flush();
  assert.equal(host.game.state.phase,'checking','host controls the start');host.launch();
  for(let i=0;i<31;i++){host.action('pose',pose);for(const c of clients)(c.player===1?phone:c).action('pose',pose);await flush();host.tick(.1);}await flush();assert.equal(host.game.state.phase,'playing');
  for(let i=0;i<3;i++){host.action('pose',pose);for(const c of clients)(c.player===1?phone:c).action('pose',{...pose,lane:c.player===14?1:0});await flush();host.tick(.1);}await flush();
  assert.equal(host.game.state.players[14].lane,1);assert.equal(host.game.state.players[0].lane,0);for(const c of clients){const s=c.received.at(-1);assert.equal(s.players.length,15);assert.ok(s.objects.every(o=>o.owner===c.player),'only own course objects sent');}
  phone.action('pose',{...pose,lane:-1});clients[0].action('pose',{...pose,lane:1});await flush();assert.equal(host.game.state.players[1].lane,-1,'paired camera owns motion');
  const reconnectToken=clients[13].token;clients[13].connection.close();await flush();host.tick(.1);assert.equal(host.game.state.players[14].speed,0);assert.equal(host.game.state.paused,false,'one disconnect does not pause others');
  const rejoined=make();await rejoined.join({code:host.code,token:reconnectToken,name:'Back'});assert.equal(rejoined.player,14);assert.equal(host.game.state.players.length,15);rejoined.action('pose',pose);await flush();host.tick(.1);assert.ok(host.game.state.players[14].speed>0);
  host.close();await flush();assert.ok(clients[0].closed);
 }finally{for(const r of opened)r.close();}
 assert.equal(cleanName('<John>\n'),'John');console.log('Passed: 15 runners, capacity, identical courses, zero idle speed, tracking loss, finish order, timeout, synchronized host start, isolated inputs, private paired cameras, filtered snapshots, disconnect and rejoin.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
