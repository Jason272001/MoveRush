const assert=require('node:assert/strict');
const {Game,LEVELS,cleanDistance}=require('./core.js');
const run=(g,seconds)=>{for(let t=0;t<seconds;t+=.05)g.step(.05);};
const game=new Game();game.start();game.step(.01);let p=game.state.players[0];
// Place objects just ahead of the runner, independent of generated course objects.
const place=(g,type,owner=0,lane=0)=>{const p=g.state.players[owner];g.state.objects.push({owner,lane,at:p.travel+.01,z:6.01,type,hit:[]});};
place(game,'coin');let events=game.step(.02);assert.equal(p.coins,1);assert.ok(events.some(e=>e.type==='coin'));assert.ok(!game.state.objects.some(o=>o.collected));game.step(.02);assert.equal(p.coins,1);
place(game,'rock');game.action('jump');game.step(.02);assert.equal(p.bumps,0);
p.jump=0;place(game,'gate');game.action('duck');game.step(.02);assert.equal(p.bumps,0);
p.duck=0;p.hp=1;place(game,'rock');game.step(.02);assert.equal(p.hp,1);assert.equal(p.slow,3);
// Endless solo has no distance finish.
for(const difficulty of Object.keys(LEVELS)){const g=new Game({difficulty});g.start();g.state.players[0].travel=100000;g.state.players[0].spawnAt=100100;g.step(.02);assert.equal(g.state.running,true);}
const chase=new Game({difficulty:'hard'});chase.start();chase.state.players[0].hp=1;place(chase,'rock');chase.step(.02);assert.equal(chase.state.running,false);
const race=new Game({mode:'race',difficulty:'normal'});race.start();const [a,b]=race.state.players;
place(race,'rock',1);race.step(.02);assert.equal(a.bumps,0);assert.equal(b.bumps,1);assert.equal(b.hp,3,'Race bumps slow instead of eliminating');assert.ok(a.travel>b.travel || b.slow>0);
a.spawnAt=b.spawnAt=1e9;race.state.objects=[];
// An ideal clean runner reaches the distance in approximately five minutes.
run(race,300);assert.equal(a.finished,true);assert.equal(b.finished,false,'Collision makes second runner finish later');assert.equal(race.state.running,true,'First finisher waits while second keeps running');
run(race,8);assert.equal(b.finished,true);assert.equal(race.state.running,false);assert.equal(race.state.winner,0);assert.ok(b.finishTime>a.finishTime);assert.ok(Math.abs(a.finishTime-300)<.12);
const independent=new Game({mode:'race'});independent.start();place(independent,'coin',0);place(independent,'coin',1);independent.state.players[1].lane=1;independent.state.players[1].x=1;independent.step(.02);assert.equal(independent.state.players[0].coins,1);assert.equal(independent.state.players[1].coins,0);assert.ok(independent.state.objects.some(o=>o.owner===1&&o.type==='coin'));
independent.action('left',0);independent.action('right',1);assert.equal(independent.state.players[0].lane,-1);assert.equal(independent.state.players[1].lane,1);
const motion=new Game();motion.start();motion.action('camera',0,true);motion.action('pose',0,{lane:-1,hop:true,jump:true});assert.equal(motion.state.players[0].lane,-1);assert.ok(motion.state.players[0].jump>0);motion.state.players[0].lastHop=-100;motion.step(.02);assert.ok(motion.state.players[0].speed<2);motion.action('pose',0,{hop:true});motion.step(.02);assert.ok(motion.state.players[0].speed>=12);
const paused=motion.state.players[0].travel;motion.state.paused=true;motion.step(.05);assert.equal(motion.state.players[0].travel,paused);
for(const cfg of Object.values(LEVELS))assert.ok(cleanDistance(cfg,300)>cfg.speed*300);
console.log('Passed: endless solo, kid protection, pickup removal, jumping/sliding, independent courses, 5-minute clean race, slowdown changes winner, finish order, motion commands and pause.');

const readyGame=new Game({mode:'race'});readyGame.prepare();readyGame.action('ready',0,'clap');assert.equal(readyGame.state.players[0].ready,false,'Untracked claps cannot start a player');
function cameraReady(g,i){g.action('tracking',i,{active:true,valid:true,calibrated:true});g.action('pose',i,{valid:true,calibrated:true,wave:true,lane:0});g.action('ready',i,'clap');}
cameraReady(readyGame,0);assert.equal(readyGame.state.players[0].ready,true);assert.equal(readyGame.state.phase,'checking','One clap cannot start a two-player race');readyGame.step(.1);assert.equal(readyGame.state.elapsed,0,'No racing during movement checks');cameraReady(readyGame,1);assert.equal(readyGame.state.phase,'countdown');for(let n=0;n<31;n++){for(let i=0;i<2;i++)readyGame.action('tracking',i,{active:true,valid:true,calibrated:true});readyGame.step(.1);}assert.equal(readyGame.state.phase,'playing');assert.ok(readyGame.state.elapsed<.15,'Race clock starts after countdown');
const lost=new Game({mode:'race'});lost.prepare();cameraReady(lost,0);cameraReady(lost,1);for(let n=0;n<22;n++)lost.step(.1);assert.equal(lost.state.phase,'checking','Lost tracking cancels countdown');assert.equal(lost.state.running,false);
const manual=new Game();manual.prepare();manual.action('ready',0,'button');for(let n=0;n<31;n++)manual.step(.1);assert.equal(manual.state.running,true,'Manual readiness remains available');console.log('Passed: tracked clap readiness, both-player gate, shared countdown, clean race clock, lost-tracking cancellation and keyboard fallback.');
