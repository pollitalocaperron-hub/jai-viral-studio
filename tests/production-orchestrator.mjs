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
const build = (handlers, calls, store, options = {}) => createProductionOrchestrator({ stages: makeStages(handlers, calls), loadCheckpoint: store.load, saveCheckpoint: store.save, ...options });

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
  let clock = 1000;
  const options = { nowMs: () => clock };
  const limited = await build({ director: () => { throw Object.assign(new Error("rate limit"), { status: 429, retryAfterSeconds: 30 }); } }, calls, store, options).run({ resume: false });
  assert.equal(limited.state.status, "waiting_retry");
  assert.equal(calls.director, 1);
  assert.equal(calls.visuals || 0, 0);
  const tooEarly = await build({}, calls, store, options).run({ resume: true });
  assert.equal(tooEarly.state.status, "waiting_retry");
  assert.match(tooEarly.error.message, /No se realizó ninguna llamada/);
  assert.equal(calls.director, 1, "Resume before Retry-After must not repeat the provider call");
  clock += 30000;
  const resumed = await build({}, calls, store, options).run({ resume: true });
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

// 6. A different requested topic must not inherit another project's completed stages.
{
  const calls = {}, store = memory(), orchestrator = build({}, calls, store);
  const first = await orchestrator.run({ resume: false, context: { topic: "Tema A" } });
  assert.equal(first.ok, true);
  const second = await orchestrator.run({ resume: true, context: { topic: "Tema B" } });
  assert.equal(second.ok, true);
  assert.notEqual(second.state.runId, first.state.runId);
  for (const name of PRODUCTION_STAGES) assert.equal(calls[name], 2, name + " must run for the new topic");
  assert.equal(second.state.context.topic, "Tema B");
}



// 7. Concurrent start requests cannot launch a second production run.
{
  const calls = {}, store = memory();
  let releaseFirst;
  const firstStage = new Promise(resolve => { releaseFirst = resolve; });
  const handlers = { plan: async () => { await firstStage; return { ok: true, output: "plan-output" }; } };
  const orchestrator = build(handlers, calls, store);
  const firstRun = orchestrator.run({ resume: false });
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(
    () => orchestrator.run({ resume: true }),
    /Ya existe una producción en ejecución/
  );
  assert.equal(calls.plan, 1, "Concurrent request must not invoke the first stage twice");
  releaseFirst();
  const completed = await firstRun;
  assert.equal(completed.ok, true);
  assert.equal(completed.state.status, "completed");
}

console.log("Production orchestrator contract: 7 scenarios passed.");
