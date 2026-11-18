import assert from "node:assert/strict";
import inspectVisualFunction from "../netlify/functions/inspect-visual.mjs";

const previousSecret = process.env.JAI_INTERNAL_PROXY_SECRET;
const previousGemini = process.env.GEMINI_API_KEY;
process.env.JAI_INTERNAL_PROXY_SECRET = "test-only-secret-with-more-than-32-characters";
process.env.GEMINI_API_KEY = "mock-gemini-key-no-network";
const secret = process.env.JAI_INTERNAL_PROXY_SECRET;
const url = "https://netlify.test/internal/jai/inspect-visual";
const originalFetch = globalThis.fetch;
let providerCalls = 0;
globalThis.fetch = async (providerUrl, init) => {
  providerCalls++;
  assert.match(String(providerUrl), /generativelanguage\.googleapis\.com/);
  assert.equal(init.headers["x-goog-api-key"], "mock-gemini-key-no-network");
  return Response.json({
    candidates: [{
      content: { parts: [{ text: JSON.stringify({ results: [{
        scene_index: 0, status: "pass", score: 92,
        reason: "La composición respeta el perfil y la acción se entiende claramente.",
        issues: []
      }] }) }] }
    }]
  });
};

const unauthorized = await inspectVisualFunction(new Request(url, {
  method: "POST", headers: { "x-jai-proxy-secret": "wrong-secret" }, body: "{}"
}));
assert.equal(unauthorized.status, 403);
assert.equal(providerCalls, 0);

const wrongContentType = await inspectVisualFunction(new Request(url, {
  method: "POST", headers: { "x-jai-proxy-secret": secret, "Content-Type": "text/plain" }, body: "{}"
}));
assert.equal(wrongContentType.status, 415);
assert.equal(providerCalls, 0);

const invalidJson = await inspectVisualFunction(new Request(url, {
  method: "POST", headers: { "x-jai-proxy-secret": secret, "Content-Type": "application/json" }, body: "{"
}));
assert.equal(invalidJson.status, 400);
assert.equal(providerCalls, 0);

const oversizedBody = JSON.stringify({ images: [{ image_base64: "A".repeat(1_400_000) }] });
const oversized = await inspectVisualFunction(new Request(url, {
  method: "POST", headers: { "x-jai-proxy-secret": secret, "Content-Type": "application/json" }, body: oversizedBody
}));
assert.equal(oversized.status, 413);
assert.equal(providerCalls, 0);

const valid = await inspectVisualFunction(new Request(url, {
  method: "POST",
  headers: { "x-jai-proxy-secret": secret, "Content-Type": "application/json" },
  body: JSON.stringify({
    topic: "Prueba de inspección protegida",
    style_profile_id: "paper-craft-explainer",
    images: [{ scene_index: 0, image_base64: "AQID", subject: "Objeto de prueba", state: "Visible", action: "Se transforma", proof: "El resultado se entiende" }]
  })
}));
assert.equal(valid.status, 200);
const payload = await valid.json();
assert.equal(payload.results[0].status, "pass");
assert.equal(payload.style_profile_id, "paper-craft-explainer");
assert.equal(providerCalls, 1);

globalThis.fetch = originalFetch;
if (previousSecret === undefined) delete process.env.JAI_INTERNAL_PROXY_SECRET;
else process.env.JAI_INTERNAL_PROXY_SECRET = previousSecret;
if (previousGemini === undefined) delete process.env.GEMINI_API_KEY;
else process.env.GEMINI_API_KEY = previousGemini;
console.log("PASS: private Netlify inspector authentication, bounded payload, and mocked Gemini integration.");
