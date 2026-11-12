/* J.A.I. Narrative Scene Engine — deterministic 2D action renderer.
   No paid assets, network calls, or external runtime dependencies. */
(function(){
"use strict";
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
function draw(ctx,canvas,item,index,progress){
 const w=canvas.width,h=canvas.height,p=clamp(Number(progress)||0,0,1),cx=w/2;
 const all=norm([item.visualAction,item.visual,item.retentionStimulus,item.objective,item.on_screen_text].join(" "));
 const isWater=/oceano|agua|mar|agua/.test(all),isLight=/luz|rayo|solar|color|espectro|fot(on|ones)/.test(all);
 const action=norm(item.visualAction||item.visual||"");
 const title=String(item.on_screen_text||"").slice(0,58);
 const label=(s,x,y,size=27,color="#f5fbff")=>{ctx.fillStyle=color;ctx.font="700 "+size+"px Arial";ctx.textAlign="center";ctx.fillText(s,x,y);};
 const line=(x1,y1,x2,y2,color,width=8)=>{ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();};
 const dot=(x,y,r,color)=>{ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();};
 const arrow=(x1,y1,x2,y2,color,width=8)=>{line(x1,y1,x2,y2,color,width);const a=Math.atan2(y2-y1,x2-x1);ctx.save();ctx.translate(x2,y2);ctx.rotate(a);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(-23,-13);ctx.lineTo(-23,13);ctx.closePath();ctx.fill();ctx.restore();};
 const panel=(x,y,ww,hh,color)=>{ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,ww,hh,20);ctx.fill();};
 const ocean=(surface=410)=>{const g=ctx.createLinearGradient(0,surface,0,h);g.addColorStop(0,"#1595b8");g.addColorStop(.35,"#08658f");g.addColorStop(1,"#031a3e");ctx.fillStyle=g;ctx.fillRect(0,surface,w,h-surface);ctx.fillStyle="#56d8e5";ctx.fillRect(0,surface-7,w,8);};
 const rays=(x,y,len,alpha=1)=>{ctx.save();ctx.globalAlpha=alpha;ctx.lineCap="round";const cols=["#fff1a6","#ff8268","#64dfff","#b9a0ff"];cols.forEach((c,k)=>{ctx.strokeStyle=c;ctx.lineWidth=k===0?13:8;ctx.beginPath();ctx.moveTo(x+k*10,y);ctx.lineTo(x+len+k*9,y+len*.75);ctx.stroke();});ctx.restore();};
 const bg=ctx.createLinearGradient(0,0,w,h);bg.addColorStop(0,"#07152c");bg.addColorStop(1,isWater?"#073b5b":"#18294b");ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
 // Choose the physical action, not the beat number. Distinct actions get distinct compositions.
 let scene="general";
 if(isWater&&(/absor|rojo|longitud de onda|desaparec/.test(all)))scene="absorption";
 else if(isWater&&(/dispers|rebota|rebote|particula|particulas/.test(all)))scene="scatter";
 else if(isWater&&(/profund|penetr|desciend|atravies|vertical/.test(all)))scene="depth";
 else if(isWater&&(/superficie|reflej|cielo|compar/.test(all)))scene="reflection";
 else if(isWater&&(/entra|incide|rayo|sol|luz/.test(all)))scene="sunlight";
 else if(isLight&&(/absor|pierde|desaparec/.test(all)))scene="absorption";
 else if(isLight&&(/dispers|separa|espectro|longitud/.test(all)))scene="spectrum";
 else if(/compar|contrasta|antes y despues|lado a lado/.test(all))scene="compare";
 else if(/corte|interior|revela|abre/.test(all))scene="reveal";
 else if(/orbita|gira alrededor/.test(all))scene="orbit";
 else if(/impact|choca|golpea|rompe/.test(all))scene="impact";
 else if(/acerc|macro|detalle|zoom/.test(all))scene="macro";
 else if(/fluye|corriente|desplaza|viaja|avanza|recorre/.test(all))scene="flow";
 ctx.save();
 if(scene==="sunlight"){
  ocean();dot(555,235,76,"#ffd36b");rays(205,245,310,1);
  for(let k=0;k<5;k++){const y=470+k*115;ctx.globalAlpha=.2+k*.12;line(0,y,w,y,"#a9edff",2);}ctx.globalAlpha=1;
  const x=250+p*220;dot(x,420+p*360,13,"#fff5bb");label("LA LUZ ENTRA AL AGUA",cx,180,30);
 }else if(scene==="absorption"){
  ocean();panel(65,500,590,360,"rgba(3,20,47,.58)");
  const cols=["#ff655e","#ffb65c","#fff0a0","#65d9ff"];cols.forEach((c,k)=>{const y=565+k*72;line(105,y,Math.max(115,580-p*360*(k===0?1:.22)),y,c,14);dot(Math.max(115,580-p*360*(k===0?1:.22)),y,12,c);});
  label("LOS ROJOS SE ABSORBEN",cx,420,29);label("EL ROJO PIERDE INTENSIDAD",cx,950,23,"#ffd0c8");
 }else if(scene==="scatter"){
  ocean();rays(90,350,210,.9);
  for(let k=0;k<14;k++){const x=250+((k*61+p*170)%300),y=560+((k*89)%490);dot(x,y,5+(k%3)*2,"#8beaff");}
  for(let k=0;k<7;k++){const y=520+k*76;arrow(350,y,230+Math.sin(p*5+k)*70,y-45,"#70ddff",4);}
  label("LA LUZ AZUL SE DISPERSA",cx,220,29);
 }else if(scene==="depth"){
  ocean();rays(180,240,350,.95);
  for(let k=0;k<6;k++){const y=460+k*115;ctx.globalAlpha=.8-k*.12;line(0,y,w,y,"#9cecff",2);}ctx.globalAlpha=1;
  const beam=ctx.createLinearGradient(190,300,500,1050);beam.addColorStop(0,"rgba(255,244,180,.65)");beam.addColorStop(1,"rgba(66,191,255,.03)");ctx.fillStyle=beam;ctx.beginPath();ctx.moveTo(190,300);ctx.lineTo(480,300);ctx.lineTo(400,1100);ctx.lineTo(270,1100);ctx.closePath();ctx.fill();
  label("CAMBIA CON LA PROFUNDIDAD",cx,180,27);
 }else if(scene==="reflection"){
  ocean(560);ctx.fillStyle="#ffd16a";ctx.beginPath();ctx.arc(535,300,65,0,Math.PI*2);ctx.fill();
  line(0,552,w,552,"#a7f1ff",5);arrow(520,370,610,530,"#ffd36b",9);
  panel(55,760,610,220,"rgba(3,17,40,.68)");label("EL CIELO TAMBIÉN INFLUYE",cx,835,26);label("PERO NO LO EXPLICA TODO",cx,900,29,"#75e5f0");
 }else if(scene==="compare"){
  panel(42,360,305,540,"#124e70");panel(373,360,305,540,"#092b50");
  label("ANTES",195,320,27);label("DESPUÉS",525,320,27);
  rays(75,470,210,.9);ocean(680);ctx.save();ctx.beginPath();ctx.rect(373,360,305,540);ctx.clip();ocean(610);ctx.restore();
  arrow(340,620,380,620,"#ffd36b",8);
 }else if(scene==="reveal"){
  ocean();panel(75,390,570,490,"rgba(4,20,44,.65)");
  ctx.save();ctx.beginPath();ctx.rect(75,390,570*(.12+.88*p),490);ctx.clip();
  for(let k=0;k<4;k++)rays(120,470+k*75,420,.8);
  ctx.restore();label("MIRA LO QUE OCURRE",cx,310,29);
 }else if(scene==="orbit"){
  dot(cx,650,145,"#147eaf");ctx.strokeStyle="#ffd36b";ctx.lineWidth=7;ctx.beginPath();ctx.ellipse(cx,650,285,120,0,0,Math.PI*2);ctx.stroke();
  const a=p*Math.PI*2;dot(cx+285*Math.cos(a),650+120*Math.sin(a),24,"#e8f5ff");label("UNA TRAYECTORIA COMPLETA",cx,330,28);
 }else if(scene==="impact"){
  const x=120+p*400;dot(x,590,48,"#ffbd65");dot(620-p*400,590,48,"#73ddf2");const q=Math.abs(.5-p);
  for(let k=0;k<9;k++){const a=k*Math.PI*2/9;line(cx,590,cx+Math.cos(a)*(30+q*180),590+Math.sin(a)*(30+q*180),"#ffd36b",5);}label("EL CHOQUE CAMBIA EL MOVIMIENTO",cx,340,25);
 }else if(scene==="macro"){
  dot(cx,620,250,"rgba(93,211,238,.18)");ctx.strokeStyle="#8cecff";ctx.lineWidth=7;ctx.beginPath();ctx.arc(cx,620,180+45*p,0,Math.PI*2);ctx.stroke();
  for(let k=0;k<18;k++)dot(cx+Math.cos(k*2.4+p)*((k*17)%145),620+Math.sin(k*2.4+p)*((k*17)%145),7,"#9af1ff");label("OBSERVA EL DETALLE",cx,300,29);
 }else if(scene==="flow"){
  ocean();for(let k=0;k<8;k++){const y=500+k*75;const x=30+p*390+(k%2)*70;arrow(x,y,x+110,y+Math.sin(p*5+k)*22,"#8cecff",5);}label("EL AGUA TRANSPORTA LA LUZ",cx,250,27);
 }else{
  // Generic semantic fallback: stage the named subject and animate its stated direction.
  panel(70,430,580,420,"rgba(10,48,76,.8)");const x=120+p*450;
  dot(x,640,75,isLight?"#ffd36b":isWater?"#36b9dc":"#7be0c9");
  arrow(130,800,590,800,"#ffd36b",9);label("ACCIÓN Y RESULTADO",cx,340,30);
 }
 ctx.restore();
 // Stable editorial overlay; visual area remains uncluttered.
 panel(28,54,664,112,"rgba(2,10,24,.78)");label(title,cx,122,title.length>36?23:30);
 label(item.segmentLabel||("BLOQUE "+(index+1)),cx,1150,21,"#b9d9ec");
 ctx.fillStyle="rgba(255,255,255,.2)";ctx.fillRect(55,1190,610,8);ctx.fillStyle="#63e4c1";ctx.fillRect(55,1190,610*p,8);
}
window.JAIStoryEngine={draw};
})();