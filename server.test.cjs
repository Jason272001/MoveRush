const assert = require('node:assert/strict');
const {createServer,rooms,tick} = require('./server.cjs');
async function main(){
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;const streams=[];
 async function post(route,data={},token){const res=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});return {status:res.status,data:await res.json()};}
 async function open(client){const abort=new AbortController();const response=await fetch(base+'/api/rooms/'+client.code+'/events?token='+client.token,{signal:abort.signal});assert.equal(response.status,200);const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';
   const stream={async next(type){while(true){let end;while((end=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);if(block.startsWith('event: '+type+'\n'))return JSON.parse(block.split('\ndata: ')[1]);}const {value,done}=await reader.read();if(done)throw Error('Stream ended');buffer+=decoder.decode(value,{stream:true});}},close(){abort.abort();reader.cancel().catch(()=>{});}};streams.push(stream);return stream;}
 try{
  assert.equal((await fetch(base+'/')).status,200);assert.equal((await fetch(base+'/core.js')).status,200);assert.equal((await fetch(base+'/server.cjs')).status,404);
  const created=await post('/api/rooms',{mode:'race',difficulty:'easy'});assert.equal(created.status,201);const host=created.data;assert.match(host.code,/^[A-Z0-9]{6}$/);
  const route=op=>'/api/rooms/'+host.code+'/'+op;
  const s0=await open(host);assert.equal((await s0.next('state')).running,false);
  const c1=(await post(route('join'),{role:'controller',player:0})).data;
  const c2=(await post(route('join'),{role:'controller',player:1})).data;
  const screen2=(await post(route('join'),{role:'screen',player:1})).data;
  const sc1=await open(c1),sc2=await open(c2),ss2=await open(screen2);await sc1.next('state');await sc2.next('state');await ss2.next('state');
  assert.equal((await post(route('join'),{role:'controller',player:1})).status,409,'One phone per player');
  assert.equal((await post(route('start'),{},c2.token)).status,403,'Phones cannot start a match');
  assert.equal((await post(route('action'),{action:'left'})).status,401,'Controls need room credentials');
  assert.equal((await post(route('action'),{action:'camera',value:true},c1.token)).status,200);
  await post(route('action'),{action:'appearance',player:0,value:{id:5,color:'#eec76d',hat:'cap'}},c2.token);assert.equal(rooms.get(host.code).game.state.players[1].appearance.id,5);assert.equal(rooms.get(host.code).game.state.players[0].appearance.id,0);assert.equal((await post(route('start'),{},host.token)).status,200);assert.equal(rooms.get(host.code).game.state.players[1].appearance.id,5,'Avatar survives preparation reset');assert.equal(rooms.get(host.code).game.state.players[0].motion,true,'Phone camera association survives start');
  assert.equal(rooms.get(host.code).game.state.phase,'checking');await post(route('action'),{action:'ready',value:'button'},c1.token);await post(route('action'),{action:'ready',value:'button'},c2.token);for(let i=0;i<31;i++)tick(.1);
  await post(route('action'),{action:'right',player:0},c2.token);
  await post(route('action'),{action:'left',player:1},c1.token);
  tick(.05);const room=rooms.get(host.code);assert.equal(room.game.state.players[0].lane,-1);assert.equal(room.game.state.players[1].lane,1,'Phone cannot steer the other slot');
  // Read until the input-bearing state reaches every screen.
  for(const stream of [s0,ss2,sc1,sc2]){let state;do{state=await stream.next('state');}while(!state.elapsed||state.players[0].lane!==-1||state.players[1].lane!==1);assert.equal(state.players[0].lane,-1);assert.equal(state.players[1].lane,1);}
  await post(route('pause'),{},host.token);const elapsed=room.game.state.elapsed;tick(.05);assert.equal(room.game.state.elapsed,elapsed);
  await post(route('pause'),{},host.token);sc2.close();await new Promise(resolve=>setTimeout(resolve,30));assert.equal(room.game.state.paused,true,'Disconnect pauses all screens');assert.match(room.game.state.connectionNotice,/disconnected/);
  const restored=await fetch(base+route('status'),{headers:{Authorization:'Bearer '+c2.token}});assert.equal(restored.status,200);
  const reconnected=await open(c2);assert.equal((await reconnected.next('state')).paused,true);
  await post(route('pause'),{},host.token);assert.equal(room.game.state.paused,false);assert.equal(room.game.state.connectionNotice,'');
  await post(route('leave'),{},c1.token);assert.equal(room.game.state.players[0].motion,false);
  await post(route('leave'),{},host.token);assert.equal(rooms.has(host.code),false);assert.equal((await post(route('join'),{role:'screen',player:0})).status,404);
  const solo=(await post('/api/rooms',{mode:'solo'})).data;assert.equal((await post('/api/rooms/'+solo.code+'/join',{role:'controller',player:1})).status,400);await post('/api/rooms/'+solo.code+'/leave',{},solo.token);
  console.log('Passed: four-device room, code join, screen synchronization, isolated phone inputs, camera association, host permissions, pause/reconnect/resume, leave, expired rooms and solo slot validation.');
 }finally{for(const stream of streams)stream.close();for(const room of rooms.values())for(const c of room.clients.values())c.stream?.end();rooms.clear();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
