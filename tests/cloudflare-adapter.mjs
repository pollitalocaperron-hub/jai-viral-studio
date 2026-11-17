import assert from "node:assert/strict";
import worker from "../cloudflare/worker.js";

const env = {
  GROQ_API_KEY: "test-only-not-a-real-key",
  GEMINI_API_KEY: "test-only-not-a-real-key"
};

const call = (path, init = {}) => worker.fetch(new Request("https://jai-test.example" + path, init), env);

const preflight = await call("/api/generate", {
  method: "OPTIONS",
  headers: { Origin: "https://pollitalocaperron-hub.github.io" }
});
assert.equal(preflight.status, 204, "CORS preflight must complete without provider calls");
assert.equal(preflight.headers.get("access-control-allow-origin"), "https://pollitalocaperron-hub.github.io");

const trailingSlash = await call("/api/generate/", {
  method: "OPTIONS",
  headers: { Origin: "https://pollitalocaperron-hub.github.io" }
});
assert.equal(trailingSlash.status, 204, "trailing slashes must resolve to the same API route");

const blockedOrigin = await call("/api/generate", {
  method: "POST",
  headers: {
    Origin: "https://untrusted.example",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ topic: "Prueba" })
});
assert.equal(blockedOrigin.status, 403, "untrusted origins must be rejected");

const invalidJson = await call("/api/generate", {
  method: "POST",
  headers: {
    Origin: "https://pollitalocaperron-hub.github.io",
    "Content-Type": "application/json"
  },
  body: "{"
});
assert.equal(invalidJson.status, 400, "malformed JSON must be rejected at the edge");

const invalidTopic = await call("/api/generate", {
  method: "POST",
  headers: {
    Origin: "https://pollitalocaperron-hub.github.io",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ topic: "" })
});
assert.equal(invalidTopic.status, 400, "the existing API contract must survive the adapter");

const wrongMethod = await call("/api/generate", { method: "GET" });
assert.equal(wrongMethod.status, 405, "unsupported methods must preserve the API contract");

const oversized = await call("/api/generate", {
  method: "POST",
  headers: {
    Origin: "https://pollitalocaperron-hub.github.io",
    "Content-Type": "application/json",
    "Content-Length": String(11 * 1024 * 1024)
  },
  body: "{}"
});
assert.equal(oversized.status, 413, "oversized requests must be rejected before JSON parsing");

const unknownRoute = await call("/api/not-real");
assert.equal(unknownRoute.status, 404, "unknown routes must not fall through");

console.log("PASS: Cloudflare adapter routing, CORS, preflight, JSON validation, and API contract smoke tests.");
