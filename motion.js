/* Pure, device-independent gesture interpretation; camera frames stay in the browser. */
(function(root){
 class MotionTracker {
  constructor(){this.reset();}
  reset(){this.baseline=null;this.samples=[];this.smooth=null;this.lane=0;this.jumpLatch=false;this.lastJump=-Infinity;this.lastHop=-Infinity;this.previousHip=null;this.previousKnee=null;this.started=null;this.lastTime=null;this.handsOpenAt=-Infinity;this.clapLatched=false;this.lastClap=-Infinity;this.waveSamples=[];}
  sample(points,now,sensitivity=1,options={}){
   const upper=options.framing==='upper';if(this.framing!==undefined&&this.framing!==upper)this.reset();this.framing=upper;
   const required=upper?[11,12]:[11,12,23,24];
   if(!points||required.some(i=>!points[i]||(points[i].visibility??1)<.5)){if(!this.baseline){this.samples=[];this.started=null;}return {valid:false,ready:!!this.baseline,progress:0,message:upper?'Keep your face and both shoulders in view. No full-body view needed.':'Step back until your shoulders and hips are visible.'};}
   const avg=(a,b,key)=>(points[a][key]+points[b][key])/2;
   const current={x:avg(11,12,'x'),shoulder:avg(11,12,'y'),hip:upper?avg(11,12,'y')+Math.abs(points[11].x-points[12].x)*1.4:avg(23,24,'y'),width:Math.abs(points[11].x-points[12].x),head:points[0]&&(points[0].visibility??0)>.5?points[0].y:avg(11,12,'y')-.1};
   if(current.width<.04||current.hip-current.shoulder<.07)return {valid:false,ready:false,progress:0,message:'Face the camera with your body upright.'};
   const dt=this.lastTime===null?.1:Math.max(.01,Math.min(.3,(now-this.lastTime)/1000));this.lastTime=now;
   const alpha=1-Math.exp(-dt*12);this.smooth=this.smooth?Object.fromEntries(Object.keys(current).map(k=>[k,this.smooth[k]+(current[k]-this.smooth[k])*alpha])):current;
   const v=this.smooth;
   if(!this.baseline){
    if(this.started===null)this.started=now;
    if(this.samples.length){const first=this.samples[0];if(Math.abs(current.x-first.x)>.07||Math.abs(current.hip-first.hip)>.06){this.started=now;this.samples=[];}}
    this.samples.push(current);const progress=Math.min(1,(now-this.started)/3000);
    if(progress<1)return {valid:true,ready:false,progress,message:'Stand still and upright · '+Math.ceil(3-(now-this.started)/1000)+' seconds'};
    this.baseline=Object.fromEntries(Object.keys(current).map(k=>[k,this.samples.reduce((sum,p)=>sum+p[k],0)/this.samples.length]));this.previousHip=v.hip;
   }
   const b=this.baseline,torso=b.hip-b.shoulder,threshold=1/Math.max(.65,Math.min(1.6,sensitivity));
   // Mirror steering to match the preview: moving toward your right moves the runner right.
   const lean=(b.x-v.x)/Math.max(.12,b.width),enter=.32*threshold,exit=.16*threshold;
   if(lean>enter)this.lane=1;else if(lean<-enter)this.lane=-1;else if(Math.abs(lean)<exit)this.lane=0;
   const rise=(b.hip-v.hip)/torso,shoulderDrop=(v.shoulder-b.shoulder)/torso;
   const headDrop=(v.head-b.head)/torso;const duck=upper?(shoulderDrop>.27*threshold||headDrop>.23*threshold):shoulderDrop>.30*threshold&&(v.hip>b.hip+.08*torso||v.hip-v.shoulder<torso*.85);
   const bothHandsUp=upper&&[15,16].every(i=>points[i]&&(points[i].visibility??0)>.55&&points[i].y<v.shoulder-.2*torso)&&Math.abs(points[15].x-points[16].x)>b.width*.9;const lifted=bothHandsUp||(rise>.22*threshold&&(b.shoulder-v.shoulder)/torso>.15*threshold);
   const jump=lifted&&!duck&&!this.jumpLatch&&now-this.lastJump>800;
   if(jump){this.jumpLatch=true;this.lastJump=now;}if(rise<.07&&!bothHandsUp)this.jumpLatch=false;
   const hipMovement=Math.abs(v.hip-(this.previousHip??v.hip))/torso;
   const knees=!upper&&points[25]&&points[26]&&(points[25].visibility??0)>.5&&(points[26].visibility??0)>.5;
   const kneeOffset=knees?(points[25].y-points[26].y)/torso:0;
   const stepping=knees&&this.previousKnee!==null&&Math.abs(kneeOffset-this.previousKnee)>.045;this.previousKnee=knees?kneeOffset:null;
   if((hipMovement>.018||stepping||jump)&&!duck)this.lastHop=now;
   this.previousHip=v.hip;
   const hop=now-this.lastHop<450;
   let clap=false,wave=false;
   const wrists=[points[15],points[16]],handsVisible=wrists.every(p=>p&&(p.visibility??0)>.55);
   if(handsVisible){
    const handGap=Math.hypot(wrists[0].x-wrists[1].x,wrists[0].y-wrists[1].y)/Math.max(.1,b.width);
    if(handGap>.95){this.handsOpenAt=now;this.clapLatched=false;}
    const atChest=wrists.every(p=>p.y<v.hip&&p.y>v.shoulder-torso*.6);
    if(handGap<.42&&atChest&&!this.clapLatched&&now-this.handsOpenAt<1600&&now-this.lastClap>1800){clap=true;this.clapLatched=true;this.lastClap=now;}
    const raised=wrists.find(p=>p.y<v.shoulder-.08*torso);
    if(raised){this.waveSamples.push({x:raised.x,t:now});this.waveSamples=this.waveSamples.filter(p=>now-p.t<1100);wave=this.waveSamples.length>=3&&Math.max(...this.waveSamples.map(p=>p.x))-Math.min(...this.waveSamples.map(p=>p.x))>.20*b.width;}
    else this.waveSamples=[];
   }
   return {valid:true,ready:true,progress:1,lane:this.lane,jump,duck,hop,rise,lean,clap,wave,message:(this.lane<0?'LEFT':this.lane>0?'RIGHT':'CENTER')+' · '+(clap?'CLAP':wave?'WAVE':duck?'CROUCH':jump?'JUMP':hop?'STEPPING':'STANDING')};
  }
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={MotionTracker};else root.MoveRushMotion={MotionTracker};
})(globalThis);
