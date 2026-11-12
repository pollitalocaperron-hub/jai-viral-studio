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
 const ocean=(top=430)=>{
  // Cinematic environment: atmospheric sky, layered horizon, moving wave bands and underwater caustics.
  const sky=ctx.createLinearGradient(0,0,0,top+30);sky.addColorStop(0,"#8eb9d0");sky.addColorStop(.62,"#d6e8e8");sky.addColorStop(1,"#f7dca8");
  ctx.fillStyle=sky;ctx.fillRect(0,0,w,top+12);
  const haze=ctx.createRadialGradient(w*.73,top*.48,12,w*.73,top*.48,290);haze.addColorStop(0,"rgba(255,242,194,.7)");haze.addColorStop(1,"rgba(255,242,194,0)");
  ctx.fillStyle=haze;ctx.fillRect(0,0,w,top+30);
  const g=ctx.createLinearGradient(0,top,0,h);g.addColorStop(0,"#45c5d0");g.addColorStop(.12,"#148eaf");g.addColorStop(.43,"#07577f");g.addColorStop(1,"#03152f");
  ctx.fillStyle=g;ctx.fillRect(0,top,w,h-top);
  // Distant horizon and successive wave planes create real spatial depth.
  ctx.fillStyle="rgba(4,54,78,.22)";ctx.beginPath();ctx.moveTo(0,top+18);ctx.quadraticCurveTo(w*.28,top-4,w*.52,top+15);ctx.quadraticCurveTo(w*.8,top+35,w,top+8);ctx.lineTo(w,top+75);ctx.lineTo(0,top+75);ctx.fill();
  for(let layer=0;layer<5;layer++){
   const y=top+55+layer*48,amp=7+layer*2,shift=(p*52+layer*73)%150;
   ctx.beginPath();ctx.moveTo(-30,y);
   for(let x=-30;x<=w+40;x+=35)ctx.quadraticCurveTo(x+17,y+Math.sin((x+shift)/74)*amp,x+35,y+Math.sin((x+shift+35)/74)*amp);
   ctx.strokeStyle="rgba(178,245,239,"+(0.34-layer*.045)+")";ctx.lineWidth=layer<2?5:3;ctx.stroke();
  }
  // Broken sunlight reflections on the surface.
  for(let k=0;k<18;k++){
   const x=(k*47+Math.sin(p*5+k)*18)%w,y=top+12+(k%4)*12;
   ctx.strokeStyle="rgba(255,239,190,"+(.18+(k%3)*.08)+")";ctx.lineWidth=2+(k%3);
   ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+18+(k%4)*9,y+Math.sin(p*4+k)*3);ctx.stroke();
  }
  // Subtle underwater light shafts and caustic ripples add scale and atmosphere.
  ctx.save();ctx.globalAlpha=.22;
  for(let k=0;k<6;k++){
   const x=55+k*125+Math.sin(p*2+k)*13;
   const beam=ctx.createLinearGradient(x,top+20,x+90,h*.8);beam.addColorStop(0,"rgba(177,249,245,.7)");beam.addColorStop(1,"rgba(75,190,220,0)");
   ctx.fillStyle=beam;ctx.beginPath();ctx.moveTo(x-9,top+20);ctx.lineTo(x+9,top+20);ctx.lineTo(x+100,h*.78);ctx.lineTo(x+45,h*.78);ctx.closePath();ctx.fill();
  }
  ctx.restore();
  for(let k=0;k<12;k++){
   const x=35+((k*61+p*18)%650),y=top+190+((k*97)%560);
   ctx.strokeStyle="rgba(135,226,235,.13)";ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(x,y,12+(k%4)*5,5+(k%3)*2,0,0,Math.PI*2);ctx.stroke();
  }
  ctx.fillStyle="rgba(191,249,242,.75)";ctx.fillRect(0,top-3,w,5);
 };
 const rays=(x,y,len,alpha=1)=>{ctx.save();ctx.globalAlpha=alpha;["#fff3bd","#ff9a70","#ffdf77","#70dcff","#9c9aff"].forEach((c,k)=>{ctx.strokeStyle=c;ctx.lineWidth=k===0?13:8;ctx.beginPath();ctx.moveTo(x,y+k*12);ctx.lineTo(x+len,y+len*.58+k*9);ctx.stroke();});ctx.restore();};
 const bg=ctx.createLinearGradient(0,0,w,h);bg.addColorStop(0,"#07162c");bg.addColorStop(1,water?"#06435e":"#18294b");ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
 // Beat-level action has priority. Broad words such as "comparación" in the scene objective
 // must never override the concrete object/action requested for this three-second beat.
 let mode="ocean";
 // Specific beat actions win over broad scene descriptions. The same parent scene
 // can therefore produce a different composition every three-second beat.
 if(/aparicion simultanea|vaso y el mar|vaso frente al mar|paradoja/.test(beat))mode="paradox";
 else if(/primer plano.*vaso|vaso|vidrio|cristal/.test(beat))mode="glass";
 else if(/ingreso.*rayo|rayo de sol|luz solar directa|sol entra|haz de luz/.test(beat))mode="sunbeam";
 else if(/descomposicion|bandas de colores|espectro|arcoiris|siete colores|colores ocultos|se despliega/.test(beat))mode="spectrum";
 else if(/molecula|molecular|contacto de la luz/.test(beat))mode="molecules";
 else if(/calor|energia roja|transformacion de la energia|se convierte/.test(beat))mode="heat";
 else if(/camino.*ondas azules|ondas azules|azul penetra|azul sigue|continua avanzando/.test(beat))mode="bluepath";
 else if(/dispersion|dispersa|rebote|sube a la superficie|hacia arriba|sale hacia la superficie|asciende/.test(beat))mode="scatter";
 else if(/grafico de profundidad|profundidad|metros|distancia recorrida/.test(beat))mode="depth";
 else if(/comparacion|comparar|lado a lado|volumen|vaso vs|escala|cuestion de grosor|grosor|recorrido corto/.test(beat))mode="compare";
 else if(/no es el cielo|cielo nublado|cielo gris|mito del reflejo|papel del cielo/.test(beat))mode="skytest";
 else if(/acercamiento final|columna azul|azul profundo|recompensa final|el agua crea su azul|titulo final/.test(beat))mode="finalblue";
 else if(/gota|macro|lupa/.test(beat))mode="drop";
 else if(/particula|suspension/.test(beat))mode="particles";
 else if(/absor|rojo|naranja|amarillo|se apaga|desvanec/.test(beat))mode="absorb";
 else if(/columna|desciend|capa delgada/.test(beat))mode="column";
 else if(/observador|mirando hacia arriba|perspectiva submarina/.test(beat))mode="observer";
 else if(/filtro|colador/.test(beat))mode="filter";
 else if(/superficie|plano general|oceano completo|mar abierto/.test(beat))mode="ocean";
 else if(/rayo|haz de luz|luz blanca|sol/.test(beat))mode="rays";
 // Fallback editorial determinista para el documental del océano:
 // nunca permitir que una descripción ambigua deje todos los bloques en el mismo plano genérico.
 const oceanColorTopic=/oceano|mar/.test(all)&&/agua|azul|luz|color/.test(all);
 if(oceanColorTopic){
  const oceanSequence=["paradox","sunbeam","spectrum","molecules","absorb","bluepath","scatter","depth","compare","skytest","drop","rays","filter","finalblue"];
  mode=oceanSequence[((Number(index)||0)%oceanSequence.length)];
 }
 else if(/vaso|vidrio|cristal/.test(sceneText))mode="glass";
 else if(/espectro|bandas de colores/.test(sceneText))mode="spectrum";
 else if(/absor|rojo|naranja/.test(sceneText))mode="absorb";
 else if(/columna|profund/.test(sceneText))mode="column";
 else if(/compar/.test(sceneText))mode="compare";
 ctx.save();
 if(mode==="paradox"){
  // Apertura con objetos reconocibles: vaso realista en primer plano y horizonte oceánico.
  ctx.fillStyle="#d9e8f2";ctx.fillRect(0,0,w,390);
  ctx.fillStyle="#f8d98a";ctx.beginPath();ctx.arc(565,245,62,0,Math.PI*2);ctx.fill();
  ocean(430);
  // mesa clara para separar visualmente el vaso del mar
  ctx.fillStyle="#c9d7df";ctx.fillRect(0,850,w,42);
  ctx.fillStyle="rgba(20,38,54,.18)";ctx.fillRect(75,892,260,18);
  ctx.save();ctx.translate(205,0);
  ctx.fillStyle="rgba(151,229,245,.18)";ctx.strokeStyle="#f4fdff";ctx.lineWidth=13;
  ctx.beginPath();ctx.moveTo(-95,450);ctx.lineTo(95,450);ctx.lineTo(78,835);ctx.quadraticCurveTo(0,885,-78,835);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle="rgba(51,177,220,.38)";ctx.beginPath();ctx.moveTo(-82,610);ctx.lineTo(82,610);ctx.lineTo(76,825);ctx.quadraticCurveTo(0,865,-76,825);ctx.closePath();ctx.fill();
  ctx.strokeStyle="rgba(255,255,255,.9)";ctx.lineWidth=8;ctx.beginPath();ctx.ellipse(0,450,95,18,0,0,Math.PI*2);ctx.stroke();
  ctx.restore();
  label("POCA AGUA",205,960,25);label("EL OCÉANO",535,960,25);
  label("¿POR QUÉ SE VEN DISTINTOS?",cx,330,27);
 }else if(mode==="sunbeam"){
  // Dramatic sun entering the ocean; moving beam sweeps diagonally through water.
  ocean(420);const sx=545-p*120;ctx.fillStyle="#ffe18b";ctx.beginPath();ctx.arc(sx,260,76,0,Math.PI*2);ctx.fill();
  for(let k=0;k<9;k++){const x=sx-150+k*38;line(sx,335,x+90,1000,"rgba(255,229,151,"+(.12+k*.018)+")",10);}
  line(0,430,w,430,"#b4f4ff",8);label("LA LUZ ENTRA AL AGUA",cx,230,29);
 }else if(mode==="molecules"){
  // Molecular-scale scene: water molecules form a recognizable repeated structure.
  ocean(390);for(let row=0;row<4;row++)for(let col=0;col<4;col++){
   const x=115+col*165+(row%2)*35,y=535+row*135;
   dot(x,y,25,"#e7f8ff");dot(x-25,y-22,13,"#ff7770");dot(x+25,y-22,13,"#ff7770");
   line(x-17,y-15,x-5,y-5,"#fff",5);line(x+17,y-15,x+5,y-5,"#fff",5);
  }
  rays(25,450,180,.7);label("LUZ + MOLÉCULAS DE AGUA",cx,280,26);
 }else if(mode==="heat"){
  // Red/orange wavelengths transfer energy; warm particles glow and rise as heat.
  ocean(410);for(let k=0;k<5;k++){
   const x=120+k*120,y=570+(k%2)*100;
   line(65,y,x,y,"#ff695f",15);dot(x,y,17,"#ff9c62");
   for(let q=0;q<4;q++){const yy=y-55-q*42-p*35;dot(x+Math.sin(q+k)*18,yy,7+q,"rgba(255,178,91,.9)");}
  }
  label("ENERGÍA QUE SE TRANSFORMA",cx,280,26);label("CALOR",cx,1030,42,"#ffb56e");
 }else if(mode==="bluepath"){
  // Blue wavelengths travel farther through the water while warm light fades early.
  ocean(390);line(65,500,265,500,"#ff685d",16);for(let q=0;q<5;q++)dot(280+q*16,500,7,"#ff806c");
  line(65,780,610,780,"#72dcff",19);arrow(500,780,635,780,"#a5edff",11);
  for(let k=0;k<6;k++)dot(145+k*86,780+Math.sin(p*5+k)*22,7,"#d4f8ff");
  label("EL AZUL PENETRA MÁS",cx,275,31);
 }else if(mode==="scatter"){
  // Scattering redirects blue light in several directions, not off the seabed.
  ocean(390);const ox=340,oy=720;dot(ox,oy,32,"#d9f7ff");
  const angles=[-2.8,-2.25,-1.75,-1.25,-.7,-.25,.25];
  angles.forEach((ang,k)=>{const len=170+(k%3)*65;arrow(ox,oy,ox+Math.cos(ang)*len,oy+Math.sin(ang)*len,"#7fe1ff",7);});
  line(340,420,340,680,"rgba(255,238,180,.8)",12);
  label("EL AZUL SE DISPERSA",cx,275,31);label("EN MUCHAS DIRECCIONES",cx,1050,24);
 }else if(mode==="depth"){
  // Depth ruler and colored attenuation by depth.
  ocean(400);line(130,445,130,1060,"#eafaff",6);
  for(let k=0;k<6;k++){const y=470+k*105;line(115,y,150,y,"#eafaff",5);label((k*10)+" m",205,y+8,21,"#d7f5ff");}
  const fade=ctx.createLinearGradient(0,420,0,1050);fade.addColorStop(0,"rgba(255,90,75,.9)");fade.addColorStop(.28,"rgba(255,90,75,.15)");fade.addColorStop(.29,"rgba(255,90,75,0)");fade.addColorStop(.55,"rgba(78,190,255,.42)");fade.addColorStop(1,"rgba(38,132,255,.08)");
  ctx.fillStyle=fade;ctx.fillRect(270,430,330,620);label("LA PROFUNDIDAD FILTRA LA LUZ",cx,285,25);
 }else if(mode==="skytest"){
  // Separate the ocean's intrinsic blue from a grey, non-blue sky: no mirror-like reflection.
  ocean(470);
  ctx.fillStyle="#8796a8";ctx.fillRect(0,180,w,280);
  for(let k=0;k<7;k++){
   const x=45+k*100,y=245+(k%3)*38;
   ctx.fillStyle="rgba(225,232,238,.72)";ctx.beginPath();ctx.ellipse(x,y,72,27,0,0,Math.PI*2);ctx.fill();
   ctx.beginPath();ctx.ellipse(x+34,y-10,48,24,0,0,Math.PI*2);ctx.fill();
  }
  // A visible cross-section shows blue light emerging from the water itself.
  for(let k=0;k<5;k++){
   const x=115+k*115;
   arrow(x,900,x+18,540,"#8ce8ff",8);
  }
  panel(45,970,630,100,"rgba(2,13,32,.72)");
  label("EL AZUL NACE EN EL AGUA",cx,1032,27);
 }else if(mode==="finalblue"){
  // Final payoff: a cinematic blue water column with rays fading through depth.
  ocean(340);const g=ctx.createLinearGradient(0,350,0,1100);g.addColorStop(0,"rgba(114,229,255,.75)");g.addColorStop(.45,"rgba(29,151,218,.28)");g.addColorStop(1,"rgba(1,16,53,.05)");
  ctx.fillStyle=g;ctx.fillRect(80,360,560,720);
  for(let k=0;k<7;k++){const x=100+k*88;line(x,380,x+70,930,"rgba(159,237,255,.24)",13);}
  for(let k=0;k<5;k++){ctx.beginPath();ctx.ellipse(360,570+k*105,210-k*23,22,0,0,Math.PI*2);ctx.strokeStyle="rgba(139,230,255,"+(0.65-k*.1)+")";ctx.lineWidth=5;ctx.stroke();}
  label("EL OCÉANO SE VE AZUL",cx,260,31);
 }else if(mode==="glass"){
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
  // A physical glass prism refracts a moving white beam into a fan of seven colors.
  const cols=["#ff5b55","#ff9d52","#ffe16b","#6bdc8b","#51c9ef","#7187ff","#b68cff"];
  const py=640+Math.sin(p*Math.PI*2)*12;
  ctx.save();
  const beam=ctx.createLinearGradient(35,py,285,py);beam.addColorStop(0,"rgba(255,255,255,0)");beam.addColorStop(1,"#fffef0");
  ctx.strokeStyle=beam;ctx.lineWidth=22;ctx.beginPath();ctx.moveTo(35,py);ctx.lineTo(290,py);ctx.stroke();
  // Glass prism with highlights and visible refraction edges.
  ctx.fillStyle="rgba(166,235,255,.18)";ctx.strokeStyle="rgba(230,251,255,.95)";ctx.lineWidth=9;
  ctx.beginPath();ctx.moveTo(300,430);ctx.lineTo(520,820);ctx.lineTo(165,820);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.strokeStyle="rgba(255,255,255,.45)";ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(300,450);ctx.lineTo(485,790);ctx.stroke();
  cols.forEach((color,k)=>{
   const y1=py+(k-3)*2,y2=500+k*88;
   ctx.strokeStyle=color;ctx.lineWidth=17;ctx.globalAlpha=.94;
   ctx.beginPath();ctx.moveTo(495,py+(k-3)*5);ctx.quadraticCurveTo(560,y1+(k-3)*25,680,y2);ctx.stroke();
   ctx.globalAlpha=1;
  });
  ctx.restore();
  label("LA LUZ BLANCA SE DESCOMPONE",cx,280,26);
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