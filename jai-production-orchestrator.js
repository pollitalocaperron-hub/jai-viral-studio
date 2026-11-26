/**
 * J.A.I. production orchestration core.
 * Provider calls are made only by injected stage handlers; this module never
 * selects or retries a provider automatically.
 */
export const PRODUCTION_STAGES = Object.freeze([
  "plan", "director", "visuals", "inspection", "narration", "timeline", "render"
]);

export function createProductionOrchestrator({ stages, loadCheckpoint, saveCheckpoint, now = () => new Date().toISOString() }) {
  if (!Array.isArray(stages) || !stages.length) throw new TypeError("Se requiere una lista de etapas.");
  if (typeof loadCheckpoint !== "function" || typeof saveCheckpoint !== "function") {
    throw new TypeError("Se requieren funciones de lectura y guardado de checkpoints.");
  }
  const names = stages.map(stage => stage.name);
  if (new Set(names).size !== names.length || stages.some(stage => !stage.name || typeof stage.run !== "function")) {
    throw new TypeError("Cada etapa debe tener un nombre único y una función run.");
  }

  let running = false;

  async function persist(state) {
    state.updatedAt = now();
    await saveCheckpoint(structuredClone(state));
  }

  async function run({ context = {}, resume = true } = {}) {
    if (running) throw new Error("Ya existe una producción en ejecución.");
    running = true;
    try {
      let state = resume ? await loadCheckpoint() : null;
      if (!state || state.version !== 1 || !Array.isArray(state.completed)) {
        state = { version: 1, runId: "jai-" + Date.now(), status: "running", currentStage: null, completed: [], outputs: {}, attempts: {}, error: null, updatedAt: now() };
      } else {
        state.status = "running";
        state.error = null;
      }
      await persist(state);

      for (const stage of stages) {
        if (state.completed.includes(stage.name)) continue;
        state.currentStage = stage.name;
        state.attempts[stage.name] = (state.attempts[stage.name] || 0) + 1;
        await persist(state);
        try {
          const result = await stage.run({ context, outputs: structuredClone(state.outputs), checkpoint: structuredClone(state) });
          if (!result || result.ok !== true) throw new Error(result?.error || "La etapa no confirmó un resultado válido.");
          if (stage.name === "inspection" && result.inspection_mode === "simulated") {
            throw Object.assign(new Error("La inspección simulada no acredita calidad visual real."), { code: "SIMULATED_INSPECTION" });
          }
          state.outputs[stage.name] = result.output ?? result;
          state.completed.push(stage.name);
          state.error = null;
          await persist(state);
        } catch (error) {
          const rateLimited = error?.status === 429 || error?.statusCode === 429 || error?.code === 429;
          state.status = rateLimited ? "waiting_retry" : "failed";
          state.error = { stage: stage.name, code: error?.code || (rateLimited ? "HTTP_429" : "STAGE_FAILED"), message: String(error?.message || error), retryAfterSeconds: Number(error?.retryAfterSeconds) || null };
          await persist(state);
          return { ok: false, state: structuredClone(state), error };
        }
      }

      state.currentStage = null;
      state.status = "completed";
      state.error = null;
      await persist(state);
      return { ok: true, state: structuredClone(state) };
    } finally {
      running = false;
    }
  }

  return Object.freeze({ run });
}
