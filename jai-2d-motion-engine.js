const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
const IDENTITY=Object.freeze({x:0,y:0,rotation:0,scale:1,opacity:1});

export function easeMotionProgress(value,easing="smoothstep"){
  const t=clamp(finite(value,0),0,1);
  if(easing==="linear")return t;
  if(easing==="ease-in")return t*t;
  if(easing==="ease-out")return 1-(1-t)*(1-t);
  if(easing==="ease-in-out")return t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
  return t*t*(3-2*t);
}

export function interpolateMotionTransform(from={},to={},progress=0,easing="smoothstep"){
  const a={...IDENTITY,...from},b={...IDENTITY,...to},t=easeMotionProgress(progress,easing);
  return {
    x:finite(a.x,0)+(finite(b.x,0)-finite(a.x,0))*t,
    y:finite(a.y,0)+(finite(b.y,0)-finite(a.y,0))*t,
    rotation:finite(a.rotation,0)+(finite(b.rotation,0)-finite(a.rotation,0))*t,
    scale:finite(a.scale,1)+(finite(b.scale,1)-finite(a.scale,1))*t,
    opacity:clamp(finite(a.opacity,1)+(finite(b.opacity,1)-finite(a.opacity,1))*t,0,1)
  };
}

export function resolveMotionTransform(steps,progress=0){
  const ordered=(Array.isArray(steps)?steps:[])
    .filter(step=>step&&Number.isFinite(Number(step.start_progress))&&Number.isFinite(Number(step.end_progress))&&Number(step.end_progress)>Number(step.start_progress))
    .slice().sort((a,b)=>Number(a.start_progress)-Number(b.start_progress));
  if(!ordered.length)return {...IDENTITY};
  const p=clamp(finite(progress,0),0,1);
  let previous={...IDENTITY};
  for(const step of ordered){
    const start=clamp(Number(step.start_progress),0,1),end=clamp(Number(step.end_progress),0,1);
    const from=step.from_transform||previous,to=step.to_transform||from;
    if(p<start)return {...from};
    if(p<=end){
      const raw=(p-start)/Math.max(.0001,end-start);
      return interpolateMotionTransform(from,to,raw,step.easing||"smoothstep");
    }
    previous={...to};
  }
  return previous;
}

export function resolveLayerMotionChain(layer,layers,steps,progress,partParents){
  const chain=[],seen=new Set([layer?.id]);
  if(layer?.character_id&&layer?.part_id){
    const parentsFor=(bone)=>typeof partParents==="function"?partParents(bone?.character_id):partParents;
    let parentPart=parentsFor(layer)?.[String(layer.part_id).toLowerCase().replace(/[ -]/g,"_")],depth=0;
    while(parentPart&&depth++<8){
      const parent=(Array.isArray(layers)?layers:[]).find(candidate=>
        candidate?.character_id===layer.character_id&&
        String(candidate?.part_id||"").toLowerCase().replace(/[ -]/g,"_")===parentPart&&
        !seen.has(candidate?.id));
      if(!parent)break;
      chain.unshift(parent);seen.add(parent.id);
      parentPart=parentsFor(parent)?.[String(parent.part_id).toLowerCase().replace(/[ -]/g,"_")];
    }
  }
  return [...chain,layer].filter(Boolean).map(bone=>({
    bone,
    transform:resolveMotionTransform((Array.isArray(steps)?steps:[]).filter(step=>step?.target_id===bone.id),progress)
  }));
}

export function resolvePartParentsFromRigs(rigs,characterId,fallback={}){
  const parents={...(fallback&&typeof fallback==="object"?fallback:{})};
  const rig=(Array.isArray(rigs)?rigs:[]).find(item=>item?.character_id===characterId);
  for(const bone of Array.isArray(rig?.bones)?rig.bones:[]){
    const part=String(bone?.part_id||"").toLowerCase().replace(/[ -]/g,"_");
    const parent=String(bone?.parent_bone_id||"").toLowerCase().replace(/[ -]/g,"_");
    if(part&&parent&&part!==parent)parents[part]=parent;
  }
  return parents;
}


/**
 * Rejects character rigs whose bone hierarchy changes between shots.
 * Returns null for a consistent rig or a human-readable validation error.
 */
export function validateCharacterRigContinuity(shots){
  const characters=new Map();
  const normalize=value=>String(value||"").trim().toLowerCase().replace(/[ -]+/g,"_");
  for(const [shotIndex,shot] of (Array.isArray(shots)?shots:[]).entries()){
    for(const layer of Array.isArray(shot?.layers)?shot.layers:[]){
      const characterId=String(layer?.character_id||"").trim();
      const partId=normalize(layer?.part_id);
      if(!characterId||!partId)continue;
      if(!characters.has(characterId))characters.set(characterId,{parts:new Set(),parents:new Map()});
      const rig=characters.get(characterId);
      rig.parts.add(partId);
      const parentId=normalize(layer?.parent_part_id);
      if(!parentId)continue;
      if(parentId===partId)return "El rig del personaje "+characterId+" contiene una articulación que se enlaza consigo misma ("+partId+").";
      const existing=rig.parents.get(partId);
      if(existing&&existing!==parentId)return "El rig del personaje "+characterId+" cambia el padre de "+partId+" entre tomas ("+existing+" / "+parentId+").";
      rig.parents.set(partId,parentId);
    }
  }
  for(const [characterId,rig] of characters){
    for(const [partId,parentId] of rig.parents){
      if(!rig.parts.has(parentId))return "El rig del personaje "+characterId+" enlaza "+partId+" con el padre inexistente "+parentId+".";
    }
    for(const partId of rig.parts){
      const visited=new Set();
      let cursor=partId;
      while(rig.parents.has(cursor)){
        if(visited.has(cursor))return "El rig del personaje "+characterId+" contiene un ciclo de articulaciones en "+cursor+".";
        visited.add(cursor);
        cursor=rig.parents.get(cursor);
      }
    }
  }
  return null;
}


/**
 * Prevents abrupt jumps or ambiguous overlap when one layer has multiple
 * sequential animation segments within the same shot.
 */
export function validateMotionStepContinuity(shots){
  const keys=["x","y","rotation","scale","opacity"];
  const close=(a,b)=>keys.every(key=>{
    const left=Number(a?.[key]),right=Number(b?.[key]);
    return Number.isFinite(left)&&Number.isFinite(right)&&Math.abs(left-right)<=0.001;
  });
  for(const [shotIndex,shot] of (Array.isArray(shots)?shots:[]).entries()){
    const targets=new Map();
    for(const step of Array.isArray(shot?.animation_steps)?shot.animation_steps:[]){
      const target=String(step?.target_id||"");
      if(!target)continue;
      if(!targets.has(target))targets.set(target,[]);
      targets.get(target).push(step);
    }
    for(const [target,steps] of targets){
      if(steps.length<2)continue;
      const ordered=steps.slice().sort((a,b)=>Number(a.start_progress)-Number(b.start_progress));
      for(let index=1;index<ordered.length;index++){
        const previous=ordered[index-1],next=ordered[index];
        if(Number(next.start_progress)<Number(previous.end_progress)-0.0001){
          return "La capa "+target+" de la toma "+(shotIndex+1)+" tiene acciones de animación solapadas.";
        }
        if(!close(previous.to_transform,next.from_transform)){
          return "La animación de la capa "+target+" de la toma "+(shotIndex+1)+" presenta un salto entre acciones consecutivas.";
        }
      }
    }
  }
  return null;
}
