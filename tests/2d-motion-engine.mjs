import assert from "node:assert/strict";
import { easeMotionProgress, interpolateMotionTransform, resolveMotionTransform, resolveLayerMotionChain } from "../jai-2d-motion-engine.js";

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

console.log("2D motion engine easing, keyframe continuity and parent rig propagation: PASS");
