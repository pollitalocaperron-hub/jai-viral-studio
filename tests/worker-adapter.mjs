import assert from "node:assert/strict";
import { handleRequest } from "../worker.js";

const env = { ALLOWED_ORIGIN: "https://pollitalocaperron-hub.github.io" };

const health = await handleRequest(new Request("https://jai-api.example/healthz"), env);
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), { status: "ok", service: "jai-viral-studio-api" });

const preflight = await handleRequest(new Request("https://jai-api.example/api/generate", {
  method: "OPTIONS",
  headers: { Origin: env.ALLOWED_ORIGIN, "Access-Control-Request-Method": "POST" }
}), env);
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), env.ALLOWED_ORIGIN);

const unknown = await handleRequest(new Request("https://jai-api.example/api/not-real"), env);
assert.equal(unknown.status, 404);
assert.equal((await unknown.json()).diagnosticCode, "ROUTE_NOT_FOUND");

const wrongMethod = await handleRequest(new Request("https://jai-api.example/api/generate", {
  method: "GET",
  headers: { Origin: env.ALLOWED_ORIGIN }
}), env);
assert.equal(wrongMethod.status, 405);

const invalidJson = await handleRequest(new Request("https://jai-api.example/api/generate", {
  method: "POST",
  headers: { Origin: env.ALLOWED_ORIGIN, "Content-Type": "application/json" },
  body: "{"
}), env);
assert.equal(invalidJson.status, 400);
assert.equal((await invalidJson.json()).diagnosticCode, "INVALID_JSON");

const oversized = await handleRequest(new Request("https://jai-api.example/api/generate", {
  method: "POST",
  headers: { Origin: env.ALLOWED_ORIGIN, "Content-Type": "application/json", "Content-Length": String(5 * 1024 * 1024) },
  body: "{}"
}), env);
assert.equal(oversized.status, 413);

console.log("PASS: Cloudflare adapter health, routing, CORS preflight, method rejection, JSON validation and body-size guard.");
