/* Shared deterministic simulation. No browser dependencies. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FlappyEngine=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const config={width:420,height:640,floor:590,x:105,radius:18,gravity:.33,flap:-5.9,speed:2.6,gap:174,pipeWidth:65,spacing:220};
 function create(seed=42){return {seed:seed>>>0,tick:0,y:300,vy:0,score:0,dead:false,pipes:[]};}
 function random(s){s.seed=(Math.imul(1664525,s.seed)+1013904223)>>>0;return s.seed/4294967296;}
 function spawn(s){const previous=s.pipes.at(-1)?.gapY??300;const low=Math.max(145,previous-115),high=Math.min(435,previous+115);s.pipes.push({x:config.width+10,gapY:low+random(s)*(high-low),passed:false});}
 function step(s,flap=false,frames=1){const c=config;for(let i=0;i<Math.min(600,Math.max(1,frames|0))&&!s.dead;i++){
  if(i===0&&flap)s.vy=c.flap;s.vy+=c.gravity;s.y+=s.vy;s.tick++;
  if(!s.pipes.length||s.pipes[s.pipes.length-1].x<c.width+10-c.spacing)spawn(s);
  for(const p of s.pipes){p.x-=c.speed;if(p.x+c.pipeWidth<c.x-c.radius&&!p.passed){p.passed=true;s.score++;}
   if(p.x<c.x+c.radius&&p.x+c.pipeWidth>c.x-c.radius&&(s.y-c.radius<p.gapY-c.gap/2||s.y+c.radius>p.gapY+c.gap/2))s.dead=true;
  }s.pipes=s.pipes.filter(p=>p.x+c.pipeWidth>0);if(s.y-c.radius<0||s.y+c.radius>c.floor)s.dead=true;
 }return s;}
 function observe(s){const c=config,p=s.pipes.find(p=>p.x+c.pipeWidth>=c.x-c.radius);return {tick:s.tick,y:+s.y.toFixed(2),velocity:+s.vy.toFixed(2),score:s.score,dead:s.dead,nextPipe:p?{distance:+(p.x-c.x).toFixed(2),gapTop:+(p.gapY-c.gap/2).toFixed(2),gapBottom:+(p.gapY+c.gap/2).toFixed(2)}:null};}
 function policy(s){const p=s.pipes.find(p=>p.x+config.pipeWidth>=config.x-config.radius);const target=p&&p.x-config.x<200?p.gapY:300;return s.y>target+10&&s.vy>0;}
 return {config,create,step,observe,policy};
});
