import assert from "node:assert/strict";
import { easeMotionProgress, interpolateMotionTransform, resolveMotionTransform, resolveLayerMotionChain, resolvePartParentsFromRigs, validateCharacterRigContinuity, validateMotionStepContinuity } from "../jai-2d-motion-engine.js";

assert.equal(easeMotionProgress(0),0);
assert.equal(easeMotionProgress(1),1);
assert.equal(easeMotionProgress(.5,"linear"),.5);
assert.equal(easeMotionProgress(.5,"ease-in"),.25);
assert.equal(easeMotionProgress(.5,"ease-out"),.75);
assert.equal(easeMotionProgress(2),1);

const midpoint=interpolateMotionTransform({x:0,y:10,rotation:0,scale:1,opacity:1},{x:100,y:30,rotation:90,scale:2,opacity:.2},.5,"linear");
assert.deepEqual(midpoint,{x:50,y:20,rotation:45,scale:1.5,opacity:.6});

const steps=[
 {target_id:"torso",start_progress:0,end_progress:.5,from_transform:{x:0,y:0,rotation:0,scale:1,opacity:1},to_transform:{x:20,y:10,rotation:0,scale:1,opacity:1},easing:"linear"},
 {target_id:"torso",start_progress:.5,end_progress:1,from_transform:{x:20,y:10,rotation:0,scale:1,opacity:1},to_transform:{x:40,y:20,rotation:0,scale:1,opacity:1},easing:"linear"}
];
assert.deepEqual(resolveMotionTransform(steps,.25),{x:10,y:5,rotation:0,scale:1,opacity:1});
assert.deepEqual(resolveMotionTransform(steps,.75),{x:30,y:15,rotation:0,scale:1,opacity:1});
assert.deepEqual(resolveMotionTransform(steps,1),{x:40,y:20,rotation:0,scale:1,opacity:1});

const layers=[
 {id:"torso",character_id:"hero",part_id:"torso"},
 {id:"head",character_id:"hero",part_id:"head"},
 {id:"eyes",character_id:"hero",part_id:"eyes"}
];
const chain=resolveLayerMotionChain(layers[2],layers,steps.concat([
 {target_id:"head",start_progress:0,end_progress:1,from_transform:{x:0,y:0,rotation:0,scale:1,opacity:1},to_transform:{x:0,y:-8,rotation:0,scale:1,opacity:1},easing:"linear"},
 {target_id:"eyes",start_progress:0,end_progress:1,from_transform:{x:0,y:0,rotation:0,scale:1,opacity:1},to_transform:{x:0,y:-2,rotation:0,scale:1,opacity:1},easing:"linear"}
]),.5,{head:"torso",eyes:"head"});
assert.deepEqual(chain.map(item=>item.bone.id),["torso","head","eyes"]);
assert.equal(chain[0].transform.x,20);
assert.equal(chain[1].transform.y,-4);
assert.equal(chain[2].transform.y,-1);


const multiCharacterLayers=[
 {id:"hero-body",character_id:"hero",part_id:"torso"},
 {id:"hero-head",character_id:"hero",part_id:"head"},
 {id:"robot-body",character_id:"robot",part_id:"body"},
 {id:"robot-head",character_id:"robot",part_id:"head"}
];
const parentsByCharacter={
 hero:{head:"torso"},
 robot:{head:"body"}
};
const resolveParentsForCharacter=characterId=>parentsByCharacter[characterId]||{};
const heroChain=resolveLayerMotionChain(multiCharacterLayers[1],multiCharacterLayers,[],.5,resolveParentsForCharacter);
const robotChain=resolveLayerMotionChain(multiCharacterLayers[3],multiCharacterLayers,[],.5,resolveParentsForCharacter);
assert.deepEqual(heroChain.map(item=>item.bone.id),["hero-body","hero-head"],
 "Each character must inherit only its own director-generated bone hierarchy");
assert.deepEqual(robotChain.map(item=>item.bone.id),["robot-body","robot-head"],
 "A second character with the same part IDs must use its own reusable rig, not the first character's rig");

console.log("2D motion engine easing, keyframe continuity and parent rig propagation: PASS");

const generatedRigParents=resolvePartParentsFromRigs([{character_id:"hero",bones:[
 {part_id:"torso",parent_bone_id:null},{part_id:"head",parent_bone_id:"torso"},{part_id:"eyes",parent_bone_id:"head"}
]}],"hero",{head:"neck"});
assert.deepEqual(generatedRigParents,{head:"torso",eyes:"head"});
const customRigLayers=[
 {id:"body",character_id:"hero",part_id:"torso"},
 {id:"skull",character_id:"hero",part_id:"head"},
 {id:"iris",character_id:"hero",part_id:"eyes"}
];
const customRigChain=resolveLayerMotionChain(customRigLayers[2],customRigLayers,[],.5,generatedRigParents);
assert.deepEqual(customRigChain.map(item=>item.bone.id),["body","skull","iris"],
 "Renderer hierarchy must follow the director-generated reusable rig, including non-default parent links");


const consistentRigShots=[
 {shot_id:"shot-1",layers:[{character_id:"hero",part_id:"torso"},{character_id:"hero",part_id:"head",parent_part_id:"torso"}]},
 {shot_id:"shot-2",layers:[{character_id:"hero",part_id:"torso"},{character_id:"hero",part_id:"head",parent_part_id:"torso"}]}
];
assert.equal(validateCharacterRigContinuity(consistentRigShots),null);
assert.equal(validateCharacterRigContinuity([
 {layers:[{character_id:"hero",part_id:"torso"},{character_id:"hero",part_id:"head",parent_part_id:"torso"}]},
 {layers:[{character_id:"hero",part_id:"neck"},{character_id:"hero",part_id:"head",parent_part_id:"neck"}]}
])?.includes("cambia el padre"),true,"A character bone cannot silently change parent between shots");
assert.equal(validateCharacterRigContinuity([
 {layers:[{character_id:"hero",part_id:"head",parent_part_id:"torso"}]}
])?.includes("padre inexistente"),true,"Explicit parent links must resolve to a real part in the character bible");
assert.equal(validateCharacterRigContinuity([
 {layers:[{character_id:"hero",part_id:"torso"},{character_id:"hero",part_id:"head",parent_part_id:"torso"}]},
 {layers:[{character_id:"hero",part_id:"head",parent_part_id:"torso"}]}
])?.includes("no aparece junto"),true,"A parent bone must be present in the same shot because the renderer can only inherit transforms from current-shot layers");
assert.equal(validateCharacterRigContinuity([
 {layers:[{character_id:"hero",part_id:"torso"},{character_id:"hero",part_id:"head"}]},
 {layers:[{character_id:"hero",part_id:"head"}]}
])?.includes("no aparece junto"),true,"Inferred anatomical parents must also be present in every shot where the child is rendered");
assert.equal(validateCharacterRigContinuity([
 {layers:[{character_id:"hero",part_id:"torso",parent_part_id:"head"},{character_id:"hero",part_id:"head",parent_part_id:"torso"}]}
])?.includes("ciclo"),true,"Cyclic bone hierarchies must be rejected");
assert.equal(validateCharacterRigContinuity([
 {layers:[{character_id:"hero",part_id:"torso"},{character_id:"hero",part_id:"head",parent_part_id:"torso"},{character_id:"robot",part_id:"head",parent_part_id:"body"},{character_id:"robot",part_id:"body"}]}
]),null,"Identically named parts in different characters must remain isolated");
console.log("Character rig continuity: consistent parents, orphan rejection, cycle rejection and multi-character isolation: PASS");


const poseA={x:0,y:0,rotation:0,scale:1,opacity:1};
const poseB={x:0,y:-40,rotation:8,scale:1,opacity:1};
const poseC={x:12,y:-40,rotation:0,scale:1,opacity:1};
assert.equal(validateMotionStepContinuity([{animation_steps:[
 {target_id:"arm",start_progress:0,end_progress:.45,from_transform:poseA,to_transform:poseB},
 {target_id:"arm",start_progress:.45,end_progress:1,from_transform:poseB,to_transform:poseC}
]}]),null,"Sequential actions on one layer must join at the exact same pose");
assert.match(validateMotionStepContinuity([{animation_steps:[
 {target_id:"arm",start_progress:0,end_progress:.55,from_transform:poseA,to_transform:poseB},
 {target_id:"arm",start_progress:.5,end_progress:1,from_transform:poseB,to_transform:poseC}
]}])||"",/solapadas/,"Overlapping actions on one layer must be rejected");
assert.match(validateMotionStepContinuity([{animation_steps:[
 {target_id:"arm",start_progress:0,end_progress:.5,from_transform:poseA,to_transform:poseB},
 {target_id:"arm",start_progress:.5,end_progress:1,from_transform:poseA,to_transform:poseC}
]}])||"",/salto/,"A pose discontinuity between sequential actions must be rejected");
assert.equal(validateMotionStepContinuity([{animation_steps:[
 {target_id:"arm",start_progress:0,end_progress:.6,from_transform:poseA,to_transform:poseB},
 {target_id:"head",start_progress:.2,end_progress:.9,from_transform:poseA,to_transform:poseC}
]}]),null,"Different layers may animate concurrently");
console.log("Motion continuity: sequential pose joins, overlap rejection and concurrent independent layers: PASS");
