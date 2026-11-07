
import * as THREE from 'three';
const container=document.getElementById('webgl'), canvas=document.getElementById('scene');
const bgLayer=document.getElementById('bgLayer');
const control={progress:0,started:false};
const mousePos={x:99,y:99,isDown:false};
window.addEventListener('pointermove',e=>{mousePos.x=(e.clientX/window.innerWidth)*2-1;mousePos.y=-(e.clientY/window.innerHeight)*2+1});
window.addEventListener('mousedown',()=>mousePos.isDown=true);window.addEventListener('mouseup',()=>mousePos.isDown=false);
let ballColor='#2F69FF';
const getDynamicColors=(baseColor)=>{const hex=baseColor.toLowerCase();
if(hex==='#e1fc03')return{pastel:new THREE.Color('#FBFFE2'),light:new THREE.Color('#EFFE69'),medium:new THREE.Color('#E1FC03'),deep:new THREE.Color('#B1E200'),glass:new THREE.Color('#DCFF32')};
if(hex==='#ffc5c2'||hex==='#ffa19e')return{pastel:new THREE.Color('#FFF5F4'),light:new THREE.Color('#FFECEB'),medium:new THREE.Color('#FFA6B3'),deep:new THREE.Color('#FF4D6D'),glass:new THREE.Color('#FFA6B3')};
if(hex==='#96e5ff')return{pastel:new THREE.Color('#F0F9FF'),light:new THREE.Color('#C9F1FF'),medium:new THREE.Color('#96E5FF'),deep:new THREE.Color('#2BA5FF'),glass:new THREE.Color('#98E4FF')};
if(hex==='#2f69ff')return{pastel:new THREE.Color('#ECEFFF'),light:new THREE.Color('#A8C1FF'),medium:new THREE.Color('#2F69FF'),deep:new THREE.Color('#0A33BF'),glass:new THREE.Color('#4D80FF')};
if(hex==='#141414'||hex==='#000000')return{pastel:new THREE.Color('#D8D8D8'),light:new THREE.Color('#555555'),medium:new THREE.Color('#242424'),deep:new THREE.Color('#0A0A0A'),glass:new THREE.Color('#1F1F1F')};
const c=new THREE.Color(baseColor);return{pastel:c.clone().offsetHSL(0,-0.15,0.25),light:c.clone().offsetHSL(0,-0.05,0.12),medium:c.clone(),deep:c.clone().offsetHSL(0.01,0.1,-0.12),glass:c.clone()};};
let palette=getDynamicColors(ballColor);let isBlack=['#141414','#18181b','#000000'].includes(ballColor.toLowerCase());
let palHero=palette,palLime=getDynamicColors('#E1FC03'),palPink=getDynamicColors('#FFC5C2');
const ROLES=['pastel','light','medium','deep','glass'];const curPal={pastel:new THREE.Color(),light:new THREE.Color(),medium:new THREE.Color(),deep:new THREE.Color(),glass:new THREE.Color()};
const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(38,container.clientWidth/container.clientHeight,0.1,100);camera.position.set(0,0,11);
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));renderer.setSize(container.clientWidth,container.clientHeight);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const hemiLight=new THREE.HemisphereLight(0xffffff,new THREE.Color(ballColor),1.6);scene.add(hemiLight);
const keyLight=new THREE.DirectionalLight(0xffffff,1.4);keyLight.position.set(-6,10,8);keyLight.castShadow=true;keyLight.shadow.mapSize.width=2048;keyLight.shadow.mapSize.height=2048;keyLight.shadow.camera.near=0.5;keyLight.shadow.camera.far=30;keyLight.shadow.camera.left=-8;keyLight.shadow.camera.right=8;keyLight.shadow.camera.top=8;keyLight.shadow.camera.bottom=-8;keyLight.shadow.bias=-0.0003;keyLight.shadow.radius=12.0;scene.add(keyLight);
const rimLight=new THREE.DirectionalLight(0xffffff,1.25);rimLight.position.set(8,7,-8);scene.add(rimLight);
const frontLight=new THREE.DirectionalLight(0xffffff,0.4);frontLight.position.set(0,0,11);scene.add(frontLight);
const sideBounceLight=new THREE.DirectionalLight(0xffffff,0.3);sideBounceLight.position.set(-9,-2,4);scene.add(sideBounceLight);
let viewportWidth=10,viewportHeight=6;
const updateFrustumBounds=()=>{const fovRad=THREE.MathUtils.degToRad(camera.fov);viewportHeight=2*Math.tan(fovRad/2)*camera.position.z;viewportWidth=viewportHeight*(container.clientWidth/container.clientHeight);};
updateFrustumBounds();
const isMobile=window.innerWidth<768;const ballCount=isMobile?54:96;
const sphereGeometry=new THREE.SphereGeometry(1,48,48);let balls=[];let meanRadius=1;let shapeScale=1;
const inHeart=(x,y)=>{const a=x*x+y*y-1;return a*a*a-x*x*y*y*y<=0;};
const assignHeartTargets=()=>{const S=Math.min(viewportWidth*0.30,viewportHeight*0.27);const baseCY=-viewportHeight*0.03;shapeScale=Math.max(0.3,Math.min(1,(S*0.45/2.3)/meanRadius));for(let i=0;i<balls.length;i++){let x=0,y=0,tries=0;do{x=(Math.random()*2-1)*1.25;y=Math.random()*2.55-1.4;tries++;}while(!inHeart(x,y)&&tries<60);balls[i].shapeTarget.set(x*S,(y+0.12)*S+baseCY,(Math.random()-0.5)*0.35);}};
function createBalls(){for(const b of balls){scene.remove(b.meshGroup);b.material.dispose();}balls=[];
for(let i=0;i<ballCount;i++){let radius=0.33;const rand=Math.random();if(rand<0.3)radius=0.27+Math.random()*0.12;else if(rand<0.8)radius=0.42+Math.random()*0.18;else radius=0.66+Math.random()*0.21;const mass=Math.pow(radius,3);let chosenColor=palette.medium,color=palette.medium,sphereMat,role='medium';const isGlass=Math.random()<0.22&&!isBlack;
if(isGlass){sphereMat=new THREE.MeshPhysicalMaterial({color:palette.glass,roughness:0.08,metalness:0.0,clearcoat:1.0,clearcoatRoughness:0.03,transmission:0.95,ior:1.485,thickness:2.2,specularColor:new THREE.Color('#ffffff'),specularIntensity:1.0,attenuationColor:palette.pastel,attenuationDistance:1.0,emissive:palette.glass,emissiveIntensity:0.12,transparent:true});color=palette.glass;role='glass';}
else{const colorRand=Math.random();if(colorRand<0.25){chosenColor=palette.pastel;role='pastel';}else if(colorRand<0.55){chosenColor=palette.light;role='light';}else if(colorRand<0.85){chosenColor=palette.medium;role='medium';}else{chosenColor=palette.deep;role='deep';}sphereMat=new THREE.MeshPhysicalMaterial({color:chosenColor,roughness:0.44,metalness:0.0,clearcoat:0.24,clearcoatRoughness:0.35,emissive:isBlack?new THREE.Color('#000000'):chosenColor,emissiveIntensity:isBlack?0.0:0.08,transparent:true});color=chosenColor;}
const group=new THREE.Group();const sphereMesh=new THREE.Mesh(sphereGeometry,sphereMat);sphereMesh.scale.setScalar(radius);sphereMesh.castShadow=true;sphereMesh.receiveShadow=true;group.add(sphereMesh);scene.add(group);
balls.push({id:i,radius,mass,position:new THREE.Vector3(0,0,0),velocity:new THREE.Vector3(),meshGroup:group,sphere:sphereMesh,material:sphereMat,role,isGlass,visualScale:radius,color,restPosition:new THREE.Vector3(0,0,0),shapeTarget:new THREE.Vector3(),angleY:Math.random()*Math.PI*2,angleZ:0.1+Math.random()*0.45});}
meanRadius=balls.reduce((s,b)=>s+b.radius,0)/balls.length;assignHeartTargets();}
const scatterFar=(withInwardVelocity)=>{const R=Math.max(viewportWidth,viewportHeight)*1.5;for(const b of balls){const a=Math.random()*Math.PI*2;const px=Math.cos(a)*R*1.25,py=Math.sin(a)*R*0.85,pz=(Math.random()-0.5)*4;b.position.set(px,py,pz);b.meshGroup.position.copy(b.position);if(withInwardVelocity){b.velocity.set(-px,-py,-pz).normalize().multiplyScalar(0.08+Math.random()*0.05);}else b.velocity.set(0,0,0);}};
createBalls();scatterFar(false);
const params={gravity:0,rebound:-0.3,mouseRepelForce:0.05,mouseRepelRadius:4.4,damping:0.91,centerAttractForce:0.0035,bounciness:0.02};
const mouseProjVec=new THREE.Vector3(),mouseWorld3D=new THREE.Vector3();
const updateMouse3D=()=>{mouseProjVec.set(mousePos.x,mousePos.y,0.5);mouseProjVec.unproject(camera);const dir=mouseProjVec.sub(camera.position).normalize();const distance=-camera.position.z/dir.z;mouseWorld3D.copy(camera.position).add(dir.multiplyScalar(distance));};
const clamp01=v=>v<0?0:v>1?1:v;const smoothstep=(a,b,x)=>{const t=clamp01((x-a)/(b-a));return t*t*(3-2*t);};const lerp=(a,b,t)=>a+(b-a)*t;const easeOutCubic=t=>1-Math.pow(1-t,3);
let reportedReady=false;function onReady(){window.__quadletReady=true;}
let animationFrameId=0;const clock=new THREE.Clock();let localStarted=false,entranceStart=0;
const diffVec=new THREE.Vector3(),collideDiff=new THREE.Vector3(),relVel=new THREE.Vector3(),deltaPos=new THREE.Vector3(),rotAxis=new THREE.Vector3(),prevMouseWorld=new THREE.Vector3();let mouseSpeed=0;
const simulateAndRender=()=>{animationFrameId=requestAnimationFrame(simulateAndRender);const time=clock.getElapsedTime();clock.getDelta();updateMouse3D();const ctrl=control;
if(ctrl?.started&&!localStarted){localStarted=true;entranceStart=time;scatterFar(true);}
if(!localStarted){renderer.render(scene,camera);if(!reportedReady){reportedReady=true;onReady();}return;}
const progress=ctrl?.progress??0;const heroF=1-smoothstep(0.30,0.80,progress);const dropRaw=smoothstep(0.40,0.95,progress);const flyF=smoothstep(2.7,3.45,progress);const shapeF=smoothstep(1.40,2.05,progress)*(1-smoothstep(2.55,3.0,progress));const dropF=dropRaw*(1-smoothstep(1.25,1.75,progress));
const bLime=smoothstep(0.55,1.05,progress),bPink=smoothstep(1.40,1.95,progress);for(const role of ROLES){curPal[role].copy(palHero[role]).lerp(palLime[role],bLime).lerp(palPink[role],bPink);}hemiLight.groundColor.copy(curPal.medium);
const entranceT=easeOutCubic(clamp01((time-entranceStart)/2.2));const attractionBoost=lerp(7.5,1,entranceT);const isMouseInteracting=!!mousePos&&(Math.abs(mousePos.x)<0.99||Math.abs(mousePos.y)<0.99);mouseSpeed=isMouseInteracting?mouseWorld3D.distanceTo(prevMouseWorld):0;if(mouseSpeed>3)mouseSpeed=3;prevMouseWorld.copy(mouseWorld3D);
let damping=0.91;damping=lerp(damping,0.992,dropF);damping=lerp(damping,0.90,shapeF);damping=lerp(damping,0.985,flyF);const camZ=camera.position.z;const clusterActive=Math.max(heroF,entranceT<1?1:0);
for(let i=0;i<balls.length;i++){const b=balls[i];
if(heroF>0.01){b.velocity.x+=Math.sin(time*0.4+b.id*1.5)*0.0004*b.radius*heroF;b.velocity.y+=Math.cos(time*0.5+b.id*1.2)*0.0004*b.radius*heroF;b.velocity.z+=Math.sin(time*0.35+b.id)*0.0001*heroF;}
const clusterStrength=params.centerAttractForce*attractionBoost*clusterActive;if(clusterStrength>0.00001){b.velocity.x+=(0-b.position.x)*clusterStrength*0.38;b.velocity.y+=(0-b.position.y)*clusterStrength*1.85;b.velocity.z+=(0-b.position.z)*clusterStrength*1.8;}
if(dropF>0.001)b.velocity.y-=0.011*dropF;
if(shapeF>0.001){const k=0.06*shapeF;b.velocity.x+=(b.shapeTarget.x-b.position.x)*k;b.velocity.y+=(b.shapeTarget.y-b.position.y)*k;b.velocity.z+=(b.shapeTarget.z-b.position.z)*k;}
if(flyF>0.001){const stagger=(b.id*0.6180339887)%1;const local=smoothstep(stagger*0.55,stagger*0.55+0.45,flyF);b.velocity.z+=0.05*local;b.velocity.x+=b.position.x*0.006*local;b.velocity.y+=b.position.y*0.006*local;}
if(mousePos&&isMouseInteracting){diffVec.subVectors(b.position,mouseWorld3D);const rawDist=diffVec.length();const down=mousePos.isDown;const activeRepelRadius=down?params.mouseRepelRadius*1.4:params.mouseRepelRadius;const activeRepelForce=down?params.mouseRepelForce*1.7:params.mouseRepelForce;if(rawDist<activeRepelRadius&&rawDist>0.0001){const ratio=rawDist/activeRepelRadius;const smoothFactor=1.0-(ratio*ratio*(3.0-2.0*ratio));const speedBoost=1+mouseSpeed*3.2;const push=smoothFactor*activeRepelForce*speedBoost;diffVec.normalize();diffVec.z*=0.12;diffVec.normalize();b.velocity.addScaledVector(diffVec,push);}}
b.velocity.multiplyScalar(damping);b.position.addScaledVector(b.velocity,1);const c=b.isGlass?curPal.glass:curPal[b.role];b.material.color.copy(c);if(!isBlack)b.material.emissive.copy(c);b.material.opacity=flyF>0.001?1-smoothstep(camZ-2.6,camZ-0.3,b.position.z):1;const targetVis=b.radius*(1-(1-shapeScale)*shapeF);b.visualScale+=(targetVis-b.visualScale)*0.12;b.sphere.scale.setScalar(b.visualScale);}
const collideScale=0.28*(1-0.93*shapeF)*(1-flyF);const subSteps=4;
for(let step=0;step<subSteps;step++){for(let i=0;i<balls.length;i++){for(let j=i+1;j<balls.length;j++){const b1=balls[i],b2=balls[j];collideDiff.subVectors(b2.position,b1.position);const dist=collideDiff.length();const minDist=b1.visualScale+b2.visualScale;if(dist<minDist&&dist>0.001){const overlap=minDist-dist;collideDiff.multiplyScalar(1/dist);const totalMass=b1.mass+b2.mass;const ratio1=b2.mass/totalMass,ratio2=b1.mass/totalMass;b1.position.addScaledVector(collideDiff,-overlap*ratio1*collideScale);b2.position.addScaledVector(collideDiff,overlap*ratio2*collideScale);relVel.subVectors(b2.velocity,b1.velocity);const velAlongNormal=relVel.dot(collideDiff);if(velAlongNormal<-0.0001){const impulse=-(1+params.bounciness)*velAlongNormal/(1/b1.mass+1/b2.mass);b1.velocity.addScaledVector(collideDiff,-impulse/b1.mass);b2.velocity.addScaledVector(collideDiff,impulse/b2.mass);}}}}}
const borderPad=0.2,xBound=viewportWidth/2-borderPad,topY=viewportHeight/2-0.05,floorY=-viewportHeight/2+0.05,zBound=2.0,restitution=0.30+0.35*dropF,contain=flyF<0.5,zContain=flyF<0.02;
for(let i=0;i<balls.length;i++){const b=balls[i],r=b.visualScale;if(contain){if(b.position.x<-xBound-r){b.position.x=-xBound-r;b.velocity.x*=params.rebound;}else if(b.position.x>xBound+r){b.position.x=xBound+r;b.velocity.x*=params.rebound;}if(b.position.y-r<floorY){b.position.y=floorY+r;if(b.velocity.y<0)b.velocity.y=-b.velocity.y*restitution;if(dropF>0.3){b.velocity.x*=0.86;b.velocity.z*=0.86;}}if(b.position.y+r>topY){b.position.y=topY-r;if(b.velocity.y>0)b.velocity.y*=params.rebound;}}if(zContain){if(b.position.z<-zBound){b.position.z=-zBound;b.velocity.z*=params.rebound;}else if(b.position.z>zBound){b.position.z=zBound;b.velocity.z*=params.rebound;}}deltaPos.copy(b.position).sub(b.meshGroup.position);if(deltaPos.lengthSq()>0.000001){rotAxis.set(deltaPos.y,-deltaPos.x,0).normalize();const rotAngle=(deltaPos.length()/b.radius)*0.95;b.meshGroup.rotateOnWorldAxis(rotAxis,rotAngle);}b.meshGroup.position.copy(b.position);}
renderer.render(scene,camera);if(!reportedReady){reportedReady=true;onReady();}};
simulateAndRender();
const handleResize=()=>{const w=container.clientWidth,h=container.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);updateFrustumBounds();assignHeartTargets();};
new ResizeObserver(handleResize).observe(container);window.addEventListener('resize',handleResize);
// Loader
let loaderValue=0,loaderDone=false;const loaderFill=document.getElementById('loaderFill'),loaderCount=document.getElementById('loaderCount'),loaderStatus=document.getElementById('loaderStatus'),loaderEl=document.getElementById('loader');let lastLoader=performance.now();
function loaderTick(now){if(loaderDone)return;const dt=Math.min(0.05,(now-lastLoader)/1000);lastLoader=now;const ready=!!window.__quadletReady;const ceiling=ready?100:92;const rate=ready?6:1.7;loaderValue+=(ceiling-loaderValue)*rate*dt;if(ready&&loaderValue>=99.4)loaderValue=100;loaderFill.style.width=Math.max(0,Math.min(100,loaderValue))+'%';loaderCount.textContent=String(Math.max(0,Math.min(100,Math.floor(loaderValue)))).padStart(3,'0')+'%';loaderStatus.textContent=loaderValue>=100?'Entering orbit':'Calibrating gravity field';if(loaderValue>=99.9&&ready){loaderDone=true;setTimeout(()=>{loaderEl.classList.add('leaving');},140);setTimeout(()=>{control.started=true;document.body.classList.add('revealed');loaderEl.style.display='none';if(window.anime&&typeof animateHero==='function')animateHero();},660);return;}requestAnimationFrame(loaderTick);}
requestAnimationFrame(loaderTick);
// Fast scroll (v1.1 fix): native scrolling, no wheel interception.
// The old Lenis-style loop moved only 9% of the remaining distance per
// frame, so every scroll took 1-2s to settle and queued wheel notches
// piled up behind it. Native scroll responds instantly, and the bubble
// physics below still read window.scrollY, so sphere movement is unchanged.
// Scroll progress + background stage
function updateProgress(){const vh=window.innerHeight||1;const progress=window.scrollY/vh;control.progress=progress;const stage=progress>1.55?2:progress>0.7?1:0;bgLayer.classList.remove('stage1','stage2');if(stage===1)bgLayer.classList.add('stage1');if(stage===2)bgLayer.classList.add('stage2');}
window.addEventListener('scroll',updateProgress,{passive:true});window.addEventListener('resize',updateProgress);updateProgress();
// Reveal
const io=new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');io.unobserve(e.target);}})},{threshold:0.15});document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
// Drawer + palettes
const THEMES=[{id:'roseGold',name:'Royal Blue & Pearl',desc:'Hyper-distinct cobalt spheres floating in soft white-slate gradients.',primary:'#2F69FF',ball:'#2F69FF'},{id:'pinkBlush',name:'Rose Blush & Crème',desc:'Sweet candy pinks and juicy strawberry accents in a pearl studio.',primary:'#FFA6B3',ball:'#FFC5C2'},{id:'voltLime',name:'Volt Lime & Slate',desc:'Electric neon volt-lime against a clean white-slate horizon.',primary:'#E1FC03',ball:'#E1FC03'},{id:'arcticBlue',name:'Arctic Sky & Crystal',desc:'Cool arctic crystal blues with a translucent glass sheen.',primary:'#96E5FF',ball:'#96E5FF'}];
let selectedTheme='roseGold';const themeWrap=document.getElementById('themeCards');
function renderThemes(){themeWrap.innerHTML=THEMES.map(t=>`<div class="themecard ${t.id===selectedTheme?'selected':''}" data-id="${t.id}"><div><strong style="font-size:12px">${t.name}</strong><div style="font-size:10px;opacity:.7">${t.desc}</div></div><span class="swatch" style="background:${t.primary}"></span></div>`).join('');themeWrap.querySelectorAll('.themecard').forEach(el=>el.addEventListener('click',()=>{selectedTheme=el.dataset.id;const th=THEMES.find(x=>x.id===selectedTheme);ballColor=th.ball;palette=getDynamicColors(ballColor);isBlack=['#141414','#18181b','#000000'].includes(ballColor.toLowerCase());palHero=palette;hemiLight.color.set(0xffffff);createBalls();scatterFar(false);localStarted=false;renderThemes();}));}
renderThemes();
const drawer=document.getElementById('drawer'),scrim=document.getElementById('scrim');
function openDrawer(){drawer.classList.add('open');scrim.classList.add('open');}function closeDrawer(){drawer.classList.remove('open');scrim.classList.remove('open');}
document.getElementById('openDrawer').addEventListener('click',openDrawer);document.getElementById('closeDrawer').addEventListener('click',closeDrawer);scrim.addEventListener('click',closeDrawer);
document.getElementById('resetTheme').addEventListener('click',()=>{selectedTheme='roseGold';ballColor='#2F69FF';palette=getDynamicColors(ballColor);isBlack=false;palHero=palette;createBalls();scatterFar(false);localStarted=false;renderThemes();});
// Planner UI
const AGENTS=['🧭 Scout — Destination Researcher','🪙 Penny — Budget Planner','🗺️ Atlas — Itinerary Builder','🛡️ Pax — Safety & Packing Checker'];
const agentCardsEl=document.getElementById('agentCards');
if(agentCardsEl)AGENTS.forEach((name,i)=>{const d=document.createElement('div');d.className='agentcard';d.id='agent-'+(i+1);d.innerHTML=`<div class="agenthead"><strong style="font-family:var(--font-raleway)">${name}</strong><span class="status" id="status-${i+1}">Waiting</span></div><div class="logs" id="logs-${i+1}"></div>`;agentCardsEl.appendChild(d);});
function setStatus(i,txt){const el=document.getElementById('status-'+i);if(!el)return;el.textContent=txt;el.className='status '+(txt==='Done'?'done':txt==='Failed'?'failed':txt==='Working'?'working':'');if(txt==='Done'&&window.anime)anime({targets:'#agent-'+i,scale:[1,1.03,1],duration:450,easing:'easeOutExpo'});}
function addLog(i,t,a,o){const el=document.getElementById('logs-'+i);if(!el)return;const div=document.createElement('div');div.className='logline';div.textContent=`Thought: ${t} | Action: ${a} | Observation: ${o}`;el.appendChild(div);el.scrollTop=el.scrollHeight;}
const RESEARCHED=['Goa','Manali','Jaipur','Kerala','Bali','Dubai','Udaipur','Varanasi','Rishikesh','Singapore','Thailand'];
function setDestination(name){document.getElementById('dest').value=name;const _nh=document.getElementById('nearbyHint');if(_nh)_nh.textContent='';document.querySelectorAll('#chips .chip').forEach(x=>x.classList.toggle('active',x.textContent===name));document.querySelectorAll('#destGallery .dest-card').forEach(x=>x.classList.toggle('active',x.dataset.dest===name));const sel=document.getElementById('destSelect');if(sel)sel.value=RESEARCHED.includes(name)?name:'Other';const sd=document.getElementById('selectedDest');if(sd)sd.textContent='Selected: '+name;}
const chipsEl=document.getElementById('chips');if(chipsEl)['Goa','Manali','Jaipur','Kerala','Bali','Dubai','Udaipur','Varanasi','Rishikesh','Singapore','Thailand'].forEach(c=>{const b=document.createElement('button');b.type='button';b.className='chip'+(c==='Goa'?' active':'');b.textContent=c;b.addEventListener('click',()=>{setDestination(c);if(window.anime)anime({targets:b,scale:[1,1.12,1],duration:350,easing:'easeOutExpo'});});chipsEl.appendChild(b);});
if(chipsEl){const routeChip=document.createElement('button');routeChip.type='button';routeChip.className='chip';routeChip.textContent='Delhi → Jaipur → Agra';routeChip.title='Multi-city route — days split evenly across the cities';routeChip.addEventListener('click',()=>{setDestination('Delhi → Jaipur → Agra');if(window.anime)anime({targets:routeChip,scale:[1,1.12,1],duration:350,easing:'easeOutExpo'});});chipsEl.appendChild(routeChip);}
const _destToggle=document.getElementById('destToggle');
const _destExamples=document.getElementById('destExamples');
function _setDestExamples(open){
  if(!_destToggle||!_destExamples)return;
  _destExamples.classList.toggle('preview',!open);
  _destToggle.setAttribute('aria-expanded',open?'true':'false');
  _destToggle.firstChild.textContent=open?'Show fewer ':'Show all 11 destinations ';
  try{localStorage.setItem('quadlet_dest_open',open?'1':'0');}catch(e){}
}
if(_destToggle){
  _destToggle.addEventListener('click',()=>_setDestExamples(_destExamples.classList.contains('preview')));
  let _savedOpen=false;try{_savedOpen=localStorage.getItem('quadlet_dest_open')==='1';}catch(e){}
  _setDestExamples(_savedOpen);
}
let _nearbyTimer=null;
const _destInput=document.getElementById('dest');
if(_destInput)_destInput.addEventListener('input',()=>{
  clearTimeout(_nearbyTimer);
  const hint=document.getElementById('nearbyHint');if(!hint)return;
  const v=_destInput.value.trim();
  if(v.length<3||RESEARCHED.includes(v)||/[→>]/.test(v)||/\bto\b/i.test(v)){hint.textContent='';return;}
  hint.textContent='Looking up nearby places…';
  _nearbyTimer=setTimeout(async()=>{
    if(_destInput.value.trim()!==v)return;
    const items=await fetchNearbyPlaces(v);
    if(_destInput.value.trim()!==v)return;
    if(!items.length){hint.textContent='';return;}
    hint.innerHTML='Nearby places (Wikipedia): '+items.slice(0,5).map(x=>esc(x.name)+' · '+x.km+' km').join(', ')+' — plan the trip to see them all.';
  },900);
});
const destGallery=document.getElementById('destGallery');
if(destGallery)
[['Goa','Beaches, food & sunsets','https://images.pexels.com/photos/1078983/pexels-photo-1078983.jpeg?auto=compress&cs=tinysrgb&w=800'],
['Manali','Mountains & adventure','https://images.pexels.com/photos/1624496/pexels-photo-1624496.jpeg?auto=compress&cs=tinysrgb&w=800'],
['Jaipur','Palaces & history','https://images.pexels.com/photos/1603650/pexels-photo-1603650.jpeg?auto=compress&cs=tinysrgb&w=800'],
['Kerala','Backwaters & nature','https://images.pexels.com/photos/962464/pexels-photo-962464.jpeg?auto=compress&cs=tinysrgb&w=800'],
['Bali','Temples & rice terraces','https://images.pexels.com/photos/2166559/pexels-photo-2166559.jpeg?auto=compress&cs=tinysrgb&w=800'],
['Dubai','Skyline & shopping','https://images.pexels.com/photos/3787839/pexels-photo-3787839.jpeg?auto=compress&cs=tinysrgb&w=800'],
['Udaipur','Lakes & palaces','https://images.pexels.com/photos/33658452/pexels-photo-33658452.jpeg?auto=compress&cs=tinysrgb&w=800'],
['Varanasi','Ghats & the Ganges','https://images.pexels.com/photos/16542333/pexels-photo-16542333.jpeg?auto=compress&cs=tinysrgb&w=800'],
['Rishikesh','Yoga & rafting','https://images.pexels.com/photos/15896015/pexels-photo-15896015.jpeg?auto=compress&cs=tinysrgb&w=800'],
['Singapore','Skyline & hawker food','https://images.pexels.com/photos/8176859/pexels-photo-8176859.jpeg?auto=compress&cs=tinysrgb&w=800'],
['Thailand','Temples & street food','https://images.pexels.com/photos/5264079/pexels-photo-5264079.jpeg?auto=compress&cs=tinysrgb&w=800']].forEach(([name,tag,img])=>{
const b=document.createElement('button');b.type='button';b.className='dest-card'+(name==='Goa'?' active':'');b.dataset.dest=name;
b.innerHTML=`<img src="${img}" alt="${name}" loading="lazy" onerror="this.style.display='none'"><div class="dest-meta"><strong>${name}</strong><span>${tag}</span></div>`;
b.addEventListener('click',()=>{setDestination(name);if(window.anime)anime({targets:b,scale:[1,1.04,1],duration:400,easing:'easeOutExpo'});});
destGallery.appendChild(b);});
const _destSel=document.getElementById('destSelect');if(_destSel)_destSel.addEventListener('change',e=>{if(e.target.value==='Other'){document.getElementById('dest').value='';const sd=document.getElementById('selectedDest');if(sd)sd.textContent='Custom destination — type it below';document.getElementById('dest').focus();}else setDestination(e.target.value);});
const _destMatch=document.getElementById('dest');if(_destMatch)_destMatch.addEventListener('input',e=>{const v=e.target.value.trim();const match=RESEARCHED.find(x=>x.toLowerCase()===v.toLowerCase());if(match)setDestination(match);else{document.querySelectorAll('#chips .chip').forEach(x=>x.classList.remove('active'));document.querySelectorAll('#destGallery .dest-card').forEach(x=>x.classList.remove('active'));const sel=document.getElementById('destSelect');if(sel)sel.value='Other';const sd=document.getElementById('selectedDest');if(sd)sd.textContent=v?'Custom destination: '+v:'No destination typed yet';}});
const interestsEl=document.getElementById('interests');const selectedInterests=new Set(['Beaches','Food']);
if(interestsEl)['Beaches','Mountains','History','Food','Shopping','Nightlife','Nature','Adventure Sports'].forEach(c=>{const b=document.createElement('button');b.type='button';b.className='pill'+(selectedInterests.has(c)?' active':'');b.textContent=c;b.addEventListener('click',()=>{if(selectedInterests.has(c)){selectedInterests.delete(c);b.classList.remove('active');}else{selectedInterests.add(c);b.classList.add('active');}if(window.anime)anime({targets:b,scale:[1,1.12,1],duration:300,easing:'easeOutExpo'});});interestsEl.appendChild(b);});
let lastPlan=null,lastReq=null,countTimer=null,lastShareId=null,lastOrigPlan=null,lastTripId=null,lastGeo={};
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function planText(p){let out=`Quadlet Trip Planner\n${p.summary?esc(p.summary.destination)+' | '+esc(p.summary.dates)+' | '+esc(p.summary.days)+' days | '+esc(p.summary.travellers)+' travellers\nTotal: '+esc(p.summary.total)+' | Budget: '+esc(p.summary.budget)+' | '+esc(p.summary.verdict):''}\n\n`;if(p.summary&&p.summary.cities&&p.summary.cities.length>1)out+=`Cities: `+p.summary.cities.map(c=>`${c.name} (${c.days} day${c.days===1?'':'s'}, ${c.total||'ranges only'})`).join(' → ')+`\n\n`;if(p.summary&&p.summary.group)out+=`Group split: ${esc(p.summary.group.per_person||'—')} each × ${esc(p.summary.group.members)} members${p.summary.group.voted_out&&p.summary.group.voted_out.length?' · voted out: '+p.summary.group.voted_out.join(', '):''}\n`;if(p.itinerary)p.itinerary.forEach(d=>{out+=`Day ${d.day}${d.city?' · '+d.city:''}\n`;d.slots.forEach(s=>out+=`  ${s.slot} (${s.time}): ${s.place} — ${s.activity}\n`);});if(p.budget&&p.budget.rows){out+=`\nBudget\n`;p.budget.rows.forEach(r=>out+=`  ${r[0]}: ${r[1]}\n`);}if(p.changes&&p.changes.length)out+=`\nChanges to fit budget:\n`+p.changes.map(c=>`  - ${c}\n`).join('');if(p.packing){const checked=new Set([...document.querySelectorAll('.pack-check:checked')].map(el=>parseInt(el.dataset.idx,10)));let pi=0;Object.entries(p.packing).forEach(([g,items])=>out+=`\nPacking: ${g}\n`+items.map(x=>`  [${checked.has(pi++)?'x':' '}] ${x}\n`).join(''));}if(p.safety){out+=`\nSafety\n`+p.safety.tips.map(x=>`  - ${x}\n`).join('')+`\nDocuments\n`+p.safety.docs.map(x=>`  - ${x}\n`).join('');}if(p._nearby&&p._nearby.length)out+=`\nNearby places (Wikipedia, within 10 km)\n`+p._nearby.map(x=>`  - ${x.name} (${x.type}, ${x.km} km)\n`).join('');return out;}
let packIdx=0;function renderPlan(p,reports){lastPlan=p;packIdx=0;const out=document.getElementById('planOut');const tone=p.summary?p.summary.tone:'';const verdictClass=tone==='ok'?'verdict-ok':tone==='bad'?'verdict-bad':'';
let html='';if(p.banner)html+=`<div class="banner">${esc(p.banner)}</div>`;if(p.missing&&p.missing.length)html+=`<div class="banner">Missing sections: ${p.missing.map(m=>esc(m.agent)+' — '+esc(m.reason)).join('; ')}</div>`;
if(p.summary)html+=`<h3 style="font-family:var(--font-raleway);margin-top:0">${esc(p.summary.destination)} — ${esc(p.summary.dates)}</h3><p>${esc(p.summary.days)} days · ${esc(p.summary.travellers)} travellers · ${esc(p.summary.style)}</p><p><strong>Total: ${esc(p.summary.total)}</strong> · Budget: ${esc(p.summary.budget)}</p><p class="${verdictClass}"><strong>${esc(p.summary.verdict)}</strong></p>${p.summary.group?`<p><strong>Group split: ${esc(p.summary.group.per_person||'—')} each × ${esc(p.summary.group.members)} members</strong>${p.summary.group.voted_out&&p.summary.group.voted_out.length?' · Voted out: '+esc(p.summary.group.voted_out.join(', ')):''}</p>`:''}`;
if(p.summary&&p.summary.cities&&p.summary.cities.length>1)html+=`<h3>Cities on this route</h3><table>${p.summary.cities.map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.days)} day${c.days===1?'':'s'}</td><td>${esc(c.total||'Ranges only')}</td><td>${esc(c.mode==='researched'?'Researched':c.mode==='skeleton'?'Skeleton — verify prices':c.mode==='unvisited'?'Not visited — no days left':'')}</td></tr>`).join('')}</table><p class="fine">Days split evenly across the route; earlier cities get the extra day when days don't divide evenly. Skeleton cities show ranges only — their share is not in the total.</p>`;
if(p.changes&&p.changes.length)html+=`<h3>What changed to fit your budget</h3><ul>${p.changes.map(c=>`<li>${esc(c)}</li>`).join('')}</ul>`;if(p.leanest)html+=`<p class="verdict-bad"><strong>Leanest plan shown — it still does not fit the budget.</strong></p>`;
if(p.places)html+=`<h3>Places to visit</h3><ul>${p.places.map(x=>`<li><strong>${esc(x[0])}</strong>: ${esc(x[1])}</li>`).join('')}</ul>`;if(p.gems)html+=`<h3>Hidden gems</h3><ul>${p.gems.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;
html+=`<div id="nearbyBox"></div>`;
if(p.itinerary)html+=`<h3>Day-wise itinerary</h3>${p.itinerary.map(d=>`<div><strong>Day ${d.day}${d.city?' · '+esc(d.city):''}</strong><ul>${d.slots.map(s=>`<li>${esc(s.slot)} (${esc(s.time)}): ${esc(s.place)} — ${esc(s.activity)}</li>`).join('')}</ul></div>`).join('')}`;
if(p.budget&&p.budget.rows)html+=`<h3>Budget breakdown</h3><table>${p.budget.rows.map(r=>`<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')}</table><p class="fine">${esc(p.budget.note||'All prices are ESTIMATES, not live bookable prices.')}</p>`;
if(p.packing)html+=`<h3>Packing list — 🛡️ Pax's checklist</h3><p class="fine" id="packProgressText"></p><div class="bar-track"><div class="bar-fill" id="packBarFill" style="width:0%"></div></div>${Object.entries(p.packing).map(([g,items])=>`<div><strong>${esc(g)}</strong><div>${items.map(x=>`<label class="pack-item"><input type="checkbox" class="pack-check" data-idx="${packIdx++}"><span>${esc(x)}</span></label>`).join('')}</div></div>`).join('')}<div id="smartPack"></div>`;
if(p.safety)html+=`<h3>Safety</h3><p>${esc(p.safety.weather)}</p><ul>${p.safety.tips.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><h3>Documents</h3><ul>${p.safety.docs.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p class="fine">General preparation guidance only, not medical advice.</p>`;
if(reports&&reports.length)html+=`<h3>Agent reports</h3>${reports.map(r=>`<details style="margin:8px 0"><summary>${esc(r.agent)}${r.error?' — Failed: '+esc(r.error):''}</summary>${(r.sections||[]).map(s=>`<div><strong>${esc(s.title)}</strong>${s.items?`<ul>${s.items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}${s.rows?`<table>${s.rows.map(row=>`<tr><td>${esc(row[0])}</td><td>${esc(row[1])}</td></tr>`).join('')}</table>`:''}</div>`).join('')}</details>`).join('')}`;
html+=`<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px"><button class="btn2" id="copyBtn">Copy</button><button class="btn2" id="dlBtn">Download</button><button class="btn2" id="pdfBtn">Download PDF</button><button class="btn2" id="icsBtn">Download calendar (.ics)</button><button class="btn2" id="shareBtn">Share link</button><button class="btn2" id="optBtn">Optimize route</button></div><p class="fine" id="shareLinkBox" style="display:none;word-break:break-all"></p><p class="fine" id="icsMsg"></p><div id="groupBox" style="margin-top:18px"></div><div id="expenseBox" style="margin-top:18px"></div><p class="fine">Download PDF opens your browser's print dialog — choose “Save as PDF”. Prices are estimates, not live bookable prices. Nothing here books or charges anything.</p>`;
out.innerHTML=html;if(window.anime)anime({targets:'#planOut > *',opacity:[0,1],translateY:[16,0],duration:600,delay:anime.stagger(60),easing:'easeOutExpo'});
document.getElementById('copyBtn').addEventListener('click',async()=>{const txt=planText(p);try{await navigator.clipboard.writeText(txt);document.getElementById('copyBtn').textContent='Copied!';}catch(e){const ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();document.getElementById('copyBtn').textContent='Copied!';}});
document.getElementById('dlBtn').addEventListener('click',()=>{const blob=new Blob([planText(p)],{type:'text/plain'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='quadlet-trip-plan.txt';a.click();URL.revokeObjectURL(a.href);});
document.getElementById('pdfBtn').addEventListener('click',()=>window.print());
document.getElementById('icsBtn').addEventListener('click',()=>downloadICS(p));
const shareBtnEl=document.getElementById('shareBtn');
if(shareBtnEl){
  shareBtnEl.textContent=shareByKey[shareKeyFor(p)]?'Stop sharing':'Share link';
  shareBtnEl.addEventListener('click',async()=>{
    const box=document.getElementById('shareLinkBox');
    const key=shareKeyFor(p); if(!key) return;
    if(!quadletSession){const m=document.getElementById('acctModal');if(m){m.style.display='flex';acctMsg('Sign in to share this trip — anyone with the link will see the same plan.');}return;}
    const dest=p.summary.destination,dates=p.summary.dates;
    try{
      if(shareByKey[key]){
        await acctApi('/api/trips/share','DELETE',{dest,dates});
        delete shareByKey[key]; shareBtnEl.textContent='Share link'; if(box){box.style.display='none';box.textContent='';}
        return;
      }
      let d;
      try{ d=await acctApi('/api/trips/share','POST',{dest,dates}); }
      catch(e){ await acctApi('/api/trips','POST',{plan:p}); d=await acctApi('/api/trips/share','POST',{dest,dates}); }
      shareByKey[key]=d.share_id;
      const link=location.origin+'/?trip='+d.share_id;
      shareBtnEl.textContent='Stop sharing';
      if(box){box.style.display='block';box.innerHTML='Share link: <a href="'+link+'">'+link+'</a>';}
      try{await navigator.clipboard.writeText(link);}catch(e){}
      lastShareId=d.share_id; renderGroup(p); renderExpenses(p);
    }catch(e){ if(box){box.style.display='block';box.textContent='Could not share: '+e.message;} }
  });
}

const packKey='quadlet_packing_'+((p.summary?p.summary.destination+'|'+p.summary.dates:'')||'plan').replace(/[^a-zA-Z0-9]/g,'_');
const updatePack=()=>{const all=[...document.querySelectorAll('.pack-check')];const done=all.filter(c=>c.checked).length;const txt=document.getElementById('packProgressText');if(txt)txt.textContent=all.length?`${done} of ${all.length} packed`:'No packing items in this plan.';const fill=document.getElementById('packBarFill');if(fill)fill.style.width=(all.length?Math.round(done/all.length*100):0)+'%';all.forEach(c=>c.closest('.pack-item').classList.toggle('done',c.checked));try{localStorage.setItem(packKey,JSON.stringify(all.map(c=>c.checked)));}catch(e){}};
try{const saved=JSON.parse(localStorage.getItem(packKey)||'[]');document.querySelectorAll('.pack-check').forEach((c,i)=>{if(saved[i])c.checked=true;});}catch(e){}
document.querySelectorAll('.pack-check').forEach(c=>c.addEventListener('change',updatePack));updatePack();
if(!p.summary||!p.summary.group)lastOrigPlan=p;renderDashboard(p);if(!p.summary||!p.summary.group){savePlan(p);uploadPlanToCloud(p);}renderWeatherMap(p);renderGroup(p);renderExpenses(p);renderNearbyForPlan(p);}
import {buildICS as _buildICS, downloadICS as _downloadICS, fetchNearbyPlaces as _fetchNearbyRaw, renderNearbyForPlan as _renderNearbyRaw} from './nearby-ics.js?v=7.0';
import {initCompare} from './compare.js?v=7.0';
import {initAI} from './ai.js?v=7.0';
const _ai=initAI({esc,setDestination,getPlan:()=>lastPlan,getForecast:()=>lastWeather,getGeo:()=>lastGeo,saveCurrentPlan});
function saveCurrentPlan(){if(lastPlan){savePlan(lastPlan);try{uploadPlanToCloud(lastPlan);}catch(e){}}}
const _compare=initCompare({getAllTrips,esc,parseMoney});
function buildICS(p){return _buildICS(p,lastReq);}
function downloadICS(p){_downloadICS(p,lastReq);}
function fetchNearbyPlaces(n){return _fetchNearbyRaw(n);}
function renderNearbyForPlan(p){return _renderNearbyRaw(p,esc,fetchNearbyPlaces);}
// ---- Expense tracker (v5.0) ----
async function renderExpenses(p){
  const box=document.getElementById('expenseBox'); if(!box) return;
  const cur=(p&&p.summary&&String(p.summary.budget||'').startsWith('$'))?'USD':'INR';
  if(!quadletSession){
    box.innerHTML='<h3>Expenses</h3><p class="fine">Sign in to track expenses on this trip — spending saves to your account and splits across the group.</p>';
    return;
  }
  const src=lastTripId?('/api/trips/'+encodeURIComponent(lastTripId)+'/expenses'):lastShareId?('/api/groups/'+encodeURIComponent(lastShareId)+'/expenses'):null;
  if(!src){
    box.innerHTML='<h3>Expenses</h3><p class="fine">This trip is not saved to your account yet — it saves automatically while you are signed in. Once saved (or shared), add expenses here and split them across the group.</p>';
    return;
  }
  let st;
  try{ st=await acctApi(src,'GET'); }
  catch(e){ box.innerHTML='<h3>Expenses</h3><p class="fine">Could not load expenses: '+esc(e.message)+'</p>'; return; }
  renderExpenseState(box,p,st,src,cur);
}
function renderExpenseState(box,p,st,src,cur){
  const sym=cur==='USD'?'$':'₹';
  const spent=parseMoney(st.total||'0');
  const budget=parseMoney(st.budget||'0');
  const left=budget-spent;
  const rows=(st.expenses||[]).map(e=>`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0"><span style="flex:1;min-width:140px"><strong>${esc(e.category)}</strong> · ${esc(e.currency==='USD'?'$':'₹')}${Number(e.amount).toLocaleString('en-IN')}${e.note?' — '+esc(e.note):''} <span class="fine">(${esc(e.email)}${e.mine?' · you':''})</span></span>${(e.mine||st.role==='owner')?`<button class="btn2" data-del="${esc(e.id)}" title="Delete expense">✕</button>`:''}</div>`).join('') || '<p class="fine">No expenses yet — add the first one below.</p>';
  const bals=(st.balances||[]).map(b=>`<tr><td>${esc(b.email)}</td><td>paid ${esc(b.paid)}</td><td>share ${esc(b.share)}</td><td>${b.owes_inr>0?'owes '+sym+Math.abs(b.owes_inr).toLocaleString('en-IN'):b.owes_inr<0?'is owed '+sym+Math.abs(b.owes_inr).toLocaleString('en-IN'):'settled'}</td></tr>`).join('');
  box.innerHTML=`<h3>Expenses</h3><p><strong>Spent ${esc(st.total||sym+'0')}</strong>${st.budget?` of budget ${esc(st.budget)} — ${left>=0?sym+Math.round(left).toLocaleString('en-IN')+' left':sym+Math.round(-left).toLocaleString('en-IN')+' over budget'}`:''} · ${esc(st.per_person||'')} each</p>${rows}${bals?`<h3>Who owes whom</h3><table>${bals}</table>`:''}<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><input id="expAmt" type="number" min="1" step="any" placeholder="Amount" style="width:110px"><select id="expCat"><option>Food</option><option>Stay</option><option>Transport</option><option>Activities</option><option>Shopping</option><option>Other</option></select><input id="expNote" type="text" placeholder="Note (optional)" style="flex:1;min-width:140px"><button class="btn2" id="expAddBtn">+ Add expense</button></div><p class="fine" id="expMsg"></p>`;
  const addBtn=document.getElementById('expAddBtn');
  if(addBtn) addBtn.addEventListener('click', async ()=>{
    const m=document.getElementById('expMsg');
    const amt=parseFloat((document.getElementById('expAmt')||{}).value);
    const cat=(document.getElementById('expCat')||{}).value||'Other';
    const note=((document.getElementById('expNote')||{}).value||'').trim();
    if(!amt||amt<=0){ if(m) m.textContent='Enter an amount above 0.'; return; }
    if(m) m.textContent='Adding…';
    try{ const ns=await acctApi(src,'POST',{amount:amt,currency:cur,category:cat,note}); renderExpenseState(box,p,ns,src,cur); }
    catch(e){ if(m) m.textContent='Could not add expense: '+e.message; }
  });
  box.querySelectorAll('[data-del]').forEach(btn=>btn.addEventListener('click', async ()=>{
    const m=document.getElementById('expMsg');
    try{ const ns=await acctApi('/api/expenses/'+encodeURIComponent(btn.dataset.del),'DELETE'); renderExpenseState(box,p,ns,src,cur); }
    catch(e){ if(m) m.textContent='Could not delete expense: '+e.message; }
  }));
}
// ---- Group trips (Phase 3) ----
async function renderGroup(p){
  const box=document.getElementById('groupBox'); if(!box) return;
  const key=shareKeyFor(p);
  const sid=lastShareId||shareByKey[key];
  if(!sid){box.innerHTML='<h3>Group trip</h3><p class="fine">Share this plan with the Share link above — friends join with their Quadlet account, vote on activities and split the total equally.</p>';return;}
  if(!quadletSession){
    box.innerHTML='<h3>Group trip</h3><p class="fine">This trip is shared as a group trip. Sign in to join it, vote on activities and see your share of the split.</p><button class="btn2" id="groupSignInBtn">Sign in to join</button>';
    const b=document.getElementById('groupSignInBtn'); if(b) b.addEventListener('click',()=>{const m=document.getElementById('acctModal'); if(m){m.style.display='flex'; acctMsg('Sign in to join this group trip — anyone with the link joins with their Quadlet account.');}});
    return;
  }
  let st;
  try{ st=await acctApi('/api/groups/'+encodeURIComponent(sid),'GET'); }
  catch(e){
    box.innerHTML='<h3>Group trip</h3><p class="fine">'+esc(p.summary?p.summary.destination:'This trip')+' is shared as a group trip.</p><button class="btn2" id="groupJoinBtn">Join this group trip</button><p class="fine" id="groupMsg"></p>';
    const b=document.getElementById('groupJoinBtn');
    if(b) b.addEventListener('click', async ()=>{
      const m=document.getElementById('groupMsg'); if(m) m.textContent='Joining…';
      try{ const ns=await acctApi('/api/groups/join','POST',{share_id:sid}); renderGroupState(box,p,sid,ns); }
      catch(e2){ if(m) m.textContent='Could not join: '+e2.message; }
    });
    return;
  }
  renderGroupState(box,p,sid,st);
}
function renderGroupState(box,p,sid,st){
  const members=(st.members||[]).map(m=>`<li>${esc(m.email)}${m.role==='owner'?' (owner)':''}</li>`).join('');
  const acts=(st.activities||[]).map(a=>{
    const up=a.my_vote===1?' style="background:#0E2AC5;color:#fff"':'';
    const dn=a.my_vote===-1?' style="background:#b91c1c;color:#fff"':'';
    return `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0"><span style="flex:1;min-width:140px"><strong>${esc(a.name)}</strong>${a.city?' · '+esc(a.city):''}${a.price?' · '+esc(a.price)+' total':''}${a.out?' — <strong>voted out</strong>':''}</span><span class="fine">👍 ${a.keep} · 👎 ${a.drop}</span><button class="btn2" data-vote="1" data-act="${esc(a.name)}"${up}>👍 Keep</button><button class="btn2" data-vote="-1" data-act="${esc(a.name)}"${dn}>👎 Drop</button></div>`;
  }).join('') || '<p class="fine">No ticketed activities to vote on in this plan — the budget cuts already removed them. Plans with activities left show votes here.</p>';
  const split=st.per_person
    ? `<table>${st.members.map(m=>`<tr><td>${esc(m.email)}${m.role==='owner'?' (owner)':''}</td><td>${esc(st.per_person)} each</td></tr>`).join('')}</table><p class="fine">Equal split of ${esc(st.total||'')} across ${st.members.length} member${st.members.length===1?'':'s'}${st.partial?' — partial total, skeleton cities not counted':''}.${st.saved?' Group votes saved '+esc(st.saved)+' so far.':''}</p>`
    : '<p class="fine">Split unavailable — this plan has ranges only, not a priced total.</p>';
  box.innerHTML=`<h3>Group trip — ${esc(st.members.length)} member${st.members.length===1?'':'s'}</h3><ul>${members}</ul><h3>Vote on activities</h3>${acts}<p class="fine">An activity drops out when more members vote 👎 than 👍. Votes update the split below.</p><h3>Cost split</h3>${split}<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px"><button class="btn2" id="groupApplyBtn">Apply group votes to the plan</button><button class="btn2" id="groupOrigBtn">Show original plan</button></div><p class="fine" id="groupMsg"></p>`;
  box.querySelectorAll('[data-vote]').forEach(btn=>btn.addEventListener('click', async ()=>{
    const act=btn.dataset.act, v=parseInt(btn.dataset.vote,10);
    const cur=st.activities.find(a=>a.name===act);
    const vote=(cur&&cur.my_vote===v)?0:v;
    try{ const ns=await acctApi('/api/groups/vote','POST',{share_id:sid,activity:act,vote}); renderGroupState(box,p,sid,ns); }
    catch(e){ const m=document.getElementById('groupMsg'); if(m) m.textContent='Vote failed: '+e.message; }
  }));
  const apply=document.getElementById('groupApplyBtn');
  if(apply) apply.addEventListener('click', async ()=>{
    const m=document.getElementById('groupMsg');
    try{
      const d=await acctApi('/api/groups/'+encodeURIComponent(sid)+'/plan','GET');
      lastPlan=d.plan; renderPlan(d.plan,[]);
      const m2=document.getElementById('groupMsg'); if(m2) m2.textContent=(d.group.voted_out||[]).length?('Group votes applied — '+(d.group.voted_out||[]).join(', ')+' voted out.'):'No activities voted out yet — showing the original plan.';
    }catch(e){ if(m) m.textContent='Could not load the group plan: '+e.message; }
  });
  const orig=document.getElementById('groupOrigBtn');
  if(orig) orig.addEventListener('click', ()=>{
    if(lastOrigPlan){ renderPlan(lastOrigPlan,[]); return; }
    if(lastShareId){ fetch('/api/shared/'+encodeURIComponent(lastShareId)).then(r=>r.json()).then(d=>{ lastPlan=d.plan; renderPlan(d.plan,[]); }).catch(()=>{}); }
  });
}
function parseMoney(s){if(!s)return 0;const n=String(s).replace(/[^0-9.]/g,'');return parseFloat(n)||0;}
function renderDashboard(p){const bars=document.getElementById('budgetBars');if(!bars)return;let rows=[];if(p.budget&&p.budget.rows)rows=p.budget.rows.filter(r=>r[0]!=='Total');const isRange=!parseMoney(p.summary?p.summary.total:'');const total=parseMoney(p.summary?p.summary.total:'')||rows.reduce((a,r)=>a+parseMoney(r[1]),0)||1;
bars.innerHTML=isRange?rows.map(r=>`<div class="bar-row"><div class="bar-label"><span>${esc(r[0])}</span><span>${esc(r[1])}</span></div></div>`).join('')+'<p class="fine" style="margin-top:10px">Ranges only — this trip has no fixed total, so no percentages are shown.</p>':rows.map(r=>{const v=parseMoney(r[1]);const pct=Math.round(v/total*100);return `<div class="bar-row"><div class="bar-label"><span>${esc(r[0])}</span><span>${esc(r[1])} · ${pct}%</span></div><div class="bar-track"><div class="bar-fill" data-pct="${pct}"></div></div></div>`;}).join('');
const usedPct=isRange?0:Math.min(100,Math.round(total/(parseMoney(p.summary?p.summary.budget:'')||total)*100));const donutLabelEl=document.getElementById('donutLabel');if(isRange)donutLabelEl.textContent='Ranges only — no fixed total';else{donutLabelEl.textContent=usedPct+'% of budget used';if(window.anime){const cnt={v:0};anime({targets:cnt,v:usedPct,duration:1000,easing:'easeOutExpo',update:()=>{donutLabelEl.textContent=Math.round(cnt.v)+'% of budget used';}});}}
const dayEl=document.getElementById('dayGraph');const days=p.itinerary?p.itinerary.length:1;const by={};if(p.budget&&p.budget.rows){p.budget.rows.forEach(r=>by[r[0]]=parseMoney(r[1]));}
let perDay=[];for(let d=0;d<days;d++){let v=0;v+=(by.Food||0)/days+(by['Local Transport']||0)/days+(by.Miscellaneous||0)/days;if(days>1&&d<days-1)v+=(by.Stay||0)/(days-1);if(d===0)v+=(by.Travel||0);if(days>2&&d>0&&d<days-1)v+=(by.Activities||0)/(days-2);else if(days<=2&&d===0)v+=(by.Activities||0);perDay.push(Math.round(v));}if(perDay.length)perDay[perDay.length-1]+=total-perDay.reduce((a,b)=>a+b,0);
const maxPer=Math.max(...perDay,1);dayEl.innerHTML=isRange?'<p class="fine">Per-day spend needs fixed prices — this trip uses ranges only, so no per-day estimate is shown.</p>':perDay.map((v,i)=>`<div class="bar-row"><div class="bar-label"><span>Day ${i+1}</span><span>₹${v.toLocaleString('en-IN')}</span></div><div class="bar-track"><div class="bar-fill" data-pct="${Math.round(v/maxPer*100)}"></div></div></div>`).join('');
const tl=document.getElementById('timeline');tl.innerHTML=p.itinerary?p.itinerary.map(d=>`<div class="timeline-item"><strong>Day ${d.day}${d.city?' · '+esc(d.city):''}</strong><div>${d.slots.map(s=>esc(s.slot)+': '+esc(s.place)).join(' · ')}</div></div>`).join(''):'<p class="fine">No itinerary in this plan.</p>';
if(window.anime){anime({targets:'#budgetBars .bar-fill, #dayGraph .bar-fill',width:el=>el.dataset.pct+'%',easing:'easeOutExpo',duration:900,delay:anime.stagger(80)});anime({targets:'#donut',strokeDashoffset:[339.29,339.29*(1-usedPct/100)],easing:'easeOutExpo',duration:1000});anime({targets:'#timeline .timeline-item',translateX:[20,0],opacity:[0,1],easing:'easeOutExpo',duration:600,delay:anime.stagger(100)});}else{document.querySelectorAll('#budgetBars .bar-fill, #dayGraph .bar-fill').forEach(el=>el.style.width=el.dataset.pct+'%');document.getElementById('donut').style.strokeDashoffset=339.29*(1-usedPct/100);}
if(countTimer)clearInterval(countTimer);const startStr=lastReq?lastReq.start:null;const note=document.getElementById('countNote');
function tick(){const cd0=document.getElementById('countdown');if(!startStr){cd0.textContent='— days : — hours : — mins : — secs';note.textContent='Run a fresh trip to start the countdown.';return;}const target=new Date(startStr+'T00:00:00');const diff=target-Date.now();const cd=document.getElementById('countdown');if(diff<=0){cd.textContent='Trip date reached — have a great trip!';note.textContent='Countdown is to the trip start date you entered.';return;}const dd=Math.floor(diff/86400000),hh=Math.floor(diff/3600000)%24,mm=Math.floor(diff/60000)%60,ss=Math.floor(diff/1000)%60;cd.textContent=`${dd} days : ${String(hh).padStart(2,'0')} hours : ${String(mm).padStart(2,'0')} mins : ${String(ss).padStart(2,'0')} secs`;note.textContent='Live countdown to '+startStr+'.';}
tick();countTimer=setInterval(tick,1000);}
// Saved plans
let savedInMemory=[];let storageBlocked=false;try{localStorage.setItem('__quadlet_test','1');localStorage.removeItem('__quadlet_test');}catch(e){storageBlocked=true;}
function getSaved(){if(storageBlocked)return savedInMemory;try{return JSON.parse(localStorage.getItem('quadlet_saved')||'[]');}catch(e){return [];}}
function getAllTrips(){const local=getSaved();const seen=new Set(local.map(x=>x.dest+'|'+x.dates));const out=[...local];for(const c of cloudTrips){if(!seen.has(c.dest+'|'+c.dates))out.push(c);}return out;}
function savePlan(p){const item={dest:p.summary?p.summary.destination:'',dates:p.summary?p.summary.dates:'',total:p.summary?p.summary.total:'',plan:p};let list=getSaved();list=list.filter(x=>!(x.dest===item.dest&&x.dates===item.dates));list.unshift(item);list=list.slice(0,10);if(storageBlocked)savedInMemory=list;else{try{localStorage.setItem('quadlet_saved',JSON.stringify(list));}catch(e){storageBlocked=true;savedInMemory=list;}}

renderSaved();}
function renderSaved(){const el=document.getElementById('savedList');const note=document.getElementById('savedNote');if(!el||!note)return;note.textContent=(quadletEmail ? ('Cloud account: ' + quadletEmail + ' — cloud trips load below your browser trips. ') : '') + (storageBlocked?'Note: browser storage is blocked, so saved plans are kept only in memory for this session.':'Saved in your browser (localStorage). Click a saved trip to view it again.');const list=getSaved();el.innerHTML=list.length?list.map((x,i)=>`<div class="card" style="padding:14px;margin:8px 0;cursor:pointer" data-i="${i}"><span class="cmpick"><input type="checkbox" data-cmp data-key="${esc(x.dest)}|${esc(x.dates)}"> Compare</span><strong>${esc(x.dest)}</strong> · ${esc(x.dates)} · ${esc(x.total)}</div>`).join(''):'<p class="fine">No saved plans yet.</p>';if(window.anime)anime({targets:'#savedList .card',opacity:[0,1],translateY:[12,0],duration:500,delay:anime.stagger(80),easing:'easeOutExpo'});el.querySelectorAll('[data-i]').forEach(div=>div.addEventListener('click',()=>{const item=getSaved()[parseInt(div.dataset.i)];if(item){lastTripId=null;lastShareId=null;lastPlan=item.plan;lastReq={start:''};if(document.getElementById('planOut')){renderPlan(item.plan,[]);document.getElementById('plan').scrollIntoView({behavior:'smooth'});}else{try{sessionStorage.setItem('quadlet_open_plan',JSON.stringify(item.plan));}catch(e){}location.href='/';}}}));
  if(quadletSession){
    const wrap=document.createElement('div');
    wrap.innerHTML = cloudTrips.length
      ? '<p class="fine" style="margin-top:14px">☁️ Cloud trips (same account, any device):</p>' + cloudTrips.map((x,i)=>`<div class="card" style="padding:14px;margin:8px 0;cursor:pointer" data-c="${i}"><span class="cmpick"><input type="checkbox" data-cmp data-key="${esc(x.dest)}|${esc(x.dates)}"> Compare</span><strong>${esc(x.dest)}</strong> · ${esc(x.dates)} · ${esc(x.total)}</div>`).join('')
      : '<p class="fine" style="margin-top:14px">☁️ Cloud trips: none yet — plan a trip while signed in, or upload your browser trips from the account panel.</p>';
    el.appendChild(wrap);
    wrap.querySelectorAll('[data-c]').forEach(div=>div.addEventListener('click',()=>{const item=cloudTrips[parseInt(div.dataset.c)];if(item&&item.plan){lastTripId=item.id;lastShareId=null;lastPlan=item.plan;lastReq={start:''};if(document.getElementById('planOut')){renderPlan(item.plan,[]);document.getElementById('plan').scrollIntoView({behavior:'smooth'});}else{try{sessionStorage.setItem('quadlet_open_plan',JSON.stringify(item.plan));}catch(e){}location.href='/';}}}));
  }
  if(_compare)_compare.wire();
}
// ---- Accounts + cloud trips (v4.0) ----
let quadletSession=null, quadletEmail=null, cloudTrips=[];
const shareByKey={};
function shareKeyFor(pp){return pp&&pp.summary?(pp.summary.destination+'|'+pp.summary.dates):'';}
function acctHeaders(){return quadletSession?{'Authorization':'Bearer '+quadletSession}:{};}
async function acctApi(path, method, body){
  const res = await fetch(path, {method, headers:{'Content-Type':'application/json', ...acctHeaders()}, body: body?JSON.stringify(body):undefined});
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.detail || ('Error '+res.status));
  return data;
}
async function refreshCloudTrips(){
  if(!quadletSession){cloudTrips=[]; return;}
  try{ const d = await acctApi('/api/trips','GET'); cloudTrips = d.trips || []; if(typeof _dashInit==='function')_dashInit(); }
  catch(e){ cloudTrips=[]; }
}
async function uploadPlanToCloud(plan){
  if(!quadletSession || !plan) return;
  try{ const d=await acctApi('/api/trips','POST',{plan}); if(d&&d.id){lastTripId=d.id; renderExpenses(lastPlan);} await refreshCloudTrips(); renderSaved(); }
  catch(e){ /* cloud save is best-effort; the browser copy is already saved */ }
}
function acctUI(){
  const btn = document.getElementById('accountBtn');
  if(btn) btn.textContent = quadletEmail ? quadletEmail : 'Sign in';
  const out = document.getElementById('acctSignedOut'), inn = document.getElementById('acctSignedIn');
  if(out) out.style.display = quadletSession ? 'none' : 'block';
  if(inn) inn.style.display = quadletSession ? 'block' : 'none';
  const who = document.getElementById('acctWho');
  if(who) who.textContent = quadletEmail ? ('Signed in as ' + quadletEmail) : '';
}
function acctMsg(m){ const el=document.getElementById('acctMsg'); if(el) el.textContent = m || ''; }
function acctWire(){
  const btn = document.getElementById('accountBtn'), modal = document.getElementById('acctModal');
  if(!btn || !modal) return;
  let googleRendered=false, googleAttempts=0;
  async function initGoogleBtn(){
    if(googleRendered) return;
    const wrap=document.getElementById('googleBtn'); if(!wrap) return;
    try{
      const cfg=await fetch('/api/auth/config').then(r=>r.json());
      const cid=cfg.google_client_id; if(!cid) return;
      if(!(window.google && google.accounts && google.accounts.id)){
        if(googleAttempts++ < 10) setTimeout(initGoogleBtn, 500);
        return;
      }
      google.accounts.id.initialize({client_id: cid, callback: async (resp)=>{
        acctMsg('Signing in with Google…');
        try{
          const d=await acctApi('/api/auth/google','POST',{credential: resp.credential});
          quadletSession=d.token; quadletEmail=d.email;
          try{ localStorage.setItem('quadlet_session', quadletSession); localStorage.setItem('quadlet_email', quadletEmail); }catch(e){}
          acctMsg('Signed in with Google.');
          await refreshCloudTrips(); acctUI(); renderSaved();
        }catch(e){ acctMsg(e.message); }
      }});
      google.accounts.id.renderButton(wrap, {theme:'outline', size:'large', shape:'pill', text:'continue_with', width: 300});
      googleRendered=true;
    }catch(e){ /* Google button unavailable; email sign-in still works */ }
  }
  btn.addEventListener('click', ()=>{ modal.style.display='flex'; acctUI(); initGoogleBtn(); });
  const close = ()=>{ modal.style.display='none'; };
  document.getElementById('acctClose').addEventListener('click', close);
  modal.addEventListener('click', e=>{ if(e.target===modal) close(); });
  const doAuth = async (path)=>{
    const email = document.getElementById('acctEmail').value.trim();
    const pass = document.getElementById('acctPass').value;
    acctMsg('Working…');
    try{
      const d = await acctApi(path, 'POST', {email, password: pass});
      quadletSession = d.token; quadletEmail = d.email;
      try{ localStorage.setItem('quadlet_session', quadletSession); localStorage.setItem('quadlet_email', quadletEmail); }catch(e){}
      acctMsg('Signed in. Your cloud trips will load below.');
      await refreshCloudTrips(); acctUI(); renderSaved();
    }catch(e){ acctMsg(e.message); }
  };
  document.getElementById('acctSignIn').addEventListener('click', ()=>doAuth('/api/auth/login'));
  document.getElementById('acctRegister').addEventListener('click', ()=>doAuth('/api/auth/register'));
  document.getElementById('acctUpload').addEventListener('click', async ()=>{
    acctMsg('Uploading…');
    try{
      const list = getSaved();
      for(const item of list){ if(item.plan) await acctApi('/api/trips','POST',{plan:item.plan}); }
      await refreshCloudTrips(); renderSaved();
      acctMsg(list.length ? ('Uploaded ' + list.length + ' trip(s) to your cloud account.') : 'No browser trips to upload yet.');
    }catch(e){ acctMsg(e.message); }
  });
  document.getElementById('acctDelete').addEventListener('click', async ()=>{
    if(!confirm('Delete your account and all its cloud trips? This cannot be undone. Your browser trips stay on this device.')) return;
    acctMsg('Deleting…');
    try{
      await acctApi('/api/auth/me','DELETE');
      quadletSession=null; quadletEmail=null; cloudTrips=[];
      try{ localStorage.removeItem('quadlet_session'); localStorage.removeItem('quadlet_email'); }catch(e){}
      acctUI(); renderSaved(); acctMsg('Account deleted.');
    }catch(e){ acctMsg(e.message); }
  });
  document.getElementById('acctSignOut').addEventListener('click', async ()=>{
    try{ await acctApi('/api/auth/logout','POST'); }catch(e){}
    quadletSession=null; quadletEmail=null; cloudTrips=[];
    try{ localStorage.removeItem('quadlet_session'); localStorage.removeItem('quadlet_email'); }catch(e){}
    acctUI(); renderSaved(); acctMsg('Signed out. Your browser trips are still here.');
  });
}
try{ quadletSession = localStorage.getItem('quadlet_session'); quadletEmail = localStorage.getItem('quadlet_email'); }catch(e){}
acctWire(); acctUI();
if(quadletSession){ refreshCloudTrips().then(()=>renderSaved()); }
renderSaved();
function animateHero(){if(!window.anime)return;anime({targets:'.hero-row>div, #tripForm, #destGallery .dest-card, .how-card',opacity:[0,1],translateY:[24,0],duration:800,delay:anime.stagger(90),easing:'easeOutExpo',complete:function(){document.querySelectorAll('.hero-row>div, #tripForm, #destGallery .dest-card, .how-card').forEach(el=>{el.style.transform='';el.style.opacity='';});}});}
const qtEl=document.querySelector('.quote-text');if(qtEl&&window.anime){const qwords=qtEl.textContent.split(' ');qtEl.innerHTML=qwords.map(w=>`<span style="display:inline-block;opacity:0">${w}</span>`).join(' ');const qio=new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting){anime({targets:'.quote-text span',opacity:[0,1],translateY:[14,0],duration:700,delay:anime.stagger(90),easing:'easeOutExpo'});qio.disconnect();}})},{threshold:0.4});qio.observe(qtEl);}
// Live weather (Open-Meteo, free, no key) + day-wise map (Leaflet + OSM)
const DEST_COORDS={goa:[15.2993,74.1240],manali:[32.2396,77.1887],jaipur:[26.9124,75.7873],kerala:[9.9312,76.2673],bali:[-8.3405,115.0920],dubai:[25.2048,55.2708]};
function wmo(code){if(code===0)return['☀️','Clear sky'];if(code===1)return['🌤️','Mainly clear'];if(code===2)return['⛅','Partly cloudy'];if(code===3)return['☁️','Overcast'];if(code===45||code===48)return['🌫️','Fog'];if(code>=51&&code<=57)return['🌦️','Drizzle'];if(code>=61&&code<=67)return['🌧️','Rain'];if(code>=71&&code<=77)return['🌨️','Snow'];if(code>=80&&code<=82)return['🌧️','Rain showers'];if(code>=95)return['⛈️','Thunderstorm'];return['🌡️','—'];}
async function geoSearch(q){try{const r=await fetch('https://geocoding-api.open-meteo.com/v1/search?name='+encodeURIComponent(q)+'&count=1&language=en&format=json');const j=await r.json();if(j.results&&j.results[0])return[j.results[0].latitude,j.results[0].longitude,j.results[0].name];}catch(e){}return null;}
let lastWeather=null;let quadletMap=null;
async function renderWeatherMap(p){
const dest=p.summary?p.summary.destination:'';const wmDest=(p.summary&&p.summary.cities&&p.summary.cities.length)?p.summary.cities[0].name:dest;const title=document.getElementById('wmTitle'),note=document.getElementById('wmNote'),cur=document.getElementById('wmCurrent'),daysEl=document.getElementById('wmDays'),mapNote=document.getElementById('mapNote');
if(!dest){title.textContent='Plan a trip to see its weather & map';note.textContent='Run a trip above and this section fills with live weather for that destination.';return;}
title.textContent='Weather & map — '+dest;note.textContent='Loading live weather…';cur.innerHTML='';daysEl.innerHTML='';
let coords=DEST_COORDS[wmDest.toLowerCase()]||null;let placeName=wmDest;
lastGeo={};
if(!coords){const g=await geoSearch(wmDest);if(g){coords=[g[0],g[1]];placeName=g[2];}}
if(!coords){note.textContent='Could not locate '+dest+' for live weather. Try a researched destination (Goa, Manali, Jaipur, Kerala, Bali, Dubai, Udaipur, Varanasi, Rishikesh, Singapore, Thailand).';mapNote.textContent='Map unavailable: destination could not be located.';return;}
lastGeo['__dest__']=coords;
try{
const res=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${coords[0]}&longitude=${coords[1]}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=16`);
const w=await res.json();if(!w.current)throw new Error('no weather');
const wc=wmo(w.current.weather_code);cur.innerHTML=`<p><strong>Right now in ${esc(placeName)}: ${Math.round(w.current.temperature_2m)}°C ${wc[0]} ${wc[1]}</strong> · Humidity ${w.current.relative_humidity_2m}% · Wind ${w.current.wind_speed_10m} km/h</p>`;
const tripStart=lastReq&&lastReq.start?lastReq.start:null,tripEnd=lastReq&&lastReq.end?lastReq.end:null;
let dayIdx=[];if(tripStart&&tripEnd&&w.daily&&w.daily.time){w.daily.time.forEach((d,i)=>{if(d>=tripStart&&d<=tripEnd)dayIdx.push(i);});}
if(dayIdx.length){note.textContent='Day-wise forecast for your trip dates (Open-Meteo, next 16 days only).';}
else{note.textContent='Your trip dates are beyond the 16-day forecast window (or this is a saved plan), so here is the current 7-day outlook for packing — check back closer to the trip for date-matched days.';dayIdx=[0,1,2,3,4,5,6].filter(i=>w.daily&&w.daily.time&&i<w.daily.time.length);}
daysEl.innerHTML=dayIdx.map(i=>{const dc=wmo(w.daily.weather_code[i]);return `<div class="card" style="padding:10px 12px;min-width:130px"><strong>${esc(w.daily.time[i])}</strong><div style="font-size:22px">${dc[0]} ${dc[1]}</div><div>${Math.round(w.daily.temperature_2m_max[i])}° / ${Math.round(w.daily.temperature_2m_min[i])}°C</div><div class="fine">Rain chance ${w.daily.precipitation_probability_max?w.daily.precipitation_probability_max[i]:'—'}%</div></div>`;}).join('');
lastWeather={dest:placeName,current:w.current,days:dayIdx.map(i=>({date:w.daily.time[i],max:w.daily.temperature_2m_max[i],min:w.daily.temperature_2m_min[i],rain:w.daily.precipitation_probability_max?w.daily.precipitation_probability_max[i]:null,cond:wmo(w.daily.weather_code[i])[1]}))};if(_ai&&_ai.onForecast)_ai.onForecast(lastWeather);
}catch(e){note.textContent='Live weather could not be loaded right now. Your plan is unaffected — try refreshing.';cur.innerHTML='';daysEl.innerHTML='';}
if(!window.L){mapNote.textContent='Map could not load — Leaflet CDN unavailable. Try refreshing.';return;}
try{
if(quadletMap){quadletMap.remove();quadletMap=null;}
quadletMap=L.map('tripMap').setView(coords,11);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(quadletMap);
L.marker(coords).addTo(quadletMap).bindPopup('<strong>'+esc(placeName)+'</strong><br>Trip destination');
let stops=[];if(p.itinerary)p.itinerary.forEach(d=>d.slots.forEach(s=>stops.push({day:d.day,place:s.place,activity:s.activity})));
const seen=new Set();stops=stops.filter(s=>{const k=s.place.toLowerCase();if(seen.has(k))return false;seen.add(k);return true;});
let pinned=0;const bounds=[coords];
const country={goa:'India',manali:'India',jaipur:'India',kerala:'India',bali:'Indonesia',dubai:'United Arab Emirates'}[wmDest.toLowerCase()]||'';
function cleanPlace(place){let s=place.trim();const m=s.match(/(?:\bat\s+|\balong\s+)(.+)$/i);if(m)s=m[1];s=s.replace(/^a\s+/i,'').replace(/\s+or\s+.*$/i,'').replace(/\s+and\s+.*$/i,'').replace(/\s+(evening|heritage walk|stroll).*$/i,'').trim();return s;}
async function geoPlace(place){const cands=[place,cleanPlace(place)].filter((v,i,a)=>v&&a.indexOf(v)===i);for(let i=0;i<cands.length;i++){try{const q=cands[i]+', '+wmDest+(country?', '+country:'');const r=await fetch('https://nominatim.openstreetmap.org/search?q='+encodeURIComponent(q)+'&format=json&limit=1',{headers:{'Accept':'application/json'}});const j=await r.json();if(j[0])return[parseFloat(j[0].lat),parseFloat(j[0].lon)];}catch(e){}if(i<cands.length-1)await new Promise(r=>setTimeout(r,1100));}return null;}
const SKIP_PLACE=/^(travel to|check-?out|transfer to|departure)/i;for(let si=0;si<stops.length;si++){const s=stops[si];mapNote.textContent='Locating stops on the map… '+pinned+' pinned so far.';let g=null,queried=false;if(!SKIP_PLACE.test(s.place)){queried=true;g=await geoPlace(s.place);}if(g){pinned++;lastGeo[s.place]=g;bounds.push(g);L.marker(g).addTo(quadletMap).bindPopup('<strong>Day '+s.day+' — '+esc(s.place)+'</strong><br>'+esc(s.activity));quadletMap.fitBounds(bounds,{padding:[30,30]});}if(queried&&si<stops.length-1)await new Promise(r=>setTimeout(r,1100));}
if(bounds.length>1)quadletMap.fitBounds(bounds,{padding:[30,30]});else quadletMap.setView(coords,11);
mapNote.textContent=stops.length?`${pinned} of ${stops.length} itinerary stops pinned on the map (plus the destination pin). Tap a pin for its day and activity. Unlocated stops stay in your day-wise plan above.`:'No itinerary stops to pin for this plan.';
}catch(e){mapNote.textContent='Map could not be drawn right now. Your plan is unaffected.';}
}
// Mili — rule-based helper, grounded only in the current plan (never invents prices or places)
let miliOpened=false;
function miliAdd(text,who){const box=document.getElementById('miliMsgs');if(who==='bot'){const row=document.createElement('div');row.className='mili-row';const av=document.createElement('img');av.className='mili-avatar';av.src='/mili-face.jpg?v=3.6';av.alt='Mili';const d=document.createElement('div');d.className='mili-msg mili-bot';d.textContent=text;row.appendChild(av);row.appendChild(d);box.appendChild(row);}else{const d=document.createElement('div');d.className='mili-msg mili-user';d.textContent=text;box.appendChild(d);}box.scrollTop=box.scrollHeight;}
function miliReply(q){
const s=q.toLowerCase().trim();const plan=lastPlan;
const dests=['goa','manali','jaipur','kerala','bali','dubai'];const hitDest=dests.find(d=>s.includes(d));
const _clean=s.replace(/[^a-z ]/g,' ').replace(/\s+/g,' ').trim();
const _words=_clean.split(' ').filter(Boolean);
const _first=_words.length?_words[0].replace(/(.)\1+$/,'$1'):'';
const _isGreeting=_clean.startsWith('good morning')||_clean.startsWith('good afternoon')||_clean.startsWith('good evening')||['hi','hello','hey','hii','namaste'].includes(_first)||_clean==='mili'||(_words.length<=3&&_words.includes('mili')&&['hi','hello','hey','hii','namaste'].includes(_first));
if(_isGreeting||s.includes('who are you')||s.includes('your name'))return "Heyy! 👋 I'm Mili, your Quadlet trip helper. Ask me about your plan — budget, itinerary, packing, safety, places or live weather — or tap a chip below. No plan yet? Plan a trip first, then come back and ask me about it.";
if(s.includes('manage')||s.includes('how to')||s.includes('how can i')||s.includes('how do i')||s.includes('plan a trip')||s.includes('plan my trip')||s.includes('get started')||s.includes('use quadlet')||s.includes('how should i')){
let _guide="Here's how to plan and manage a trip with Quadlet: 1) Pick a destination at the top — Goa, Manali, Jaipur, Kerala, Bali, Dubai, Udaipur, Varanasi, Rishikesh, Singapore or Thailand have real data and photos, or choose Other and type any place (you'll get a clearly labelled skeleton plan plus live nearby-place suggestions from Wikipedia). 2) Add dates, travellers, budget, travel style and interests. 3) Press Plan my trip — Scout, Penny, Atlas and Pax work in parallel, then merge into one final plan. 4) Manage it from there: check the Planner Dashboard for budget and per-day spend, tick off Pax's packing checklist as you pack, and use Copy, Download, Download PDF or Download calendar (.ics) to keep the plan. Saved plans stay in your browser so you can reopen them anytime.";
if(plan&&plan.summary)_guide+=" You already have a plan for "+plan.summary.destination+" — ask me about its budget, itinerary, packing or weather.";
else _guide+=" No plan yet — tell me a destination (just type e.g. Goa) and I'll set it in the form for you.";
return _guide;}
if(s.includes('how')&& (s.includes('work')||s.includes('quadlet'))||s.includes('agent'))return "Quadlet works like this: one trip goes in, then 4 agents work in parallel — 🧭 Scout finds places, 🪙 Penny handles the budget, 🗺️ Atlas builds the day-wise plan, 🛡️ Pax checks safety and packing. A Synthesizer merges them into one final plan, and shows every budget cut openly.";
if(s.includes('flight')||s.includes('hotel')||s.includes('book'))return "Honest note: Quadlet shows estimates only — it has no live flight or hotel prices and nothing here books or charges anything. Use your plan's estimates to book directly with the airline, hotel or local provider.";
if(s.includes('budget')||s.includes('cost')||s.includes('price')||s.includes('penny')||s.includes('money')||s.includes('spend')){
if(!plan||!plan.summary)return "No plan yet — fill the form at the top and press Plan my trip, then ask me again and I'll read your exact budget.";
let out=`Your budget: total ${plan.summary.total} vs budget ${plan.summary.budget}. Verdict: ${plan.summary.verdict}`;
if(plan.budget&&plan.budget.rows)out+='\n'+plan.budget.rows.map(r=>r[0]+': '+r[1]).join('\n');
if(plan.changes&&plan.changes.length)out+='\nChanges made to fit: '+plan.changes.join('; ');
return out;}
if(s.includes('itinerary')||s.includes('day')&&s.includes('plan')||s.includes('schedule')||s.includes('atlas')){
if(!plan||!plan.itinerary)return "No itinerary yet — plan a trip first, then ask me and I'll list it day by day.";
return plan.itinerary.map(d=>'Day '+d.day+(d.city?' ('+d.city+')':'')+': '+d.slots.map(x=>x.place+' ('+x.slot+')').join(', ')).join('\n');}
if(s.includes('pack')||s.includes('bag')||s.includes('luggage')||s.includes('pax')){
if(!plan||!plan.packing)return "No packing list yet — plan a trip first. In general, Pax groups packing into Essentials, Clothes, Tech and Documents.";
let out='Packing list from your plan:';Object.entries(plan.packing).forEach(([g,items])=>{out+='\n'+g+': '+items.join(', ');});
const all=document.querySelectorAll('.pack-check');if(all.length)out+='\nYou have packed '+[...all].filter(c=>c.checked).length+' of '+all.length+' items (tick them in the Packing list section).';
return out;}
if(s.includes('safe')||s.includes('document')||s.includes('weather')&&s.includes('safe')){
if(!plan||!plan.safety)return "No safety notes yet — plan a trip first and Pax will check weather, tips and documents for that place.";
return 'Safety for '+plan.summary.destination+': '+plan.safety.weather+'\nTips: '+plan.safety.tips.join('; ')+'\nDocuments: '+plan.safety.docs.join(', ');}
if(s.includes('weather')){
if(!lastWeather)return "No live weather loaded yet — plan a trip and the weather section will load, then ask me again.";
return `Right now in ${lastWeather.dest}: ${Math.round(lastWeather.current.temperature_2m)}°C, humidity ${lastWeather.current.relative_humidity_2m}%, wind ${lastWeather.current.wind_speed_10m} km/h.\n`+lastWeather.days.map(d=>d.date+': '+Math.round(d.max)+'°/'+Math.round(d.min)+'°C, '+d.cond).join('\n');}
if(s.includes('place')||s.includes('visit')||s.includes('gem')||s.includes('scout')||s.includes('where')){
if(!plan||!plan.places)return "Researched destinations are Goa, Manali, Jaipur, Kerala, Bali, Dubai, Udaipur, Varanasi, Rishikesh, Singapore and Thailand. Other places get a clearly labelled skeleton plan — never invented prices. Plan one and I'll list its places.";
let out='Places in your plan: '+plan.places.map(x=>x[0]).join(', ');if(plan.gems&&plan.gems.length)out+='\nHidden gems: '+plan.gems.join(', ');return out;}
if(s.includes('book')||s.includes('flight')||s.includes('hotel')||s.includes('pay'))return "Honest note: Quadlet shows estimates only — nothing here books or charges anything. Use the plan to book directly with the airline, hotel or local provider.";
if(s.includes('pdf')||s.includes('download'))return "In your final plan, use Copy, Download (.txt) or Download PDF (opens the print dialog — choose Save as PDF).";
if(s.includes('haiku')||s.includes('poem')||s.includes('poetry')){
const _hd=plan&&plan.summary?plan.summary.destination:(hitDest?hitDest.charAt(0).toUpperCase()+hitDest.slice(1):'Somewhere new');
const _hdy=plan&&plan.summary?plan.summary.days:'';
const _ht=plan&&plan.summary?plan.summary.total:'';
return _hd+', bright skies,\n'+(_hdy?_hdy+' days planned, '+_ht+' in all,\n':'Plan it, pack light,\n')+_hd+' waits for you.';}
if(s.includes('joke')||s.includes('story')||s.includes('song')||s.includes('shayari'))return "Right now I'm running on local rules (the LLM is unreachable), so I can't spin up a fresh joke or story — but I can answer from your real plan: budget, itinerary, packing, weather or previous trips.";
const _isDestCmd=_words.length<=4||/^(go to|take me to|plan( a trip)? to|set( the)? destination|i want to (go|visit)|let'?s go to|visit)\b/.test(_clean);
if(hitDest&&_isDestCmd){try{setDestination(hitDest.charAt(0).toUpperCase()+hitDest.slice(1));}catch(e){}return "Done — I've set your destination to "+hitDest.charAt(0).toUpperCase()+hitDest.slice(1)+". Now add your dates, travellers and budget at the top and press Plan my trip, then ask me about the plan.";}
if(s.includes('destination')||s.includes('where should')||s.includes('suggest'))return "Researched destinations with real data and photos: Goa, Manali, Jaipur, Kerala, Bali, Dubai, Udaipur, Varanasi, Rishikesh, Singapore and Thailand. Tell me one (e.g. just type 'Goa') and I'll set it in the form for you.";
if(s.includes('previous')||s.includes('earlier')||s.includes('saved')||s.includes('my trips')||s.includes('how many trips')||s.includes('trips have i')||s.includes('last trip')||s.includes('past trip')){
const _sv=getAllTrips();if(!_sv.length)return "You have no saved trips yet — plan a trip and save it, then ask me again and I'll list your trips.";
return "Your saved trips ("+_sv.length+"): "+_sv.map(x=>x.dest+" · "+x.dates+" · "+x.total).join('; ')+(plan&&plan.summary?" Your current plan is "+plan.summary.destination+" ("+plan.summary.dates+", "+plan.summary.total+").":"");}
if(s.includes('usually')||s.includes('usual')||s.includes('normally')||s.includes('my style')||s.includes('how do i travel')||s.includes('my preference')||s.includes('my habit')){
const _sv=getSaved();if(!_sv.length&&!plan)return "I don't know your travel habits yet — no saved trips in this browser. Plan a trip and I'll learn from it (destination, travellers, style, budget).";
const _all=[..._sv.map(x=>x.plan),...(plan?[plan]:[])].filter(x=>x&&x.summary);
const _freq=a=>{const m={};a.forEach(v=>{if(v)m[v]=(m[v]||0)+1;});return Object.entries(m).sort((a,b)=>b[1]-a[1])[0];};
const _dest=_freq(_all.map(x=>x.summary.destination));const _trav=_freq(_all.map(x=>String(x.summary.travellers)));const _style=_freq(_all.map(x=>x.summary.style).filter(Boolean));
let out="From your trips here: ";if(_dest)out+="you go to "+_dest[0]+" most ("+_dest[1]+" of "+_all.length+"). ";if(_trav)out+="Usually "+_trav[0]+" traveller(s). ";if(_style)out+="Style: "+_style[0]+". ";return out+"(This is only from trips saved in this browser — nothing from any account.)";}
if(s.includes('packing progress')||s.includes('how much')&&s.includes('pack')||s.includes('how many')&&s.includes('pack')){
const _all=document.querySelectorAll('.pack-check');if(_all.length)return "Packing for your current plan: "+[..._all].filter(c=>c.checked).length+" of "+_all.length+" packed.";
const _sv=getSaved();if(!_sv.length)return "No packing list open right now — plan a trip first, then tick items in Pax's checklist and I'll track them.";
return "Saved-trip packing: "+_sv.map(x=>{try{const arr=JSON.parse(localStorage.getItem('quadlet_packing_'+(x.dest+'|'+x.dates).replace(/[^a-zA-Z0-9]/g,'_'))||'[]');return arr.length?x.dest+" "+arr.filter(Boolean).length+"/"+arr.length:"";}catch(e){return "";}}).filter(Boolean).join('; ')||"No packing ticks saved yet.";}
if(s.includes('what next')||s.includes('what should i do next')||s.includes('next step')){
if(!plan)return "Next step: pick a destination at the top, add dates, travellers and budget, and press Plan my trip. Then come back and I'll help you manage that plan.";
const _all=document.querySelectorAll('.pack-check');const _done=[..._all].filter(c=>c.checked).length;
if(_all.length&&_done<_all.length)return "Next step for your "+plan.summary.destination+" trip: pack the remaining "+(_all.length-_done)+" item(s) in Pax's checklist, then use Download PDF to keep the plan.";
return "Your "+plan.summary.destination+" plan is ready and packing is done — next step: use Download PDF (or Copy) to keep it, or plan another trip.";}
if(s.includes('compare')){
const _sv=getSaved();if(_sv.length<2)return "I need at least 2 saved trips to compare — you have "+_sv.length+". Save another trip, then ask me to compare.";
return "Your trips compared: "+_sv.map(x=>x.dest+" · "+x.dates+" · "+x.total).join('; ')+". (Totals are estimates from each plan, not live prices.)";}
if(s.includes('cheapest')||s.includes('most expensive')){
const _sv=getSaved().map(x=>{const n=parseFloat(String(x.total).replace(/[^0-9.]/g,''));return {dest:x.dest,dates:x.dates,total:x.total,n:isNaN(n)?0:n};}).filter(x=>x.n>0);if(!_sv.length)return "No saved trips with a total yet — plan and save a trip first.";
const _s=[..._sv].sort((a,b)=>a.n-b.n);return s.includes('cheapest')?("Your cheapest saved trip: "+_s[0].dest+" · "+_s[0].dates+" · "+_s[0].total):("Your most expensive saved trip: "+_s[_s.length-1].dest+" · "+_s[_s.length-1].dates+" · "+_s[_s.length-1].total);}
return "I don't have that in your trips or in Quadlet's facts, so I won't guess — I only answer from your current plan, your saved trips in this browser, and Quadlet itself. Try asking about your budget, itinerary, packing, previous trips, or how to plan a trip. If you need a live price or booking, check it with the airline, hotel or provider directly — Quadlet only shows estimates.";}
document.getElementById('miliBtn').addEventListener('click',()=>{const pn=document.getElementById('miliPanel');const open=pn.style.display==='flex';pn.style.display=open?'none':'flex';if(!open)miliMotion(false);if(!open&&!miliOpened){miliOpened=true;miliAdd("Hi! I'm Mili 💬 — your Quadlet trip helper. Ask me about your plan, budget, packing, safety or weather, or tap a chip below.",'bot');}});
document.getElementById('miliClose').addEventListener('click',()=>{document.getElementById('miliPanel').style.display='none';});
// Close Mili when clicking anywhere on the site except the chatbot itself
// (or its launcher). Clicks inside the panel — chips, input, Send, messages,
// and the cross button — are left alone, so chatting never closes the panel.
document.addEventListener('click',e=>{const pn=document.getElementById('miliPanel');if(!pn||pn.style.display!=='flex')return;if(e.target.closest('#miliPanel')||e.target.closest('#miliBtn'))return;pn.style.display='none';});
document.querySelectorAll('.mili-chip').forEach(b=>b.addEventListener('click',()=>{document.getElementById('miliInput').value=b.dataset.q;document.getElementById('miliForm').requestSubmit();}));
function miliUserData(){
const _packProg=(dest,dates)=>{try{const arr=JSON.parse(localStorage.getItem('quadlet_packing_'+(dest+'|'+dates).replace(/[^a-zA-Z0-9]/g,'_'))||'[]');return arr.length?arr.filter(Boolean).length+'/'+arr.length:null;}catch(e){return null;}};
const _cur=lastPlan&&lastPlan.summary?{destination:lastPlan.summary.destination,dates:lastPlan.summary.dates,days:lastPlan.summary.days,travellers:lastPlan.summary.travellers,total:lastPlan.summary.total,budget:lastPlan.summary.budget,verdict:lastPlan.summary.verdict,style:lastPlan.summary.style,mode:lastPlan.mode||'',cities:lastPlan.summary.cities||null,budgetRows:lastPlan.budget?lastPlan.budget.rows:null,changes:lastPlan.changes||[],itinerary:lastPlan.itinerary?lastPlan.itinerary.map(d=>('Day '+d.day+(d.city?' ('+d.city+')':'')+': '+d.slots.map(x=>x.place).join(', '))):null,packing:lastPlan.packing?Object.entries(lastPlan.packing).map(([g,items])=>g+': '+items.join(', ')):null,packingPacked:(()=>{const a=document.querySelectorAll('.pack-check');return a.length?([...a].filter(c=>c.checked).length+'/'+a.length):null;})(),safety:lastPlan.safety||null,places:lastPlan.places||null,gems:lastPlan.gems||null}:null;
const _saved=getSaved().map(x=>({destination:x.dest,dates:x.dates,total:x.total,packingPacked:_packProg(x.dest,x.dates),days:x.plan&&x.plan.summary?x.plan.summary.days:null,travellers:x.plan&&x.plan.summary?x.plan.summary.travellers:null,style:x.plan&&x.plan.summary?x.plan.summary.style:null}));
return {currentPlan:_cur,savedTrips:_saved,weather:lastWeather?{dest:lastWeather.dest,current:lastWeather.current,days:lastWeather.days}:null,facts:{researchedDestinations:['Goa','Manali','Jaipur','Kerala','Bali','Dubai','Udaipur','Varanasi','Rishikesh','Singapore','Thailand'],agents:['Scout (places)','Penny (budget)','Atlas (itinerary)','Pax (safety and packing)'],notes:'All prices are estimates, not live bookable prices. Quadlet does not book flights or hotels and takes no payments. Unknown destinations get a clearly labelled skeleton plan with ranges only, never invented prices. Nearby place suggestions for unresearched destinations come live from Wikipedia. Saved trips and packing ticks live only in this browser (localStorage); there is no account or cloud copy.'}};}
function miliMotion(start){const els=[...document.querySelectorAll('#miliBtn,#miliFaceHead')];if(!els.length)return;if(start){els.forEach(e=>e.classList.add('mili-thinking'));}else{els.forEach(e=>e.classList.remove('mili-thinking'));if(window.anime)anime({targets:els,scale:[0.85,1.12,1],rotate:[0,-4,3,0],duration:650,easing:'easeOutElastic(1,.5)'});}}
let _miliStreamSeq=0;
function miliSuggest(q){const box=document.getElementById('miliMsgs');const s=(q||'').toLowerCase();let opts=['My budget?','What should I pack?','Show my itinerary'];if(s.includes('budget')||s.includes('cost')||s.includes('price'))opts=['Show my itinerary','What should I pack?','What is the weather?'];else if(s.includes('pack'))opts=['My budget?','Show my itinerary','What trips have I planned before?'];else if(s.includes('weather'))opts=['My budget?','What should I pack?','Show my itinerary'];const wrap=document.createElement('div');wrap.className='mili-suggest';opts.forEach(o=>{const b=document.createElement('button');b.textContent=o;b.addEventListener('click',()=>{document.getElementById('miliInput').value=o;document.getElementById('miliForm').requestSubmit();});wrap.appendChild(b);});box.appendChild(wrap);box.scrollTop=box.scrollHeight;}
async function miliAsk(q){
const box=document.getElementById('miliMsgs');box.querySelectorAll('.mili-suggest').forEach(e=>e.remove());const row=document.createElement('div');row.className='mili-row';const av=document.createElement('img');av.className='mili-avatar';av.src='/mili-face.jpg?v=3.6';av.alt='Mili';const d=document.createElement('div');d.className='mili-msg mili-bot';d.innerHTML='<span class="mili-dot"></span> <span class="mili-dot"></span> <span class="mili-dot"></span>';row.appendChild(av);row.appendChild(d);box.appendChild(row);box.scrollTop=box.scrollHeight;miliMotion(true);const _t0=Date.now();let _streamId=++_miliStreamSeq;const _finish=(txt)=>{const _wait=Math.max(0,750-(Date.now()-_t0));setTimeout(()=>{const _tokens=txt.split(/(\s+)/);let _i=0;const _iv=setInterval(()=>{if(_streamId!==_miliStreamSeq){clearInterval(_iv);return;}_i=Math.min(_tokens.length,_i+3);d.textContent=_tokens.slice(0,_i).join('')+(_i<_tokens.length?' ▍':'');box.scrollTop=box.scrollHeight;if(_i>=_tokens.length){clearInterval(_iv);d.textContent=txt;miliMotion(false);miliSuggest(q);}},18);},_wait);};
const _cq=q.toLowerCase().trim();
if(['goa','manali','jaipur','kerala','bali','dubai'].includes(_cq)){_finish(miliReply(q));return;}
try{const ctrl=new AbortController();const _to=setTimeout(()=>ctrl.abort(),30000);const res=await fetch('/api/mili',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q,context:miliUserData()}),signal:ctrl.signal});clearTimeout(_to);if(res.ok){const data=await res.json();if(data&&data.answer){_finish(data.answer);return;}}}catch(e){}
_finish(miliReply(q));}
document.getElementById('miliForm').addEventListener('submit',e=>{e.preventDefault();const inp=document.getElementById('miliInput');const q=inp.value.trim();if(!q)return;miliAdd(q,'user');inp.value='';miliAsk(q);});

// Fixed header nav: highlight the section in view, and the link just tapped.
const _navLinks=[...document.querySelectorAll('nav.mainnav a')];
function setActiveNav(hash){if(!_navLinks.some(a=>a.getAttribute('href')===hash))return;_navLinks.forEach(a=>a.classList.toggle('active',a.getAttribute('href')===hash));}
_navLinks.forEach(a=>a.addEventListener('click',()=>setActiveNav(a.getAttribute('href'))));
if('IntersectionObserver' in window){const _io=new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting)setActiveNav('#'+e.target.id);});},{rootMargin:'-40% 0px -55% 0px'});['planner','agents','dashboard','saved'].forEach(id=>{const el=document.getElementById(id);if(el)_io.observe(el);});}
let _lastY=window.scrollY,_upAcc=0,_downAcc=0,_headerHidden=false,_headerAnim=null;
function _moveHeader(hide){
if(hide===_headerHidden)return;_headerHidden=hide;
const hdr=document.querySelector('header');if(!hdr)return;
if(window.anime){if(_headerAnim)_headerAnim.pause();_headerAnim=anime({targets:hdr,translateY:hide?'-110%':'0%',duration:hide?600:900,easing:'cubicBezier(.16,1,.3,1)'});}
else hdr.style.transform=hide?'translateY(-110%)':'translateY(0)';
}
window.addEventListener('scroll',()=>{const y=window.scrollY;const d=y-_lastY;_lastY=y;
if(d>0){_downAcc+=d;_upAcc=0;if(!_headerHidden&&y>140&&_downAcc>=40){_moveHeader(true);_downAcc=0;}}
else if(d<0){_upAcc+=-d;_downAcc=0;if(_headerHidden&&(_upAcc>=30||y<=140)){_moveHeader(false);_upAcc=0;}}
else if(y<=140){_moveHeader(false);}
},{passive:true});

// API stream
async function fetchPlan(req){const urls=['/api/plan','https://quadlet.vercel.app/api/plan'];let lastErr=null;for(const url of urls){try{const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(req)});if(!res.ok){lastErr=new Error('Server returned '+res.status+' from '+url);continue;}return res;}catch(e){lastErr=e;continue;}}throw lastErr||new Error('Could not reach the planner API.');}
const _tripForm=document.getElementById('tripForm');if(_tripForm)_tripForm.addEventListener('submit',async e=>{e.preventDefault();const errEl=document.getElementById('formErr');errEl.hidden=true;const dest=document.getElementById('dest').value.trim(),start=document.getElementById('start').value,end=document.getElementById('end').value,travellers=parseInt(document.getElementById('travellers').value,10),budget=parseFloat(document.getElementById('budget').value),currency=document.getElementById('currency').value,style=document.getElementById('style').value;
if(!dest||!start||!end||!travellers||!budget||end<start){errEl.textContent='Please check destination, dates, travellers and budget. End date must be on or after the start date.';errEl.hidden=false;return;}
const req={destination:dest,start,end,travellers,budget,currency,style,interests:[...selectedInterests],taste:(_ai&&_ai.getTaste)?_ai.getTaste():null};lastReq=req;lastTripId=null;lastShareId=null;const btn=document.getElementById('planBtn');btn.disabled=true;btn.textContent='Agents working…';const planPulse=window.anime?anime({targets:'#planBtn',scale:[1,1.04,1],duration:600,loop:true,easing:'easeInOutSine'}):null;
AGENTS.forEach((_,i)=>{setStatus(i+1,'Waiting');const lg=document.getElementById('logs-'+(i+1));if(lg)lg.innerHTML='';});document.getElementById('synthStatus').textContent='Synthesizer: waiting for the four agents';document.getElementById('agents').scrollIntoView({behavior:'smooth'});
try{const res=await fetchPlan(req);const reader=res.body.getReader();const dec=new TextDecoder();let buf='';let finalData=null;
while(true){const {done,value}=await reader.read();if(done)break;buf+=dec.decode(value,{stream:true});let idx;while((idx=buf.indexOf('\n'))>=0){const line=buf.slice(0,idx).trim();buf=buf.slice(idx+1);if(!line)continue;let ev;try{ev=JSON.parse(line);}catch(_){continue;}if(ev.type==='log')addLog(ev.agent,ev.t,ev.a,ev.o);else if(ev.type==='status'){if(ev.agent===5)document.getElementById('synthStatus').textContent='Synthesizer: '+ev.status;else setStatus(ev.agent,ev.status==='done'?'Done':ev.status==='failed'?'Failed':'Working');}else if(ev.type==='final'){finalData=ev;document.getElementById('synthStatus').textContent='Synthesizer: plan merged';}else if(ev.type==='error')throw new Error(ev.message||'Planner error');}}
if(finalData){renderPlan(finalData.plan,finalData.reports);if(_ai&&_ai.afterPlan)_ai.afterPlan(finalData.plan);document.getElementById('plan').scrollIntoView({behavior:'smooth'});}else{errEl.textContent='The planner finished without a final plan. Please try again.';errEl.hidden=false;}
}catch(ex){errEl.textContent='Could not plan this trip: '+(ex.message||ex)+'. Please check your connection and try again.';errEl.hidden=false;document.getElementById('synthStatus').textContent='Synthesizer: failed — see error above';}
finally{if(planPulse)planPulse.pause();btn.style.transform='';btn.disabled=false;btn.textContent='Plan my trip';}});

// Dashboard page (v6.0): render the dashboard for a saved trip, with a picker.
function _dashStart(plan){const m=String((plan&&plan.summary&&plan.summary.dates)||'').match(/(\d{1,2}) ([A-Za-z]{3}) (\d{4})/);if(!m)return null;const mo={Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'}[m[2]];if(!mo)return null;return m[3]+'-'+mo+'-'+String(+m[1]).padStart(2,'0');}
function _dashInit(){
  const grid=document.getElementById('dashGrid');if(!grid)return;
  const sel=document.getElementById('dashTrip');
  const trips=getAllTrips();
  const keep=sel?sel.value:'';
  if(sel){
    sel.innerHTML=trips.length?trips.map((x,i)=>`<option value="${i}">${esc(x.dest)} · ${esc(x.dates)} · ${esc(x.total)}</option>`).join(''):'<option value="">No saved trips yet</option>';
    if(keep!==''&&trips[parseInt(keep,10)])sel.value=keep;
    sel.onchange=()=>{const t=trips[parseInt(sel.value,10)];if(t){lastPlan=t.plan;lastReq={start:_dashStart(t.plan)||''};renderDashboard(t.plan);}};
  }
  const cur=sel&&sel.value!==''?trips[parseInt(sel.value,10)]:trips[0];
  if(cur){lastPlan=cur.plan;lastReq={start:_dashStart(cur.plan)||''};renderDashboard(cur.plan);}
}
_dashInit();

// PWA install button (v6.5): always visible in the header; hidden once installed.
if('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js').catch(()=>{});});}
let _deferredPrompt=null;const _installBtn=document.getElementById('installBtn');
if(_installBtn&&(window.matchMedia('(display-mode: standalone)').matches||navigator.standalone))_installBtn.classList.add('hidden');
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();_deferredPrompt=e;});
if(_installBtn)_installBtn.addEventListener('click',async()=>{
  if(_deferredPrompt){_deferredPrompt.prompt();await _deferredPrompt.userChoice;_deferredPrompt=null;_installBtn.classList.add('hidden');return;}
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.MSStream;
  const msg=ios?'Share \u2192 Add to Home Screen':'Browser menu \u2192 Install app';
  const old=_installBtn.innerHTML;_installBtn.textContent=msg;
  setTimeout(()=>{_installBtn.innerHTML=old;},5000);
});
window.addEventListener('appinstalled',()=>{if(_installBtn)_installBtn.classList.add('hidden');});

// Open a saved trip handed off from the Trips page (sessionStorage) — Home only
(function(){
  try{
    const raw=sessionStorage.getItem('quadlet_open_plan');
    if(!raw||!document.getElementById('planOut'))return;
    sessionStorage.removeItem('quadlet_open_plan');
    const plan=JSON.parse(raw);
    lastPlan=plan;lastReq={start:''};renderPlan(plan,[]);
    const el=document.getElementById('plan');if(el)el.scrollIntoView({behavior:'smooth'});
  }catch(e){}
})();

// Open a shared trip link (?trip=<share_id>) for anyone, no sign-in needed
(function(){
  try{
    const sid=new URLSearchParams(location.search).get('trip');
    if(!sid) return;
    if(!document.getElementById('planOut')){ location.replace('/?trip='+encodeURIComponent(sid)); return; }
    lastShareId=sid;
    fetch('/api/shared/'+encodeURIComponent(sid)).then(r=>{if(!r.ok) throw new Error('bad link'); return r.json();}).then(d=>{
      lastPlan=d.plan; lastReq={start:''}; renderPlan(d.plan,[]);
      const el=document.getElementById('plan'); if(el) el.scrollIntoView({behavior:'smooth'});
    }).catch(()=>{});
  }catch(e){}
})();
