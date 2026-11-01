/* Layered landscapes drawn directly on the game canvas; no external image downloads. */
(function(root){
 const themes=[
  {name:'Emerald Valley',sky:'#77bdcf',haze:'#e8efd4',far:'#9bbca4',mid:'#6fa483',near:'#3c7d58',grass:'#65a86c',dark:'#265b45',leaf:'#4d9861',water:'#70c4bd'},
  {name:'Waterfall Pass',sky:'#8abac9',haze:'#e0ead8',far:'#a1bdaf',mid:'#6e9d8e',near:'#3e776b',grass:'#66a77a',dark:'#28594f',leaf:'#43856a',water:'#8ddbd3'},
  {name:'Golden Canopy',sky:'#a4c4bc',haze:'#f6e0aa',far:'#b0b994',mid:'#8ca675',near:'#5c8955',grass:'#96af66',dark:'#3a6847',leaf:'#77a45c',water:'#96c7b2'}
 ];
 const mix=(a,b,t)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');
 function themeAt(distance){const current=Math.floor(distance/1400)%themes.length,next=(current+1)%themes.length,blend=Math.max(0,(distance%1400-1100)/300);const palette={name:themes[current].name};for(const key of Object.keys(themes[current]))if(key!=='name')palette[key]=mix(themes[current][key],themes[next][key],blend);return palette;}
 function draw(ctx,{width:W,height:H,travel=0,time=0,center=.5,laneWidth=.25}){
  const colors=themeAt(travel),horizon=H*.37;
  const project=(lane,z)=>{const depth=Math.max(0,Math.min(1,1-z/150)),s=depth*depth;return {x:W*center+lane*W*laneWidth*s,y:horizon+H*.56*s,s};};
  function shape(points,color){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=color;ctx.fill();}
  function oval(x,y,rx,ry,color){ctx.beginPath();ctx.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
  const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,colors.sky);sky.addColorStop(.55,colors.haze);sky.addColorStop(1,colors.near);ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
  oval(W*.78,H*.18,42,42,'#fff0b780');oval(W*.78,H*.18,65,65,'#fff0b71a');
  for(let i=0;i<4;i++){const x=((i*.31+time*.0015)%1.3-.12)*W,y=H*(.14+(i%2)*.075);for(let n=0;n<3;n++)oval(x+n*25,y-(n===1?8:0),35+n*3,11+n*2,'#ffffff68');}
  // Broken mountain silhouettes and shaded rock faces fade into atmospheric haze.
  for(let layer=0;layer<4;layer++){
   const base=H*(.37+layer*.052),ridge=[];for(let n=0;n<=32;n++){const x=n/32*W,y=base-H*(.055+.055*Math.sin(n*.27+layer)+.024*Math.sin(n*1.8+layer*3)+.015*Math.cos(n*3.7));ridge.push([x,y]);}
   shape([[0,H],...ridge,[W,H]],[colors.far,colors.mid,colors.near,colors.dark][layer]);
   for(let n=2;n<30;n+=4){const [x,y]=ridge[n];shape([[x,y],[x+W*.065,base+H*.11],[x-W*.025,base+H*.04]],layer<2?'#eff3df16':'#183e3525');}
  }
  const mist=ctx.createLinearGradient(0,H*.26,0,H*.60);mist.addColorStop(0,'#ecf1df00');mist.addColorStop(.45,'#e9efdc80');mist.addColorStop(1,'#e9efdc00');ctx.fillStyle=mist;ctx.fillRect(0,H*.26,W,H*.35);
  // A distant waterfall and winding river sit below the elevated trail.
  ctx.beginPath();ctx.moveTo(W*.80,H*.40);ctx.bezierCurveTo(W*.78,H*.48,W*.84,H*.52,W*.81,H*.60);ctx.lineTo(W*.85,H*.60);ctx.bezierCurveTo(W*.88,H*.50,W*.81,H*.46,W*.84,H*.40);ctx.closePath();ctx.fillStyle='#c6f2e6a0';ctx.fill();
  ctx.beginPath();ctx.moveTo(W*.81,H*.55);ctx.bezierCurveTo(W*.78,H*.68,W*.30,H*.67,W*.12,H);ctx.lineTo(W*.78,H);ctx.bezierCurveTo(W*.38,H*.77,W*.96,H*.73,W*.85,H*.55);ctx.closePath();ctx.fillStyle=colors.water;ctx.fill();
  for(let i=0;i<11;i++)oval(W*(.77+Math.sin(i*2)*.07),H*(.58+i*.025),12+i*2,2,'#daf8e448');
  shape([[0,H*.63],[W*.20,H*.67],[W*.38,H],[0,H]],colors.grass);shape([[W,H*.56],[W*.85,H*.71],[W*.76,H],[W,H]],colors.grass);
  const a=project(-1.68,0),b=project(1.68,0),c=project(1.68,150),d=project(-1.68,150);shape([[a.x,a.y+16],[b.x,b.y+16],[c.x,c.y],[d.x,d.y]],'#4b675b');shape([[a.x,a.y],[b.x,b.y],[c.x,c.y],[d.x,d.y]],'#b4a98c');
  const shift=travel%8;
  for(let i=20;i>=0;i--){const z=i*8-shift;if(z<0||z>150)continue;const p=project(-1.49,z),q=project(1.49,z),r=project(1.49,Math.max(0,z-7.4)),u=project(-1.49,Math.max(0,z-7.4));shape([[p.x,p.y],[q.x,q.y],[r.x,r.y],[u.x,u.y]],i%2?'#b2a88c':'#beb297');}
  for(const lane of [-.5,.5])for(let z=12;z<150;z+=18){const p=project(lane,(z-shift+150)%150),q=project(lane,Math.min(150,(z-shift+150)%150+7));ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.lineWidth=Math.max(.5,2*p.s);ctx.strokeStyle='#f2eed77a';ctx.stroke();}
  // World-anchored stone seams and worn patches move with the trail.
  for(let i=0;i<50;i++){const z=(i*3.1+150-travel%150)%150,p=project(Math.sin(i*7.31)*1.42,z);ctx.strokeStyle=i%3?'#685d4930':'#eee3c14a';ctx.lineWidth=Math.max(.4,p.s);ctx.beginPath();ctx.moveTo(p.x-16*p.s,p.y);ctx.lineTo(p.x+9*p.s,p.y-2*p.s);ctx.lineTo(p.x+18*p.s,p.y+2*p.s);ctx.stroke();}
  for(let i=0;i<38;i++)for(const side of [-1,1]){const z=(i*4.2+150-travel%150)%150,p=project(side*(1.8+(i%7)*.23),z);oval(p.x+9*p.s,p.y+4*p.s,22*p.s,5*p.s,'#122f3934');if(i%4===0){shape([[p.x-17*p.s,p.y],[p.x-11*p.s,p.y-17*p.s],[p.x+7*p.s,p.y-23*p.s],[p.x+20*p.s,p.y-4*p.s]],'#697e68');shape([[p.x-11*p.s,p.y-17*p.s],[p.x+7*p.s,p.y-23*p.s],[p.x+20*p.s,p.y-4*p.s],[p.x+1*p.s,p.y-10*p.s]],'#a7af8a');}else{for(let blade=0;blade<4;blade++){ctx.strokeStyle=blade%2?colors.leaf:colors.grass;ctx.lineWidth=Math.max(.5,2*p.s);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.quadraticCurveTo(p.x+(blade-1.5)*7*p.s,p.y-13*p.s,p.x+(blade-1.5)*13*p.s,p.y-(11+blade*3)*p.s);ctx.stroke();}}}
  // Broadleaf trees vary in height and spacing, leaving the course unobstructed.
  for(const {i,z} of Array.from({length:24},(_,i)=>({i,z:(i*7+150-travel%7)%150})).sort((a,b)=>b.z-a.z)){for(const side of [-1,1]){const p=project(side*(2.15+(i%4)*.35),z),s=p.s,height=(95+(i%3)*21)*s;ctx.strokeStyle='#4d513d';ctx.lineWidth=Math.max(.4,8*s);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-3*s,p.y-height);ctx.stroke();ctx.lineWidth=Math.max(.3,3*s);ctx.beginPath();ctx.moveTo(p.x,p.y-height*.55);ctx.lineTo(p.x-21*s,p.y-height*.87);ctx.moveTo(p.x,p.y-height*.66);ctx.lineTo(p.x+20*s,p.y-height*.96);ctx.stroke();oval(p.x,p.y-height,31*s,30*s,colors.dark);oval(p.x-18*s,p.y-height+11*s,25*s,23*s,colors.near);oval(p.x+17*s,p.y-height+7*s,24*s,23*s,colors.leaf);oval(p.x-4*s,p.y-height-16*s,25*s,22*s,i%2?colors.leaf:colors.grass);for(let leaf=0;leaf<9;leaf++){const lx=p.x+Math.sin(i*2+leaf*2.4)*28*s,ly=p.y-height+Math.cos(leaf*1.7)*23*s;oval(lx,ly,(8+leaf%3*3)*s,(6+leaf%3*2)*s,leaf%3===0?'#b4c98565':leaf%3===1?colors.leaf:colors.dark);}oval(p.x+height*.35,p.y+3*s,40*s,8*s,'#173f3640');if(i%3===0)for(let f=0;f<3;f++)oval(p.x+(f-1)*12*s,p.y-4*s,3*s,3*s,f%2?'#f3d58a':'#e9b7bf');}}
  for(const lane of [-1.64,1.64]){const p=project(lane,0),q=project(lane,150);ctx.beginPath();ctx.moveTo(p.x,p.y-22);ctx.lineTo(q.x,q.y);ctx.lineWidth=3;ctx.strokeStyle='#efe3bc';ctx.stroke();for(let i=0;i<10;i++){const z=(i*16+150-travel%16)%150,r=project(lane,z);ctx.fillStyle='#b7aa80';ctx.fillRect(r.x-2*r.s,r.y-27*r.s,4*r.s,27*r.s);}}
  return {theme:colors.name,horizon};
 }
 const api={draw,themeAt};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MoveRushScenery=api;
})(globalThis);
