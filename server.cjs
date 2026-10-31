const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {Game} = require('./core.js');
const rooms = new Map();
const TTL = 2 * 60 * 60 * 1000;
const publicFiles = new Set(['pack.html','pack.css','pack.js','pack-room.js','index.html','style.css','game.js','core.js','rooms.js','motion.js','avatars.js','peer-rooms.js','scenery.js','vendor/peerjs.min.js','vendor/peerjs-LICENSE.txt']);
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
function fail(status,message){const e=new Error(message);e.status=status;throw e;}
async function body(req){let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>8192)fail(413,'Request too large');chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{fail(400,'Invalid JSON');}}
function token(){return crypto.randomBytes(24).toString('hex');}
function code(){let result;do{result=Array.from(crypto.randomBytes(6),v=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[v%32]).join('');}while(rooms.has(result));return result;}
function members(room){return [...room.clients.values()].map(c=>({role:c.role,player:c.player,connected:!!c.stream}));}
function send(client,event,data){if(client.stream&&!client.stream.destroyed){if(client.stream.writableLength>256*1024){client.stream.destroy();return;}client.stream.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);}}
function broadcast(room,event,data){for(const c of room.clients.values())send(c,event,data);}
function roomInfo(room){return {code:room.code,mode:room.game.state.mode,difficulty:room.game.state.difficulty,members:members(room)};}
function newClient(room,role,player){const c={token:token(),role,player,stream:null,lastSeen:Date.now(),lastInput:0};room.clients.set(c.token,c);return c;}
function credentials(room,c){return {...roomInfo(room),token:c.token,role:c.role,player:c.player,state:room.game.state};}
const handler=async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(req.method==='POST'&&req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)fail(403,'Use this server’s own game page');
    if(url.pathname==='/api/config'&&req.method==='GET'){
      const secure=!!req.socket.encrypted||req.headers['x-forwarded-proto']==='https';
      const port=process.env.PORT||3000;
      const lan=Object.values(os.networkInterfaces()).flat().filter(n=>n.family==='IPv4'&&!n.internal).map(n=>`${secure?'https':'http'}://${n.address}:${port}`);
      return json(res,200,{lan,secure});
    }
    if(url.pathname==='/api/rooms'&&req.method==='POST'){
      if(rooms.size>=100)fail(503,'Room capacity reached. Try later.');
      const options=await body(req);const room={code:code(),game:new Game({mode:options.mode,difficulty:options.difficulty,appearances:options.appearances}),clients:new Map(),touched:Date.now(),hostMissing:0};
      rooms.set(room.code,room);const c=newClient(room,'host',0);room.host=c.token;return json(res,201,credentials(room,c));
    }
    const match=url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})\/(join|status|events|action|start|pause|leave)$/);
    if(match){
      const room=rooms.get(match[1]);if(!room)fail(404,'Room not found or expired. Check the six-character code.');room.touched=Date.now();
      const operation=match[2];
      if(operation==='join'&&req.method==='POST'){
        const data=await body(req),role=data.role==='controller'?'controller':'screen',player=Number(data.player);
        if(!Number.isInteger(player)||player<0||player>=room.game.state.players.length)fail(400,'That player is not in this room.');
        if(room.clients.size>=8)fail(409,'Room is full.');
        if([...room.clients.values()].some(c=>c.role===role&&c.player===player&&(c.stream||Date.now()-c.lastSeen<15000)))fail(409,`Player ${player+1} already has a ${role} connected. Choose another player or disconnect that device.`);
        for(const [key,stale] of room.clients)if(stale.role===role&&stale.player===player&&!stale.stream)room.clients.delete(key);
        const c=newClient(room,role,player);broadcast(room,'members',roomInfo(room));return json(res,200,credentials(room,c));
      }
      const access=req.headers.authorization?.replace(/^Bearer /,'')||url.searchParams.get('token');const client=room.clients.get(access);if(!client)fail(401,'Room access expired. Join again.');client.lastSeen=Date.now();
      if(operation==='status'&&req.method==='GET')return json(res,200,credentials(room,client));
      if(operation==='events'&&req.method==='GET'){
        const oldStream=client.stream;client.stream=null;oldStream?.end();res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(': connected\n\n');client.stream=res;
        send(client,'state',room.game.state);broadcast(room,'members',roomInfo(room));req.on('close',()=>{if(client.stream===res){client.stream=null;client.lastSeen=Date.now();if(room.game.state.running){room.game.state.paused=true;room.game.state.connectionNotice='A device disconnected. Reconnect, then resume on the main screen.';broadcast(room,'state',room.game.state);}broadcast(room,'members',roomInfo(room));}});return;
      }
      if(operation==='action'&&req.method==='POST'){
        client.lastInput=Date.now();
        const data=await body(req);if(!['left','right','jump','duck','pose','camera','tracking','ready','appearance'].includes(data.action))fail(400,'Unknown control.');
        const player=client.role==='host'?Number(data.player??0):client.player;if(!Number.isInteger(player)||!room.game.state.players[player])fail(400,'Unknown player.');
        let value=data.value;if(data.action==='pose'){value={lane:Number.isFinite(value?.lane)?value.lane:undefined,hop:!!value?.hop,jump:!!value?.jump,duck:!!value?.duck,wave:!!value?.wave,clap:!!value?.clap,active:value?.active===undefined?undefined:!!value.active,valid:value?.valid===undefined?undefined:!!value.valid,calibrated:!!value?.calibrated,gesture:typeof value?.gesture==='string'?value.gesture.slice(0,50):undefined};}
        if(data.action==='tracking')value={active:!!value?.active,valid:!!value?.valid,calibrated:!!value?.calibrated};
        if(data.action==='ready')value=value==='clap'?'clap':'button';
        if(data.action==='camera'){client.camera=!!value;client.cameraPlayer=player;client.cameras??={};client.cameras[player]=!!value;}room.game.action(data.action,player,value);return json(res,200,{ok:true});
      }
      if(operation==='start'&&req.method==='POST'){
        if(client.role!=='host')fail(403,'The main screen starts the game.');const current=room.game.state;room.game.reset({mode:current.mode,difficulty:current.difficulty,seed:crypto.randomBytes(4).readUInt32BE(),appearances:current.players.map(p=>p.appearance)});
        // Keep camera-driven players connected across a restart.
        for(const c of room.clients.values())for(const [player,enabled] of Object.entries(c.cameras||{}))if(enabled)room.game.action('camera',Number(player),true);
        room.game.prepare();broadcast(room,'state',room.game.state);return json(res,200,{ok:true});
      }
      if(operation==='pause'&&req.method==='POST'){
        if(client.role!=='host')fail(403,'The main screen controls pause.');room.game.state.paused=!room.game.state.paused;room.game.state.connectionNotice='';broadcast(room,'state',room.game.state);return json(res,200,{ok:true});
      }
      if(operation==='leave'&&req.method==='POST'){
        if(client.role==='controller'){client.camera=false;room.game.action('camera',client.player,false);}
        client.stream?.end();room.clients.delete(client.token);
        if(client.role==='host'){broadcast(room,'closed',{message:'The main screen closed this room.'});for(const c of room.clients.values())c.stream?.end();rooms.delete(room.code);}else broadcast(room,'members',roomInfo(room));
        return json(res,200,{ok:true});
      }
      fail(405,'Unsupported request.');
    }
    if(req.method!=='GET'&&req.method!=='HEAD')fail(405,'Unsupported request.');
    const file=url.pathname==='/'?'index.html':url.pathname.slice(1);if(!publicFiles.has(file))fail(404,'Not found');
    const content=fs.readFileSync(path.join(__dirname,file));res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(req.method==='HEAD'?undefined:content);
  }catch(e){if(!res.headersSent)json(res,e.status||500,{error:e.status?e.message:'Server error'});else res.end();}
};
function tick(dt){for(const room of rooms.values()){room.game.step(dt);broadcast(room,'state',room.game.state);}}
function createServer(){return process.env.TLS_CERT&&process.env.TLS_KEY?https.createServer({cert:fs.readFileSync(process.env.TLS_CERT),key:fs.readFileSync(process.env.TLS_KEY)},handler):http.createServer(handler);}
if(require.main===module){
  const port=Number(process.env.PORT||3000),server=createServer();let previous=performance.now();
  const timer=setInterval(()=>{const now=performance.now();tick(Math.min(.1,(now-previous)/1000));previous=now;},66);
  const cleanup=setInterval(()=>{const now=Date.now();for(const [id,room] of rooms){for(const [key,c] of room.clients){if(c.stream){c.lastSeen=now;c.stream.write(': heartbeat\n\n');}else if(key!==room.host&&now-c.lastSeen>60000)room.clients.delete(key);}if(now-room.touched>TTL||!([...room.clients.values()].some(c=>c.stream))&&now-room.touched>120000){broadcast(room,'closed',{message:'Room expired.'});for(const c of room.clients.values())c.stream?.end();rooms.delete(id);}}},15000);
  server.listen(port,process.env.HOST||'0.0.0.0',()=>console.log(`MoveRush ready at ${process.env.TLS_CERT?'https':'http'}://localhost:${port} (LAN-enabled; rooms are temporary)`));
  server.on('close',()=>{clearInterval(timer);clearInterval(cleanup);});
}
module.exports={createServer,rooms,tick};
