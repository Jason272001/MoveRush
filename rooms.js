/* Room pairing sends control commands and shared state, never camera frames. */
window.MoveRushRooms=class {
  constructor(callbacks){
    this.cb=callbacks;this.connected=false;this.role=null;this.busy=false;this.queue=Promise.resolve();this.addresses=[];this.pendingPose=null;this.pendingActions=[];this.sending=false;this.generation=0;this.roomsAvailable=null;
    const $=id=>document.getElementById(id);this.$=$;
    $('devices').onclick=()=>{$('roomPanel').hidden=false;};$('closeRooms').onclick=()=>{$('roomPanel').hidden=true;};
    $('createRoom').onclick=()=>this.create();$('joinRoom').onclick=()=>this.join();$('leaveRoom').onclick=()=>this.leave();$('controllerDisconnect').onclick=()=>this.leave();
    $('copyRoomLink').onclick=async()=>{if(!this.code)return;try{await navigator.clipboard.writeText(location.origin+'/?room='+this.code);this.message('Invite copied. Open it on the other device and choose a player.');}catch{this.message('Open '+location.origin+'/?room='+this.code+' on the other device.');}};
    $('controllerCamera').onclick=()=>this.cb.camera();
    document.querySelectorAll('[data-phone-action]').forEach(button=>button.onpointerdown=e=>{e.preventDefault();this.cb.action(button.dataset.phoneAction);});
    this.configuration=fetch('/api/config').then(async r=>{if(!r.ok)throw Error('Room configuration unavailable');return r.json();}).then(data=>{this.addresses=data.lan||[];this.roomsAvailable=data.roomsAvailable!==false;this.peerMode=data.transport==='peerjs';this.unavailableMessage=data.message||'Online rooms are not available on this deployment. You can still play solo or race on this device.';this.updateAvailability();if(this.connected)this.showRoom();}).catch(()=>{this.roomsAvailable=false;this.unavailableMessage='Online room server is unavailable. Solo and same-device races still work.';this.updateAvailability();});
    const code=new URL(location.href).searchParams.get('room');if(code){$('joinCode').value=code.toUpperCase();$('roomPanel').hidden=false;}
    try{const saved=JSON.parse(sessionStorage.getItem('moverush-room'));if(saved?.token&&saved?.code)this.configuration.then(()=>{if(this.roomsAvailable)this.restore(saved);else sessionStorage.removeItem('moverush-room');});}catch{}
    setInterval(()=>{if(this.role==='controller'&&this.connected){$('controllerCameraStatus').textContent=this.cb.status();$('controllerCamera').textContent=$('camera').textContent.includes('Disable')?'Disable phone camera':'Enable phone camera';}},400);
  }
  updateAvailability(){this.$('createRoom').disabled=!this.roomsAvailable;this.$('joinRoom').disabled=!this.roomsAvailable;if(!this.roomsAvailable)this.message(this.unavailableMessage);}
  message(text){this.$('roomMessage').textContent=text;}
  async request(path,data,auth=false){await this.configuration;if(!this.roomsAvailable)throw Error(this.unavailableMessage);if(this.peerMode){const peer=this.getPeerTransport();if(path==='/api/rooms')return peer.create(data);const code=path.split('/')[3],operation=path.split('/')[4];if(operation==='join')return peer.join({code,...data});if(operation==='action')return peer.action(data);if(operation==='start')return peer.start();if(operation==='pause')return peer.pause();if(operation==='leave')return peer.leave();throw Error('Unknown room operation.');}const headers={'Content-Type':'application/json'};if(auth)headers.Authorization='Bearer '+this.token;const response=await fetch(path,{method:'POST',headers,body:JSON.stringify(data??{})});const result=await response.json().catch(()=>({error:'The room server did not respond correctly. Please try again later.'}));if(!response.ok)throw Error(result.error||'Connection failed');return result;}
  endpoint(action){return '/api/rooms/'+this.code+'/'+action;}
  async create(){if(this.busy)return;this.busy=true;try{this.message('Creating room…');const info=await this.request('/api/rooms',this.cb.getOptions());this.connect(info);this.message('Room ready. Pair your phones or another screen, then press Let’s run to open the movement check. Each player claps when ready.');}catch(e){this.message(e.message);}finally{this.busy=false;}}
  async join(){if(this.busy)return;this.busy=true;try{const code=this.$('joinCode').value.trim().toUpperCase();if(!/^[A-Z0-9]{6}$/.test(code))throw Error('Enter the six-character room code.');this.message('Joining…');const info=await this.request('/api/rooms/'+code+'/join',{role:this.$('joinRole').value,player:Number(this.$('joinPlayer').value)});this.connect(info);if(this.role==='controller')this.$('roomPanel').hidden=true;this.message('Connected. The main screen opens the movement check; each player claps when ready.');}catch(e){this.message(e.message);}finally{this.busy=false;}}
  connect(info){this.source?.close();this.generation++;this.pendingPose=null;this.pendingActions=[];this.code=info.code;this.token=info.token;this.role=info.role;this.player=info.player;this.info=info;this.connected=true;
    try{sessionStorage.setItem('moverush-room',JSON.stringify({code:this.code,token:this.token,role:this.role,player:this.player,mode:info.mode,difficulty:info.difficulty,transport:info.transport}));}catch{}
    this.cb.onConnection(true,this.role);this.showRoom();
    if(this.peerMode){if(info.state)this.receiveState(info.state);return;}
    this.source=new EventSource(this.endpoint('events')+'?token='+encodeURIComponent(this.token));
    this.source.addEventListener('state',event=>this.receiveState(JSON.parse(event.data)));
    this.source.addEventListener('members',event=>{this.info={...this.info,...JSON.parse(event.data)};this.showRoom();});
    this.source.addEventListener('closed',event=>{const message=JSON.parse(event.data).message;this.disconnect();this.$('roomPanel').hidden=false;this.message(message);});
    this.source.onerror=()=>{this.message('Connection interrupted. Reconnecting to the room…');this.$('roomBanner').textContent='ROOM '+this.code+' · Reconnecting…';this.cb.onTransport?.(false);};
    if(info.state)this.cb.onState(info.state);
  }
  receiveState(state){this.notice=state.connectionNotice||'';this.info.mode=state.mode;this.info.difficulty=state.difficulty;this.cb.onTransport?.(true);this.cb.onState(state);this.showBanner();if(this.role==='controller'){const p=state.players[this.player];this.$('controllerRaceStatus').textContent=state.connectionNotice||(state.phase==='checking'?'Test your movements, then clap when ready.':state.phase==='countdown'?'Starting in '+Math.ceil(state.countdown)+'…':!state.running&&state.elapsed===0?'Waiting for the main screen to open the movement check.':state.paused?'Paused by the main screen.':p?.finished?'Finished! Waiting for the other runner.':!state.running?'Game over. The main screen can start again.':Math.floor(p?.travel??0)+' m · '+(p?.coins??0)+' gold'+(p?.slow>0?' · Slowed by a bump':''));}}
  getPeerTransport(){if(!this.peerTransport)this.peerTransport=new window.MoveRushPeerRoom({onState:state=>this.receiveState(state),onMembers:info=>{this.info={...this.info,...info};this.showRoom();},onClosed:message=>{this.disconnect();this.$('roomPanel').hidden=false;this.message(message);},onStatus:message=>this.message(message)});return this.peerTransport;}
  async restore(saved){try{if(this.peerMode){if(saved.role==='host')throw Error('The main screen refreshed. Create a new room.');const info=await this.getPeerTransport().join({code:saved.code,role:saved.role,player:saved.player,token:saved.token});this.connect(info);return;}const response=await fetch('/api/rooms/'+saved.code+'/status',{headers:{Authorization:'Bearer '+saved.token}});const info=await response.json();if(!response.ok)throw Error(info.error);this.connect(info);}catch(e){try{sessionStorage.removeItem('moverush-room');}catch{}this.message('Previous room is unavailable. Create or join a room.');}}
  showBanner(){if(!this.connected)return;if(this.notice){this.$('roomBanner').textContent=this.notice;return;}this.$('roomBanner').textContent='ROOM '+this.code+' · '+(this.role==='host'?'MAIN SCREEN':this.role==='controller'?'PHONE · PLAYER '+(this.player+1):'SCREEN · PLAYER '+(this.player+1));}
  showRoom(){const $=this.$;$('roomSetup').hidden=this.connected;$('roomConnected').hidden=!this.connected;$('roomBanner').hidden=!this.connected;$('controllerView').hidden=!(this.connected&&this.role==='controller');document.body.classList.toggle('controller-mode',this.connected&&this.role==='controller');if(!this.connected)return;
    this.showBanner();$('roomCode').textContent=this.code;
    const local=['localhost','127.0.0.1'].includes(location.hostname),address=local&&this.addresses.length?this.addresses[0]:location.origin;
    $('roomAddress').textContent='On your other device, open '+address+'/?room='+this.code+' and enter this code.';
    const members=this.info.members||[];$('roomMembers').textContent=members.filter(m=>m.connected).map(m=>m.role==='host'?'Main screen':m.role+' · Player '+(m.player+1)).join(' / ')||'Waiting for devices…';
    $('controllerTitle').textContent='Player '+(this.player+1);$('controllerRoom').textContent='ROOM '+this.code+' · '+(this.info.mode==='race'?'Five-minute race':'Endless solo chase');
  }
  action(action,index=0,value){if(!this.connected)return;const player=this.role==='host'?index:this.player;const data={action,player,value};
    if(action==='pose'){const previous=this.pendingPose?.value;if(value?.valid&&previous){data.value={...value,clap:!!(value.clap||previous.clap),jump:!!(value.jump||previous.jump),wave:!!(value.wave||previous.wave)};}this.pendingPose=data;}
    else this.pendingActions.push(data);
    this.pump();
  }
  pump(){if(this.sending)return this.queue;this.sending=true;const generation=this.generation;
    this.queue=(async()=>{try{while(this.connected&&generation===this.generation&&(this.pendingActions.length||this.pendingPose)){const data=this.pendingActions.shift()||this.pendingPose;if(data===this.pendingPose)this.pendingPose=null;await this.request(this.endpoint('action'),data,true);}}catch(e){this.message(e.message);}finally{this.sending=false;if(this.connected&&(this.pendingActions.length||this.pendingPose))this.pump();}})();return this.queue;
  }
  async start(){if(this.role!=='host'){this.message('The main screen starts the game.');return;}try{await this.request(this.endpoint('start'),{},true);this.$('roomPanel').hidden=true;}catch(e){this.message(e.message);}}
  async pause(){if(this.role!=='host')return;try{await this.request(this.endpoint('pause'),{},true);}catch(e){this.message(e.message);}}
  async leave(){try{if(this.connected)await this.request(this.endpoint('leave'),{},true);}catch{}this.disconnect();}
  disconnect(){if(this.peerTransport){this.peerTransport.leave();this.peerTransport=null;}this.source?.close();this.source=null;this.connected=false;this.role=null;this.generation++;this.pendingPose=null;this.pendingActions=[];try{sessionStorage.removeItem('moverush-room');}catch{}this.showRoom();this.cb.onConnection(false,null);this.message('Disconnected. Create or join a room to reconnect.');}
};
