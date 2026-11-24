import assert from "node:assert/strict";
import { normalizeLegacyShot, validateSceneContract, getSceneReadiness } from "../api/jai-scene-contract.js";

const legacy = {
  shot_id: "shot-01", scene_index: 0, start_seconds: 0, end_seconds: 4.5,
  continuity_anchor: "mismo personaje y entorno",
  narration_segment: "La transformación comienza.", subtitle: "Inicio",
  layers: [
    { id: "a", path_d: "M 1 1 L 20 1 L 20 20 Z", character_id: "hero" },
    { id: "b", path_d: "M 2 2 L 21 2 L 21 21 Z", character_id: "hero" },
    { id: "c", path_d: "M 3 3 L 22 3 L 22 22 Z" }
  ],
  animation_steps: [{ target_id: "a", action: "move" }],
  narration_sync: [{ start_seconds: 0, end_seconds: 1 }]
};
const scene = normalizeLegacyShot(legacy);
assert.equal(validateSceneContract(scene).valid, true);
assert.equal(scene.visual.source_type, "vector_scene");
assert.equal(getSceneReadiness(scene).cinematic_ready, false);
assert.equal(getSceneReadiness(scene).status, "vector_preview_only");

assert.throws(() => normalizeLegacyShot({ ...legacy, end_seconds: -1 }), /intervalo temporal inválido/);
