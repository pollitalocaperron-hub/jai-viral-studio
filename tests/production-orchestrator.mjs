import assert from "node:assert/strict";
import { createProductionOrchestrator, PRODUCTION_STAGES } from "../jai-production-orchestrator.js";

const makeStages = (handlers, calls) => PRODUCTION_STAGES.map(name => ({
  name,
  run: async args => { calls[name] = (calls[name] || 0) + 1; return handlers[name] ? handlers[name](args) : { ok: true, output: name + "-output" }; }
}));
const memory = () => {
  let value = null;
  return { load: async () => value && structuredClone(value), save: async next => { value = structuredClone(next); }, get: () => structuredClone(value) };
};
const build = (handlers, calls, store) => createProductionOrchestrator({ stages: makeStages(handlers, calls), loadCheckpoint: store.load, saveCheckpoint: store.save });

// 1. Simulated full flow completes and checkpoints every stage.
{
  const calls = {}, store = memory(), orchestrator = build({}, calls, store);
  const result = await orchestrator.run({ resume: false });
  assert.equal(result.ok, true);
  assert.deepEqual(result.state.completed, PRODUCTION_STAGES);
  assert.equal(result.state.status, "completed");
  assert.equal(Object.values(calls).reduce((a, b) => a + b, 0), PRODUCTION_STAGES.length);
}

// 2. Mid-flow failure preserves completed work and outputs.
{
  const calls = {}, store = memory();
  const result = await build({ narration: () => { throw new Error("fixture network failure"); } }, calls, store).run({ resume: false });
  assert.equal(result.ok, false);
  assert.equal(result.state.status, "failed");
  assert.deepEqual(result.state.completed, ["plan", "director", "visuals", "inspection"]);
  assert.equal(result.state.outputs.visuals, "visuals-output");
  assert.equal(store.get().error.stage, "narration");
}

// 3. Resume starts at the first incomplete stage without rerunning completed work.
{
  const calls = {}, store = memory();
  await build({ narration: () => { throw new Error("temporary"); } }, calls, store).run({ resume: false });
  const resumed = await build({}, calls, store).run({ resume: true });
  assert.equal(resumed.ok, true);
  for (const name of ["plan", "director", "visuals", "inspection"]) assert.equal(calls[name], 1, name + " must not rerun");
  assert.equal(calls.narration, 2);
  assert.equal(resumed.state.status, "completed");
}

// 4. HTTP 429 stops immediately; a later explicit resume makes exactly one new attempt.
{
  const calls = {}, store = memory();
  const limited = await build({ director: () => { throw Object.assign(new Error("rate limit"), { status: 429, retryAfterSeconds: 30 }); } }, calls, store).run({ resume: false });
  assert.equal(limited.state.status, "waiting_retry");
  assert.equal(calls.director, 1);
  assert.equal(calls.visuals || 0, 0);
  const resumed = await build({}, calls, store).run({ resume: true });
  assert.equal(resumed.ok, true);
  assert.equal(calls.plan, 1);
  assert.equal(calls.director, 2);
}

// 5. A simulated visual inspection is never accepted as real QA.
{
  const calls = {}, store = memory();
  const result = await build({ inspection: () => ({ ok: true, inspection_mode: "simulated", output: { pass: true } }) }, calls, store).run({ resume: false });
  assert.equal(result.ok, false);
  assert.equal(result.state.status, "failed");
  assert.deepEqual(result.state.completed, ["plan", "director", "visuals"]);
  assert.equal(result.state.error.code, "SIMULATED_INSPECTION");
  assert.equal(calls.narration || 0, 0);
}

console.log("Production orchestrator contract: 5 scenarios passed.");
