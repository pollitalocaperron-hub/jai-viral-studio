/* J.A.I. Narrative Scene Engine — semantic 2D scene renderer.
   Each retention beat is classified from its own physical action before broad scene context. */
(function(){
"use strict";
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
function draw(ctx,canvas,item,index,progress){
 const w=canvas.width,h=canvas.height,cx=w/2,p=clamp(Number(progress)||0,0,1);
 const beat=norm([item.visualAction,item.retentionStimulus,item.new_stimulus,item.visual_action,item.on_screen_text].join(" "));
 const sceneText=norm([item.visual,item.animation,item.objective].join(" "));
 const all=beat+" "+sceneText;
 const water=/oceano|agua|mar|gota|vaso|profund|columna/.test(all);
 const title=String(item.on_screen_text||"").slice(0,58);
 const label=(s,x,y,size=28,color="#f5fbff")=>{ctx.fillStyle=color;ctx.font="700 "+size+"px Arial";ctx.textAlign="center";ctx.fillText(s,x,y);};
 const line=(x1,y1,x2,y2,color,width=8)=>{ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();};
 const dot=(x,y,r,color)=>{ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();};
 const panel=(x,y,ww,hh,color)=>{ctx.fillStyle=color;ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y,ww,hh,22);else{ctx.rect(x,y,ww,hh);}ctx.fill();};
 const arrow=(x1,y1,x2,y2,color="#ffe08a",width=8)=>{line(x1,y1,x2,y2,color,width);const a=Math.atan2(y2-y1,x2-x1);ctx.save();ctx.translate(x2,y2);ctx.rotate(a);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(-22,-12);ctx.lineTo(-22,12);ctx.closePath();ctx.fill();ctx.restore();};
 const ocean=(top=430)=>{const g=ctx.createLinearGradient(0,top,0,h);g.addColorStop(0,"#28b8d0");g.addColorStop(.28,"#087fa7");g.addColorStop(1,"#031a3d");ctx.fillStyle=g;ctx.fillRect(0,top,w,h-top);ctx.fillStyle="#8cf1ef";ctx.fillRect(0,top-8,w,9);};
 const rays=(x,y,len,alpha=1)=>{ctx.save();ctx.globalAlpha=alpha;["#fff3bd","#ff9a70","#ffdf77","#70dcff","#9c9aff"].forEach((c,k)=>{ctx.strokeStyle=c;ctx.lineWidth=k===0?13:8;ctx.beginPath();ctx.moveTo(x,y+k*12);ctx.lineTo(x+len,y+len*.58+k*9);ctx.stroke();});ctx.restore();};
 const bg=ctx.createLinearGradient(0,0,w,h);bg.addColorStop(0,"#07162c");bg.addColorStop(1,water?"#06435e":"#18294b");ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
 // Beat-level action has priority. Broad words such as "comparación" in the scene objective
 // must never override the concrete object/action requested for this three-second beat.
 let mode="ocean";
 if(/vaso|vidrio|cristal/.test(beat))mode="glass";
 else if(/gota|macro|lupa/.test(beat))mode="drop";
 else if(/arcoiris|espectro|franjas de colores|bandas de colores/.test(beat))mode="spectrum";
 else if(/particula|suspension|dispers/.test(beat))mode="particles";
 else if(/absor|rojo|naranja|amarillo|se apaga|desvanec/.test(beat))mode="absorb";
 else if(/columna|profund|desciend|capa delgada/.test(beat))mode="column";
 else if(/mirando hacia arriba|observador|sale desde el fondo|perspectiva submarina/.test(beat))mode="observer";
 else if(/filtro|colador|no tine|no crea el color|rechaza los demas/.test(beat))mode="filter";
 else if(/compar|lado a lado|dos estados|contraste/.test(beat))mode="compare";
 else if(/rayo|haz de luz|luz blanca|entra desde arriba|sol/.test(beat))mode="rays";
 else if(/superficie|plano general|oceano completo|mar abierto/.test(beat))mode="ocean";
 else if(/vaso|vidrio|cristal/.test(sceneText))mode="glass";
 else if(/gota/.test(sceneText))mode="drop";
 else if(/arcoiris|espectro|bandas de colores/.test(sceneText))mode="spectrum";
 else if(/particula|dispers/.test(sceneText))mode="particles";
 else if(/absor|rojo|naranja/.test(sceneText))mode="absorb";
 else if(/columna|profund/.test(sceneText))mode="column";
 else if(/filtro|colador/.test(sceneText))mode="filter";
 else if(/compar/.test(sceneText))mode="compare";
 ctx.save();
 if(mode==="glass"){
  // Large transparent tumbler, waterline, refracted highlight; it slides into frame.
  const x=115+(1-p)*180;ctx.save();ctx.translate(x,0);
  ctx.fillStyle="rgba(117,226,245,.10)";ctx.strokeStyle="#d5fbff";ctx.lineWidth=10;
  ctx.beginPath();ctx.moveTo(35,390);ctx.lineTo(285,390);ctx.lineTo(260,865);ctx.quadraticCurveTo(160,930,60,865);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle="rgba(42,178,220,.35)";ctx.beginPath();ctx.moveTo(48,590);ctx.lineTo(273,590);ctx.lineTo(260,850);ctx.quadraticCurveTo(160,900,60,850);ctx.closePath();ctx.fill();
  ctx.strokeStyle="#ffffff";ctx.lineWidth=7;ctx.beginPath();ctx.ellipse(160,390,125,22,0,0,Math.PI*2);ctx.stroke();
  line(82,430,110,790,"rgba(255,255,255,.65)",8);ctx.restore();
  ocean(960);label("UNA MUESTRA PEQUEÑA",cx,280,28);
 }else if(mode==="drop"){
  // Macro droplet with a white beam passing through and emerging unchanged.
  const r=205;ctx.fillStyle="rgba(74,190,230,.17)";ctx.strokeStyle="#a7efff";ctx.lineWidth=9;
  ctx.beginPath();ctx.moveTo(cx,360);ctx.bezierCurveTo(cx+205,535,cx+175,825,cx,890);ctx.bezierCurveTo(cx-175,825,cx-205,535,cx,360);ctx.fill();ctx.stroke();
  line(35,625,cx-r-8,625,"#fff1b5",16);line(cx-r,625,cx+r,625,"#fff1b5",13);line(cx+r+8,625,w-35,625,"#fff1b5",16);
  dot(120,625,12,"#fff");dot(580,625,12,"#fff");label("LA LUZ CRUZA CASI INTACTA",cx,270,27);
 }else if(mode==="spectrum"){
  // Distinct full-width spectrum entering a water column.
  const cols=["#ff5e58","#ff9d55","#ffe36e","#65db9a","#55caff","#718cff","#b18cff"];
  cols.forEach((c,k)=>{const y=430+k*65;line(70,y,650,y,c,19);});
  panel(250,385,210,525,"rgba(8,35,69,.48)");
  for(let k=0;k<7;k++){const y=430+k*65;line(80,y,240,y,cols[k],18);line(470,y,650,y,cols[k],18);}
  label("LA LUZ BLANCA SE DESCOMPONE",cx,270,26);
 }else if(mode==="absorb"){
  ocean(390);panel(65,470,590,560,"rgba(1,15,38,.62)");
  const cols=["#ff5c55","#ff9d55","#ffe36e","#65db9a","#55caff"];
  cols.forEach((c,k)=>{const y=550+k*90;const end= k<3 ? 150+(1-p)*380 : 620;line(100,y,end,y,c,18);if(k<3)for(let q=0;q<4;q++)dot(end-q*15,y,6,c);});
  label("ROJO, NARANJA Y AMARILLO",cx,340,25);label("PIERDEN INTENSIDAD",cx,1090,27,"#ffd1c4");
 }else if(mode==="column"){
  ocean(370);panel(235,405,250,650,"rgba(2,22,49,.52)");
  for(let k=0;k<5;k++){const y=455+k*105;line(265,y,455,y,"#8cecff",3);}
  const beam=ctx.createLinearGradient(360,400,360,1050);beam.addColorStop(0,"rgba(255,240,174,.85)");beam.addColorStop(.5,"rgba(90,215,255,.35)");beam.addColorStop(1,"rgba(60,170,255,.03)");
  ctx.fillStyle=beam;ctx.beginPath();ctx.moveTo(310,400);ctx.lineTo(410,400);ctx.lineTo(430,1030);ctx.lineTo(290,1030);ctx.closePath();ctx.fill();
  label("MÁS AGUA, MÁS FILTRO",cx,285,29);
 }else if(mode==="particles"){
  ocean(390);rays(70,430,230,.75);
  for(let k=0;k<24;k++){const x=90+((k*79+p*180)%540),y=520+((k*97)%510);dot(x,y,5+(k%4)*2,"#b9f4ff");}
  for(let k=0;k<8;k++){const x=140+k*62;arrow(x,730+Math.sin(p*5+k)*30,x+65,680+Math.sin(p*5+k)*30,"#8cecff",4);}
  label("PARTÍCULAS DISPERSAN LUZ",cx,275,28);
 }else if(mode==="observer"){
  ocean(390);ctx.fillStyle="#ffd56e";ctx.beginPath();ctx.arc(cx,290,60,0,Math.PI*2);ctx.fill();
  for(let k=0;k<7;k++){const x=70+k*95;line(cx,420,x,690,"rgba(180,239,255,.45)",3);}
  const diverX=cx+Math.sin(p*Math.PI*2)*18;dot(diverX,980,42,"#f4c27c");panel(diverX-48,1018,96,80,"#e3a75f");
  label("DESDE EL FONDO DEL MAR",cx,220,28);
 }else if(mode==="filter"){
  ocean(400);panel(160,485,400,420,"rgba(3,20,48,.72)");
  // A literal editorial filter: warm wavelengths fade inside the water while blue continues through.
  const bands=["#ff625d","#ffab59","#ffe36d","#65d9a0","#59cfff"];
  bands.forEach((color,k)=>{const y=560+k*72;line(55,y,300,y,color,15);if(k<3){for(let q=0;q<5;q++)dot(315+q*18,y,6,color);}else line(320,y,650,y,color,15);});
  label("EL AGUA ACTÚA COMO FILTRO",cx,300,27);
 }else if(mode==="compare"){
  panel(40,420,300,530,"#0b5577");panel(380,420,300,530,"#082a50");
  label("POCA AGUA",190,370,26);label("MUCHA AGUA",530,370,26);
  // Left: clear glass. Right: deep blue column.
  ctx.strokeStyle="#d8faff";ctx.lineWidth=8;ctx.strokeRect(115,535,150,260);ctx.fillStyle="rgba(100,220,245,.22)";ctx.fillRect(123,650,134,137);
  ctx.fillStyle="#168db8";ctx.fillRect(425,490,210,400);ctx.fillStyle="#05264a";ctx.fillRect(425,740,210,150);
  arrow(340,680,380,680);
 }else if(mode==="rays"){
  ocean(430);ctx.fillStyle="#ffd66e";ctx.beginPath();ctx.arc(555,260,68,0,Math.PI*2);ctx.fill();rays(110,330,420,.8);
  const bx=210+p*210;line(bx,430,bx+85,900,"#fff1b1",13);label("LA LUZ DEL SOL ENTRA",cx,235,29);
 }else{
  ocean(430);
  for(let k=0;k<7;k++){const y=520+k*75;const x=35+((k*97+p*160)%620);ctx.beginPath();ctx.ellipse(x,y,55,9,0,0,Math.PI*2);ctx.strokeStyle="rgba(171,242,255,.7)";ctx.lineWidth=4;ctx.stroke();}
  label("EL OCÉANO EN GRAN ESCALA",cx,260,29);
 }
 ctx.restore();
 // Editorial overlay and persistent progress indicator.
 panel(28,54,664,112,"rgba(2,10,24,.82)");label(title,cx,122,title.length>36?23:30);
 label(item.segmentLabel||("BLOQUE "+(index+1)),cx,1150,21,"#c6e5f4");
 ctx.fillStyle="rgba(255,255,255,.2)";ctx.fillRect(55,1190,610,8);ctx.fillStyle="#63e4c1";ctx.fillRect(55,1190,610*p,8);
}
window.JAIStoryEngine={draw};
})();