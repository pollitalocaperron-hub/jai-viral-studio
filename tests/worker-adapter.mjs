import assert from "node:assert/strict";
import { AbuseGuard, handleRequest } from "../worker.js";

const ALLOWED_ORIGIN = "https://pollitalocaperron-hub.github.io";
const previousGroqKey = process.env.GROQ_API_KEY;
process.env.GROQ_API_KEY = "mock-only-no-provider-call";
const buckets = new Map();
const namespace = {
  idFromName(name) { return name; },
  get(id) {
    return { async fetch(_url, init) {
      const input = JSON.parse(init.body);
      const key = id + ":" + input.route;
      const now = Date.now(), start = Math.floor(now / input.windowMs) * input.windowMs;
      const current = buckets.get(key);
      const count = current?.start === start ? current.count + 1 : 1;
      buckets.set(key, { start, count });
      const allowed = count <= input.limit;
      return Response.json({ allowed, remaining: Math.max(0, input.limit - count), retryAfterMs: allowed ? 0 : start + input.windowMs - now });
    } };
  }
};
const env = { ALLOWED_ORIGIN, ABUSE_GUARD: namespace };
const headers = { Origin: ALLOWED_ORIGIN, "CF-Connecting-IP": "203.0.113.10", "Content-Type": "application/json" };

const health = await handleRequest(new Request("https://jai-api.example/healthz"), env);
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), { status: "ok", service: "jai-viral-studio-api" });

const preflight = await handleRequest(new Request("https://jai-api.example/api/generate", {
  method: "OPTIONS", headers: { Origin: ALLOWED_ORIGIN, "Access-Control-Request-Method": "POST" }
}), env);
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), ALLOWED_ORIGIN);

const unknown = await handleRequest(new Request("https://jai-api.example/api/not-real"), env);
assert.equal(unknown.status, 404);
assert.equal((await unknown.json()).diagnosticCode, "ROUTE_NOT_FOUND");

const wrongMethod = await handleRequest(new Request("https://jai-api.example/api/generate", { method: "GET", headers }), env);
assert.equal(wrongMethod.status, 405);

const blockedOrigin = await handleRequest(new Request("https://jai-api.example/api/generate", {
  method: "POST", headers: { ...headers, Origin: "https://attacker.example" }, body: "{}"
}), env);
assert.equal(blockedOrigin.status, 403);

const missingGuard = await handleRequest(new Request("https://jai-api.example/api/generate", {
  method: "POST", headers, body: "{}"
}), { ALLOWED_ORIGIN });
assert.equal(missingGuard.status, 503);
assert.equal((await missingGuard.json()).diagnosticCode, "ABUSE_GUARD_UNAVAILABLE");

const invalidJson = await handleRequest(new Request("https://jai-api.example/api/generate", { method: "POST", headers, body: "{" }), env);
assert.equal(invalidJson.status, 400);
assert.equal((await invalidJson.json()).diagnosticCode, "INVALID_JSON");

const largeBody = JSON.stringify({ images: [{ image_base64: "A".repeat(1_400_000) }] });
const tooLarge = await handleRequest(new Request("https://jai-api.example/api/inspect-visual", {
  method: "POST", headers: { ...headers, "Content-Length": String(new TextEncoder().encode(largeBody).length) }, body: largeBody
}), env);
assert.equal(tooLarge.status, 413);
assert.equal((await tooLarge.json()).diagnosticCode, "REQUEST_TOO_LARGE");

const repeated = [];
for (let i = 0; i < 6; i++) {
  repeated.push(await handleRequest(new Request("https://jai-api.example/api/generate", { method: "POST", headers, body: "{}" }), env));
}
assert.equal(repeated.at(-1).status, 429, "The 6-per-10-minute generation limit must be shared across requests.");
assert.equal(repeated.at(-1).headers.get("Retry-After") !== null, true);

const otherIp = { ...headers, "CF-Connecting-IP": "203.0.113.11" };
const isolated = await handleRequest(new Request("https://jai-api.example/api/generate", { method: "POST", headers: otherIp, body: "{}" }), env);
assert.equal(isolated.status, 400, "A separate client IP receives an independent bucket after the shared guard.");

// Exercise the Durable Object SQL adapter itself with a deterministic SQLite contract stub.
const sqlRows = new Map();
const guard = new AbuseGuard({ storage: { sql: { exec(statement, ...args) {
  if (statement.startsWith("CREATE TABLE")) return { toArray: () => [] };
  const [route, windowStart] = args;
  const current = sqlRows.get(route);
  const count = current?.windowStart === windowStart ? current.count + 1 : 1;
  sqlRows.set(route, { windowStart, count });
  return { toArray: () => [{ request_count: count }] };
} } } });
for (let i = 0; i < 6; i++) {
  const result = await (await guard.fetch(new Request("https://abuse-guard.internal/check", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ route: "/api/generate", limit: 6, windowMs: 600000 })
  }))).json();
  assert.equal(result.allowed, true);
}
const denied = await (await guard.fetch(new Request("https://abuse-guard.internal/check", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ route: "/api/generate", limit: 6, windowMs: 600000 })
}))).json();
assert.equal(denied.allowed, false, "The Durable Object SQL counter must reject request seven in the same window.");

if (previousGroqKey === undefined) delete process.env.GROQ_API_KEY;
else process.env.GROQ_API_KEY = previousGroqKey;
console.log("PASS: bounded streaming JSON, Durable Object rate-limit contract, fail-closed guard, CORS, routing and method checks.");
