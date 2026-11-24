import generateHandler from "./api/generate.js";
import narrateHandler from "./api/narrate.js";
import directScenesHandler from "./api/direct-scenes.js";

const ROUTES = new Map([
  ["/api/generate", { handler: generateHandler, limit: 6, globalLimit: 60 }],
  ["/api/generate.js", { handler: generateHandler, limit: 6, globalLimit: 60 }],
  ["/api/narrate", { handler: narrateHandler, limit: 8, globalLimit: 60 }],
  ["/api/narrate.js", { handler: narrateHandler, limit: 8, globalLimit: 60 }],
  ["/api/inspect-visual", { proxy: "netlify", limit: 20, globalLimit: 120, globalMonthlyLimit: 600 }],
  ["/api/inspect-visual.js", { proxy: "netlify", limit: 20, globalLimit: 120, globalMonthlyLimit: 600 }],
  ["/api/direct-scenes", { handler: directScenesHandler, limit: 8, globalLimit: 60 }],
  ["/api/direct-scenes.js", { handler: directScenesHandler, limit: 8, globalLimit: 60 }]
]);

const GENERAL_BODY_BYTES = 2 * 1024 * 1024;
const INSPECTION_BODY_BYTES = 1280 * 1024;
const RATE_WINDOW_MS = 10 * 60 * 1000;

function corsHeaders(request, env) {
  const headers = new Headers({ "Vary": "Origin" });
  const origin = request.headers.get("Origin") || "";
  const allowed = env.ALLOWED_ORIGIN || "https://pollitalocaperron-hub.github.io";
  if (origin && origin === allowed) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Access-Control-Max-Age", "600");
  }
  return headers;
}

function jsonError(request, env, status, message, diagnosticCode, extra = {}) {
  const headers = corsHeaders(request, env);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify({ error: message, ...(diagnosticCode ? { diagnosticCode } : {}), ...extra }), { status, headers });
}

async function readBoundedJson(request, maxBytes) {
  if (!request.body) return {};
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0, raw = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("request body limit exceeded").catch(() => {});
        const error = new Error("REQUEST_TOO_LARGE");
        error.code = "REQUEST_TOO_LARGE";
        throw error;
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch {
    const error = new Error("INVALID_JSON");
    error.code = "INVALID_JSON";
    throw error;
  }
}

function createVercelResponse() {
  let statusCode = 200;
  const responseHeaders = new Headers();
  let response = null;
  const res = {
    get statusCode() { return statusCode; },
    set statusCode(value) { statusCode = Number(value) || 200; },
    status(value) { statusCode = Number(value) || 200; return res; },
    setHeader(name, value) { responseHeaders.set(name, String(value)); return res; },
    json(value) {
      if (!responseHeaders.has("Content-Type")) responseHeaders.set("Content-Type", "application/json; charset=utf-8");
      response = new Response(JSON.stringify(value), { status: statusCode, headers: responseHeaders });
      return response;
    },
    end(value) {
      response = new Response(value == null ? null : String(value), { status: statusCode, headers: responseHeaders });
      return response;
    },
    get response() { return response; }
  };
  return res;
}

async function enforceSharedLimit(request, env, route, limit, globalLimit, globalMonthlyLimit = 0) {
  const clientIp = request.headers.get("CF-Connecting-IP");
  if (!clientIp || !env.ABUSE_GUARD) {
    return jsonError(request, env, 503, "La protección compartida del backend no está disponible; la solicitud se rechazó de forma segura.", "ABUSE_GUARD_UNAVAILABLE");
  }
  try {
    const id = env.ABUSE_GUARD.idFromName(route);
    const stub = env.ABUSE_GUARD.get(id);
    const result = await stub.fetch("https://abuse-guard.internal/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ route, clientIp, limit, windowMs: RATE_WINDOW_MS, globalLimitPerMinute: globalLimit, globalLimitPerMonth: globalMonthlyLimit })
    });
    if (!result.ok) throw new Error("rate limiter returned " + result.status);
    const decision = await result.json();
    if (!decision.allowed) {
      const headers = corsHeaders(request, env);
      headers.set("Content-Type", "application/json; charset=utf-8");
      headers.set("Retry-After", String(Math.max(1, Math.ceil(decision.retryAfterMs / 1000))));
      const message = decision.scope === "monthly"
        ? "Se alcanzó el límite mensual de inspecciones configurado para proteger el plan gratuito. Se restablecerá al iniciar el próximo mes."
        : "Se alcanzó el límite temporal de solicitudes para esta operación. Espera y vuelve a intentarlo.";
      return new Response(JSON.stringify({ error: message, diagnosticCode: decision.scope === "monthly" ? "MONTHLY_INSPECTION_LIMIT" : "RATE_LIMITED", scope: decision.scope, retryAfterMs: decision.retryAfterMs }), { status: 429, headers });
    }
    return null;
  } catch (error) {
    console.error("[JAI][Abuse guard] unavailable:", error?.message || "unknown");
    return jsonError(request, env, 503, "No se pudo verificar el límite compartido; la solicitud se rechazó de forma segura.", "ABUSE_GUARD_UNAVAILABLE");
  }
}

async function proxyNetlifyInspection(request, env, maxBytes) {
  const target = String(env.NETLIFY_INSPECT_URL || "");
  const secret = String(env.NETLIFY_INSPECT_SECRET || "");
  if (!target || secret.length < 32) {
    return jsonError(request, env, 503, "El servicio privado de inspección no está configurado; la solicitud se rechazó de forma segura.", "INSPECTOR_PROXY_UNAVAILABLE");
  }
  let targetUrl;
  try {
    targetUrl = new URL(target);
    if (targetUrl.protocol !== "https:" || targetUrl.username || targetUrl.password) throw new Error("invalid upstream");
  } catch {
    return jsonError(request, env, 503, "La dirección privada del inspector no es válida.", "INSPECTOR_PROXY_UNAVAILABLE");
  }
  let total = 0, exceededLimit = false;
  const boundedBody = request.body ? request.body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      total += chunk.byteLength;
      if (total > maxBytes) {
        exceededLimit = true;
        controller.error(new Error("JAI_INSPECTION_BODY_LIMIT"));
        return;
      }
      controller.enqueue(chunk);
    }
  })) : undefined;
  try {
    const upstream = await fetch(targetUrl.toString(), {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": request.headers.get("Content-Type") || "application/json",
        "x-jai-proxy-secret": secret
      },
      body: boundedBody
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      return jsonError(request, env, 502, "El servicio privado de inspección respondió con una redirección no permitida.", "INSPECTOR_PROXY_REDIRECT");
    }
    const headers = corsHeaders(request, env);
    const contentType = upstream.headers.get("Content-Type");
    const retryAfter = upstream.headers.get("Retry-After");
    if (contentType) headers.set("Content-Type", contentType);
    if (retryAfter) headers.set("Retry-After", retryAfter);
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    if (exceededLimit) return jsonError(request, env, 413, "La auditoría supera el límite seguro de tamaño.", "REQUEST_TOO_LARGE");
    console.error("[JAI][Inspector proxy] upstream unavailable:", error?.name || "Error");
    return jsonError(request, env, 502, "No se pudo conectar con el inspector privado.", "INSPECTOR_PROXY_FAILED");
  }
}

export async function handleRequest(request, env = {}) {
  const url = new URL(request.url);
  if (url.pathname === "/healthz" && request.method === "GET") {
    return Response.json({ status: "ok", service: "jai-viral-studio-api" }, { headers: corsHeaders(request, env) });
  }

  const route = ROUTES.get(url.pathname);
  if (!route) return jsonError(request, env, 404, "Ruta no encontrada.", "ROUTE_NOT_FOUND");

  const origin = request.headers.get("Origin") || "";
  const allowedOrigin = env.ALLOWED_ORIGIN || "https://pollitalocaperron-hub.github.io";
  if (origin && origin !== allowedOrigin) return jsonError(request, env, 403, "Origen no autorizado.", "ORIGIN_NOT_ALLOWED");
  if (request.method === "OPTIONS") {
    const headers = corsHeaders(request, env);
    headers.set("Content-Length", "0");
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "POST") {
    const response = jsonError(request, env, 405, "Método no permitido.", "METHOD_NOT_ALLOWED");
    response.headers.set("Allow", "POST, OPTIONS");
    return response;
  }

  // Reject abusive traffic before buffering or parsing user-controlled bodies.
  const blocked = await enforceSharedLimit(request, env, url.pathname.replace(/\.js$/, ""), route.limit, route.globalLimit, route.globalMonthlyLimit || 0);
  if (blocked) return blocked;

  const maxBytes = url.pathname.includes("inspect-visual") ? INSPECTION_BODY_BYTES : GENERAL_BODY_BYTES;
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > maxBytes) return jsonError(request, env, 413, "La solicitud supera el límite seguro de tamaño.", "REQUEST_TOO_LARGE");
  if (route.proxy === "netlify") return proxyNetlifyInspection(request, env, maxBytes);

  let body;
  try { body = await readBoundedJson(request, maxBytes); }
  catch (error) {
    if (error?.code === "REQUEST_TOO_LARGE") return jsonError(request, env, 413, "La solicitud supera el límite seguro de tamaño.", "REQUEST_TOO_LARGE");
    return jsonError(request, env, 400, "El cuerpo debe ser JSON válido.", "INVALID_JSON");
  }

  if (typeof process === "undefined" || !process.env) {
    return jsonError(request, env, 500, "El runtime no habilitó la compatibilidad Node.js.", "NODE_COMPAT_REQUIRED");
  }
  // nodejs_compat_populate_process_env exposes encrypted Worker secrets to the legacy handlers.
  // Do not mutate process.env per request: it is isolate-global and must remain deployment-scoped.

  const req = { method: request.method, headers: Object.fromEntries(request.headers.entries()), body };
  const res = createVercelResponse();
  try {
    await route.handler(req, res);
    return res.response || new Response(null, { status: res.statusCode });
  } catch (error) {
    console.error("[JAI][Worker adapter]", error?.name || "Error", error?.message || "Unhandled API error");
    return jsonError(request, env, 500, "Error interno del backend. No se expusieron detalles sensibles.", "WORKER_ADAPTER_ERROR");
  }
}

/**
 * One SQLite-backed Durable Object per API route shares counters across all
 * client IPs, Worker isolates and edge locations. Client IPs are hashed before
 * storage; the raw IP is never persisted.
 */
export class AbuseGuard {
  constructor(ctx) {
    this.ctx = ctx;
    this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS rate_windows (bucket TEXT PRIMARY KEY, window_start INTEGER NOT NULL, request_count INTEGER NOT NULL)");
  }

  async fetch(request) {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/check") {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    let input;
    try { input = await request.json(); } catch { return Response.json({ error: "invalid request" }, { status: 400 }); }
    const route = String(input?.route || "");
    const clientIp = String(input?.clientIp || "");
    const limit = Number(input?.limit);
    const windowMs = Number(input?.windowMs);
    const globalLimit = Number(input?.globalLimitPerMinute);
    const monthlyLimit = Number(input?.globalLimitPerMonth || 0);
    if (!["/api/generate", "/api/narrate", "/api/inspect-visual", "/api/direct-scenes"].includes(route) ||
        !clientIp || clientIp.length > 80 ||
        !Number.isInteger(limit) || limit < 1 || limit > 30 ||
        !Number.isInteger(windowMs) || windowMs < 60000 || windowMs > 3600000 ||
        !Number.isInteger(globalLimit) || globalLimit < 1 || globalLimit > 300 ||
        !Number.isInteger(monthlyLimit) || monthlyLimit < 0 || monthlyLimit > 10000) {
      return Response.json({ error: "invalid limiter policy" }, { status: 400 });
    }
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(clientIp));
    const clientHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    const now = Date.now();
    const clientWindowStart = Math.floor(now / windowMs) * windowMs;
    const globalWindowStart = Math.floor(now / 60000) * 60000;
    const increment = (bucket, windowStart) => this.sql.exec(
      "INSERT INTO rate_windows (bucket, window_start, request_count) VALUES (?, ?, 1) " +
      "ON CONFLICT(bucket) DO UPDATE SET " +
      "request_count = CASE WHEN rate_windows.window_start = excluded.window_start THEN rate_windows.request_count + 1 ELSE 1 END, " +
      "window_start = excluded.window_start RETURNING request_count",
      bucket, windowStart
    ).toArray();
    const clientCount = Number(increment(route + ":ip:" + clientHash, clientWindowStart)[0]?.request_count || 0);
    if (clientCount > limit) {
      return Response.json({ allowed: false, scope: "client", retryAfterMs: Math.max(0, clientWindowStart + windowMs - now), remaining: 0 });
    }
    const globalCount = Number(increment(route + ":global", globalWindowStart)[0]?.request_count || 0);
    // Bound SQLite growth from rotating client hashes and old fixed windows.
    // Keep the current and previous monthly buckets for reset/diagnostics.
    if (globalCount % 100 === 0) {
      this.sql.exec("DELETE FROM rate_windows WHERE window_start < ?", now - 62 * 24 * 60 * 60 * 1000);
    }
    if (globalCount > globalLimit) {
      return Response.json({ allowed: false, scope: "global", retryAfterMs: Math.max(0, globalWindowStart + 60000 - now), remaining: 0 });
    }
    let monthlyCount = 0, monthlyRetryAfterMs = 0;
    if (monthlyLimit > 0) {
      const date = new Date(now);
      const monthStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
      monthlyCount = Number(increment(route + ":month", monthStart)[0]?.request_count || 0);
      monthlyRetryAfterMs = Math.max(0, Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) - now);
      if (monthlyCount > monthlyLimit) {
        return Response.json({ allowed: false, scope: "monthly", retryAfterMs: monthlyRetryAfterMs, remaining: 0 });
      }
    }
    return Response.json({ allowed: true, scope: "ok", retryAfterMs: 0, remaining: Math.min(limit - clientCount, globalLimit - globalCount, monthlyLimit > 0 ? monthlyLimit - monthlyCount : Infinity) });
  }
}

export default { fetch: handleRequest };
