import assert from "node:assert/strict";
import { AbuseGuard, handleRequest } from "../worker.js";

const ALLOWED_ORIGIN = "https://pollitalocaperron-hub.github.io";
const previousGroqKey = process.env.GROQ_API_KEY;
process.env.GROQ_API_KEY = "mock-only-no-provider-call";
const buckets = new Map();
const limiterPolicies = new Map();
const namespace = {
  idFromName(name) { return name; },
  get(id) {
    return { async fetch(_url, init) {
      const input = JSON.parse(init.body);
      const now = Date.now(), clientStart = Math.floor(now / input.windowMs) * input.windowMs, globalStart = Math.floor(now / 60000) * 60000;
      const clientKey = id + ":" + input.route + ":ip:" + input.clientIp;
      const globalKey = id + ":" + input.route + ":global";
      const clientCurrent = buckets.get(clientKey), clientCount = clientCurrent?.start === clientStart ? clientCurrent.count + 1 : 1;
      buckets.set(clientKey, { start: clientStart, count: clientCount });
      if (clientCount > input.limit) return Response.json({ allowed: false, scope: "client", remaining: 0, retryAfterMs: clientStart + input.windowMs - now });
      const globalCurrent = buckets.get(globalKey), globalCount = globalCurrent?.start === globalStart ? globalCurrent.count + 1 : 1;
      buckets.set(globalKey, { start: globalStart, count: globalCount });
      let monthlyCount = 0;
      if (input.globalLimitPerMonth > 0) {
        const date = new Date(now), monthStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
        const monthKey = id + ":" + input.route + ":month", monthCurrent = buckets.get(monthKey);
        monthlyCount = monthCurrent?.start === monthStart ? monthCurrent.count + 1 : 1;
        buckets.set(monthKey, { start: monthStart, count: monthlyCount });
      }
      limiterPolicies.set(input.route, input.globalLimitPerMonth || 0);
      if (input.globalLimitPerMonth > 0 && monthlyCount > input.globalLimitPerMonth) return Response.json({ allowed: false, scope: "monthly", remaining: 0, retryAfterMs: 0 });
      const allowed = globalCount <= input.globalLimitPerMinute;
      return Response.json({ allowed, scope: allowed ? "ok" : "global", remaining: Math.max(0, Math.min(input.limit - clientCount, input.globalLimitPerMinute - globalCount)), retryAfterMs: allowed ? 0 : globalStart + 60000 - now });
    } };
  }
};
const env = { ALLOWED_ORIGIN, ABUSE_GUARD: namespace, NETLIFY_INSPECT_URL: "https://jai-private-inspector.netlify.app/internal/jai/inspect-visual", NETLIFY_INSPECT_SECRET: "test-only-secret-with-more-than-32-characters" };
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

const streamedLargeBody = JSON.stringify({ images: [{ image_base64: "B".repeat(1_400_000) }] });
const savedFetchForStreamLimit = globalThis.fetch;
globalThis.fetch = async (_url, init) => { await new Response(init.body).arrayBuffer(); return Response.json({}); };
const streamedTooLarge = await handleRequest(new Request("https://jai-api.example/api/inspect-visual", {
  method: "POST", headers, body: streamedLargeBody
}), env);
globalThis.fetch = savedFetchForStreamLimit;
assert.equal(streamedTooLarge.status, 413, "The streaming byte counter must reject oversized bodies even without Content-Length.");

const missingClientIp = await handleRequest(new Request("https://jai-api.example/api/generate", {
  method: "POST", headers: { Origin: ALLOWED_ORIGIN, "Content-Type": "application/json" }, body: "{}"
}), env);
assert.equal(missingClientIp.status, 503, "Requests without Cloudflare's trusted client IP must fail closed.");


const originalFetch = globalThis.fetch;
let proxyCapture = null;
globalThis.fetch = async (url, init) => {
  assert.equal(String(url), env.NETLIFY_INSPECT_URL);
  proxyCapture = { secret: init.headers["x-jai-proxy-secret"], body: await new Response(init.body).text() };
  return Response.json({ results: [{ scene_index: 0, status: "pass", score: 92, reason: "La composición coincide con el perfil visual y la acción se entiende.", issues: [] }] });
};
const proxyResponse = await handleRequest(new Request("https://jai-api.example/api/inspect-visual", {
  method: "POST", headers, body: JSON.stringify({ style_profile_id: "paper-craft-explainer", images: [{ image_base64: "AQID" }] })
}), env);
assert.equal(proxyResponse.status, 200);
assert.equal(proxyCapture.secret, env.NETLIFY_INSPECT_SECRET);
assert.equal(limiterPolicies.get("/api/inspect-visual"), 600);
assert.equal(JSON.parse(proxyCapture.body).style_profile_id, "paper-craft-explainer");
globalThis.fetch = originalFetch;

const noProxy = await handleRequest(new Request("https://jai-api.example/api/inspect-visual", {
  method: "POST", headers: { ...headers, "CF-Connecting-IP": "203.0.113.88" }, body: "{}"
}), { ALLOWED_ORIGIN, ABUSE_GUARD: namespace });
assert.equal(noProxy.status, 503);
assert.equal((await noProxy.json()).diagnosticCode, "INSPECTOR_PROXY_UNAVAILABLE");

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
    body: JSON.stringify({ route: "/api/generate", clientIp: "203.0.113.20", limit: 6, windowMs: 600000, globalLimitPerMinute: 7 })
  }))).json();
  assert.equal(result.allowed, true);
}
const denied = await (await guard.fetch(new Request("https://abuse-guard.internal/check", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ route: "/api/generate", clientIp: "203.0.113.20", limit: 6, windowMs: 600000, globalLimitPerMinute: 7 })
}))).json();
assert.equal(denied.allowed, false, "The Durable Object SQL counter must reject request seven in the same client window.");
const secondIpFirst = await (await guard.fetch(new Request("https://abuse-guard.internal/check", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ route: "/api/generate", clientIp: "203.0.113.21", limit: 6, windowMs: 600000, globalLimitPerMinute: 7 })
}))).json();
assert.equal(secondIpFirst.allowed, true, "A second client may use the remaining shared route capacity.");
const secondIpOverGlobal = await (await guard.fetch(new Request("https://abuse-guard.internal/check", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ route: "/api/generate", clientIp: "203.0.113.21", limit: 6, windowMs: 600000, globalLimitPerMinute: 7 })
}))).json();
assert.equal(secondIpOverGlobal.allowed, false);
assert.equal(secondIpOverGlobal.scope, "global", "The shared route-wide ceiling must apply across different client IPs.");
const monthlyCalls = [];
for (const ip of ["203.0.113.31", "203.0.113.32", "203.0.113.33"]) {
  monthlyCalls.push(await (await guard.fetch(new Request("https://abuse-guard.internal/check", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ route: "/api/inspect-visual", clientIp: ip, limit: 20, windowMs: 600000, globalLimitPerMinute: 120, globalLimitPerMonth: 2 })
  }))).json());
}
assert.equal(monthlyCalls[0].allowed, true);
assert.equal(monthlyCalls[1].allowed, true);
assert.equal(monthlyCalls[2].allowed, false);
assert.equal(monthlyCalls[2].scope, "monthly", "The inspection budget must be shared across all client IPs for the month.");

if (previousGroqKey === undefined) delete process.env.GROQ_API_KEY;
else process.env.GROQ_API_KEY = previousGroqKey;
console.log("PASS: bounded streaming JSON, Durable Object rate-limit contract, fail-closed guard, CORS, routing and method checks.");
