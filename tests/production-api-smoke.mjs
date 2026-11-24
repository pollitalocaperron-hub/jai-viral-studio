import assert from "node:assert/strict";

const base = process.env.JAI_PRODUCTION_API || "https://jai-viral-studio.vercel.app";
const origin = "https://pollitalocaperron-hub.github.io";
const routes = ["/api/generate", "/api/direct-scenes", "/api/inspect-visual", "/api/narrate"];

async function request(path, options = {}) {
  const response = await fetch(new URL(path, base), {
    ...options,
    signal: AbortSignal.timeout(15000)
  });
  return response;
}

const home = await fetch("https://pollitalocaperron-hub.github.io/jai-viral-studio/", {
  signal: AbortSignal.timeout(15000)
});
assert.equal(home.status, 200, "GitHub Pages production site must be reachable");
const html = await home.text();
assert.match(html, /J\.A\.I|JAI|Viral Studio/i, "GitHub Pages must serve the J.A.I. app");
console.log("PASS: GitHub Pages production site responds with HTTP 200");

for (const path of routes) {
  const preflight = await request(path, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type"
    }
  });
  assert.equal(preflight.status, 204, path + " must accept the GitHub Pages CORS preflight");
  assert.equal(preflight.headers.get("access-control-allow-origin"), origin, path + " must allow only the published Pages origin");
  assert.match(preflight.headers.get("access-control-allow-methods") || "", /POST/);
  console.log("PASS: production CORS preflight", path);

  const methodCheck = await request(path, { method: "GET", headers: { Origin: origin } });
  assert.equal(methodCheck.status, 405, path + " must be deployed and reject GET with 405");
  assert.match(methodCheck.headers.get("allow") || "", /POST/);
  assert.equal(methodCheck.headers.get("access-control-allow-origin"), origin);
  console.log("PASS: production API route deployed", path);
}

// Empty payloads stop at local input validation; these probes never call an AI provider.
const generationProbe = await request("/api/generate", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: "{}"
});
assert.ok([400, 500].includes(generationProbe.status), "Generate must reach its validation/provider-config guard");
const generationBody = await generationProbe.json();
if (generationProbe.status === 400) {
  console.log("PASS: text-generation provider configuration is present (empty input rejected before provider call)");
} else {
  assert.equal(generationBody.diagnosticCode, "NO_AI_PROVIDER");
  throw new Error("Production is missing GROQ_API_KEY and GEMINI_API_KEY; topic-to-script generation cannot work.");
}

const visualProbe = await request("/api/inspect-visual", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: "{}"
});
assert.ok([400, 503].includes(visualProbe.status), "Visual inspector must reach its key/input guard");
if (visualProbe.status === 400) {
  console.log("PASS: visual-inspection Gemini key is configured (empty images rejected before provider call)");
} else {
  const body = await visualProbe.json();
  assert.equal(body.error, "El inspector necesita GEMINI_API_KEY; no se configuró ningún proveedor adicional.");
  throw new Error("Production is missing GEMINI_API_KEY; visual QA and Gemini narration cannot work.");
}

console.log("PASS: production API smoke checks completed without consuming AI-provider quota.");
