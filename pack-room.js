/* 15-runner authoritative star topology. Camera frames never leave the device. */
(function(root){
 const Core=typeof module!=='undefined'&&module.exports?require('./core.js'):root.MoveRushCore;
 const Base=typeof module!=='undefined'&&module.exports?require('./peer-rooms.js').PeerRoom:root.MoveRushPeerRoom;
 const cleanName=value=>String(value||'Runner').replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,24)||'Runner';
 class PackRoom {
  constructor(options={}){this.options=options;this.clients=new Map();this.tokens=new Map();this.closed=false;this.player=0;this.role='screen';}
  async open(id){this.bridge=new Base({Game:Core.Game,Peer:this.options.Peer,onStatus:m=>this.options.onStatus?.(m)});await this.bridge.openPeer(id||'moverush-pack-device-'+crypto.randomUUID());this.peer=this.bridge.peer;}
  send(connection,data){if(connection?.open&&connection.bufferSize<4)connection.send(data);}
  view(index){const s=this.game.state;const keys=['name','connected','dnf','finished','finishTime','appearance','x','lane','animation','jump','duck','ready','calibrated','verified','cameraActive','coins','travel','speed','slow','bumps'];return {...s,players:s.players.map(p=>Object.fromEntries(keys.map(k=>[k,p[k]]))),objects:s.objects.filter(o=>o.owner===index),effects:s.effects.filter(e=>e.player===index)};}
  publish(){if(!this.game)return;this.options.onState?.(this.view(0));for(const c of this.clients.values())this.send(c.connection,{type:'state',state:this.view(c.player)});}
  async create({name,difficulty='easy',appearance}={}){
   this.host=true;this.code=Array.from(crypto.getRandomValues(new Uint8Array(6)),n=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n%32]).join('');
   await this.open('moverush-pack-v1-'+this.code);this.game=new Core.Game({mode:'pack',difficulty,playerCount:1,appearances:[appearance]});this.game.prepare();
   this.game.state.players[0].name=cleanName(name);this.token=crypto.randomUUID();this.tokens.set(this.token,0);
   this.peer.on('connection',c=>this.accept(c));this.lastTick=performance.now();this.timer=setInterval(()=>this.tick(),100);this.publish();return this;
  }
  accept(connection){let client;const timeout=setTimeout(()=>connection.close(),10000);connection.on('data',m=>{try{
   if(!client){
    if(m?.type!=='join')throw Error('Join the race first.');const controller=m.role==='controller';let index=this.tokens.get(m.token);
    if(controller&&index===undefined)throw Error('Open the private phone link from your own race screen.');
    if(index!==undefined&&this.game.state.players[index].dnf)throw Error('This runner has withdrawn. Join the next race.');
    if(index!==undefined&&[...this.clients.values()].some(c=>c.player===index&&c.role===(controller?'controller':'screen')&&c.connection?.open))throw Error('This device is already connected. Close its old tab first.');
    if(index===0&&!controller)throw Error('The host must keep its original screen open.');
    if(index===undefined){
     if(this.game.state.phase!=='checking')throw Error('This race has started. Join the next race.');
     if(this.game.state.players.length>=15)throw Error('This race already has 15 runners.');
     index=this.game.state.players.length;const template=new Core.Game({mode:'pack',playerCount:1,difficulty:this.game.state.difficulty,appearances:[m.appearance]}).state.players[0];
     template.name=cleanName(m.name);this.game.state.players.push(template);m.token=crypto.randomUUID();this.tokens.set(m.token,index);
    }
    if(this.clients.size>=30)throw Error('Device capacity reached.');
    const key=crypto.randomUUID();client={key,connection,player:index,role:controller?'controller':'screen',token:m.token};this.clients.set(key,client);this.game.state.players[index].connected=true;
    clearTimeout(timeout);this.send(connection,{type:'joined',code:this.code,player:index,token:m.token,role:client.role,state:this.view(index)});this.publish();return;
   }
   if(m?.type==='action')this.apply(client.player,m.action,m.value,client.role);
   else if(m?.type==='leave'){if(client.role==='screen')this.retire(client.player);connection.close();}
  }catch(e){this.send(connection,{type:'error',message:e.message});if(!client)setTimeout(()=>connection.close(),100);}});
  connection.on('close',()=>{clearTimeout(timeout);if(!client||this.closed)return;this.clients.delete(client.key);const p=this.game.state.players[client.player];if(client.role==='screen')p.connected=false;p.calibrated=false;p.ready=false;p.lastHop=-100;if(this.game.state.phase==='countdown'){this.game.state.phase='checking';this.game.state.countdown=3;}this.publish();});connection.on('error',()=>connection.close());}
  async join({code,name,token,role='screen',appearance}={}){
   this.code=code.toUpperCase();this.role=role;await this.open();this.connection=this.peer.connect('moverush-pack-v1-'+this.code,{reliable:true,serialization:'json'});
   return new Promise((resolve,reject)=>{let joined=false;const fail=message=>{clearTimeout(timeout);if(!joined){reject(Error(message));this.close();}else this.options.onStatus?.(message);};
    const timeout=setTimeout(()=>fail('Connection timed out. Keep the host open; this network may block peer rooms.'),20000);
    this.bridge.options.onStatus=fail;
    this.connection.on('open',()=>this.send(this.connection,{type:'join',name,token,role,appearance}));
    this.connection.on('data',m=>{if(m?.type==='joined'){clearTimeout(timeout);joined=true;this.player=m.player;this.token=m.token;this.options.onState?.(m.state);resolve(this);}else if(m?.type==='state')this.options.onState?.(m.state);else if(m?.type==='error')fail(m.message);else if(m?.type==='closed'){this.options.onStatus?.('The host closed the race.');this.close();}});
    this.connection.on('close',()=>{if(!joined)fail('Could not join this race. Check the room code.');else if(!this.closed){this.closed=true;this.bridge?.leave();this.options.onStatus?.('Disconnected. Your runner has stopped. Rejoin to continue.');this.options.onDisconnect?.();}});this.connection.on('error',e=>fail(e.message));
   });
  }
  apply(index,action,value,role='screen'){
   const p=this.game.state.players[index];if(!p||p.dnf)return;
   if(!['pose','tracking','ready','camera','left','right','jump','duck'].includes(action))return;
   // A paired phone owns motion input until disconnected; screen still owns readiness.
   if(role==='screen'&&action!=='ready'&&[...this.clients.values()].some(c=>c.player===index&&c.role==='controller'&&c.connection.open))return;
   if(action==='ready'&&(!p.connected||!p.cameraActive||!p.calibrated||!p.verified))return;
   if(action==='pose'){
    if(!value||typeof value!=='object')return;
    value={...value,gesture:String(value.gesture||'').slice(0,100)};
    if(!value.valid||!value.calibrated||!value.active){p.lastHop=-100;p.calibrated=false;p.ready=false;}
   }
   this.game.action(action,index,value);
  }
  action(action,value){if(this.host)this.apply(0,action,value);else this.send(this.connection,{type:'action',action,value});}
  launch(){if(!this.host)throw Error('The host starts the race.');const s=this.game.state;
   if(s.players.filter(p=>!p.dnf).length<2)throw Error('Invite at least one other runner.');
   if(s.players.some(p=>!p.dnf&&(!p.connected||!p.ready||!p.calibrated)))throw Error('Every runner must connect, test movement, and become ready.');
   if(s.phase!=='checking')return;s.armed=true;s.phase='countdown';s.countdown=3;this.publish();
  }
  retire(index){const p=this.game.state.players[index];if(this.game.state.phase==='checking'){// Reserve the slot for rejoining; host can remove it before starting.
    p.connected=false;p.ready=false;
   }else{p.finished=true;p.dnf=true;p.finishTime=null;p.speed=0;}}
  remove(index){if(!this.host||index===0||this.game.state.phase!=='checking')return;const p=this.game.state.players[index];if(p.connected)return;
   p.dnf=true;p.finished=true;p.finishTime=null;p.ready=true;p.calibrated=true;this.publish();
  }
  tick(dt){if(this.closed||!this.game)return;const now=performance.now();const seconds=dt??Math.min(.1,(now-this.lastTick)/1000);this.lastTick=now;this.game.step(seconds);this.publish();}
  close(){if(this.closed)return;this.closed=true;clearInterval(this.timer);if(this.host)for(const c of this.clients.values()){this.send(c.connection,{type:'closed'});c.connection.close();}else{this.send(this.connection,{type:'leave'});this.connection?.close();}this.bridge?.leave();}
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={PackRoom,cleanName};else root.MoveRushPackRoom=PackRoom;
})(globalThis);
