import assert from "node:assert/strict";
import { validateShots, validateAnimationContinuity } from "../api/scene-contract.js";

const story = Array.from({ length: 4 }, (_, index) => ({ time: "0:" + String(index * 9).padStart(2, "0") + " - 0:" + String(index * 9 + 9).padStart(2, "0") }));
const transform = (overrides = {}) => ({ x: 0, y: 0, rotation: 0, scale: 1, opacity: 1, ...overrides });

function makeShots() {
  const shots = [];
  story.forEach((scene, sceneIndex) => {
    for (let part = 0; part < 2; part++) {
      const start = sceneIndex * 9 + part * 4.5;
      shots.push({
        scene_index: sceneIndex, start_seconds: start, end_seconds: start + 4.5,
        narration_segment: "La explicación describe esta acción concreta.", subtitle: "Acción " + part,
        subject: "Componente principal", visual_state: "Estado inicial y cambio visible",
        visual_action: "El componente cambia de posición de forma observable",
        visual_prompt_en: "Clean educational 2D editorial illustration of the exact mechanical component in a coherent portrait composition, clear shapes, consistent palette, separated readable parts and a specific teaching action.",
        continuity_anchor: "Same component geometry, color, scale and orientation across adjacent shots.",
        background_color: "#F2EEE4",
        layers: [
          { id: "component", description: "Componente principal", role: "subject", path_d: "M 240 420 C 260 360 460 360 480 420 L 480 760 C 460 820 260 820 240 760 Z", fill: "#E7A65A", stroke: "#25364A", stroke_width: 9, pivot_x: 360, pivot_y: 640 },
          { id: "housing", description: "Estructura contenedora", role: "environment", path_d: "M 150 300 L 570 300 L 570 900 L 150 900 Z", fill: "#D8E1E8", stroke: "#25364A", stroke_width: 9, pivot_x: 360, pivot_y: 640 },
          { id: "detail", description: "Detalle funcional", role: "detail", path_d: "M 300 500 C 330 470 390 470 420 500 L 420 600 L 300 600 Z", fill: "#E9D16C", stroke: "#25364A", stroke_width: 7, pivot_x: 360, pivot_y: 550 }
        ],
        animation_steps: [
          { target_id: "component", action: "move", from_state: "lower", to_state: "upper", start_progress: 0, end_progress: 1, from_transform: transform(), to_transform: transform({ y: -70 }) },
          { target_id: "housing", action: "hold", from_state: "fixed", to_state: "fixed", start_progress: 0, end_progress: 1, from_transform: transform(), to_transform: transform() },
          { target_id: "detail", action: "reveal", from_state: "hidden", to_state: "visible", start_progress: 0, end_progress: 1, from_transform: transform({ y: 20, scale: 0.85, opacity: 0 }), to_transform: transform() }
        ]
      });
    }
  });
  return shots;
}

const valid = makeShots();
assert.equal(validateShots(valid, story), null, "A continuous, layered and genuinely animated plan must pass");

const oneLayerOnly = structuredClone(valid);
oneLayerOnly[0].animation_steps[2].target_id = "component";
assert.match(validateShots(oneLayerOnly, story), /dos capas independientes/);

const noRealMotion = structuredClone(valid);
noRealMotion[0].animation_steps.forEach(step => { step.to_transform = structuredClone(step.from_transform); });
assert.match(validateShots(noRealMotion, story), /ningún cambio real/);

const invalidState = structuredClone(valid);
delete invalidState[0].animation_steps[0].to_state;
assert.match(validateShots(invalidState, story), /transformación\/progresión incorrecta/);

const overlappingLayerActions = structuredClone(valid);
overlappingLayerActions[0].animation_steps.push({ ...structuredClone(overlappingLayerActions[0].animation_steps[0]), start_progress: 0.5, end_progress: 0.9 });
assert.match(validateShots(overlappingLayerActions, story), /se solapan sobre la misma capa/);

const brokenSceneTimeline = structuredClone(story);
brokenSceneTimeline[1].time = "0:10 - 0:19";
assert.match(validateShots(valid, brokenSceneTimeline), /línea temporal continua/);

const tooManyShots = structuredClone(valid);
for (let index = 0; index < 4; index++) {
  const extra = structuredClone(tooManyShots[0]);
  extra.start_seconds = index * 0.5;
  extra.end_seconds = index * 0.5 + 0.4;
  tooManyShots.push(extra);
}
assert.match(validateShots(tooManyShots, story), /entre 2 y 5 tomas/);


import { validateAnimationContinuity } from "../api/scene-contract.js";

const continuous = [
  { target_id: "arm", start_progress: 0, end_progress: 0.5, from_state: "rest", to_state: "raised", from_transform: transform(), to_transform: transform({ y: -40 }) },
  { target_id: "arm", start_progress: 0.6, end_progress: 1, from_state: "raised", to_state: "extended", from_transform: transform({ y: -40 }), to_transform: transform({ y: -40, x: 30 }) }
];
assert.equal(validateAnimationContinuity(continuous), null, "A pause between actions must preserve the exact pose and state");
const discontinuous = structuredClone(continuous);
discontinuous[1].from_transform.x = 18;
assert.match(validateAnimationContinuity(discontinuous), /salto entre acciones/);
const stateJump = structuredClone(continuous);
stateJump[1].from_state = "collapsed";
assert.match(validateAnimationContinuity(stateJump), /salto entre acciones/);

console.log("PASS: scene director contract rejects single-layer motion, static animation, incomplete states, overlapping actions, broken scene chronology and excessive per-scene shots.");
