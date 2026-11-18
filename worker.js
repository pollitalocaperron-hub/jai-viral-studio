import generateHandler from "./api/generate.js";
import narrateHandler from "./api/narrate.js";
import inspectVisualHandler from "./api/inspect-visual.js";
import directScenesHandler from "./api/direct-scenes.js";

const ROUTES = new Map([
  ["/api/generate", generateHandler],
  ["/api/generate.js", generateHandler],
  ["/api/narrate", narrateHandler],
  ["/api/narrate.js", narrateHandler],
  ["/api/inspect-visual", inspectVisualHandler],
  ["/api/inspect-visual.js", inspectVisualHandler],
  ["/api/direct-scenes", directScenesHandler],
  ["/api/direct-scenes.js", directScenesHandler]
]);

const MAX_JSON_BODY_BYTES = 4 * 1024 * 1024;

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

function jsonError(request, env, status, message, diagnosticCode) {
  const headers = corsHeaders(request, env);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify({ error: message, ...(diagnosticCode ? { diagnosticCode } : {}) }), { status, headers });
}

function createVercelResponse() {
  let statusCode = 200;
  let responseHeaders = new Headers();
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

export async function handleRequest(request, env = {}) {
  const url = new URL(request.url);
  if (url.pathname === "/healthz" && request.method === "GET") {
    return Response.json({ status: "ok", service: "jai-viral-studio-api" }, { headers: corsHeaders(request, env) });
  }

  const handler = ROUTES.get(url.pathname);
  if (!handler) return jsonError(request, env, 404, "Ruta no encontrada.", "ROUTE_NOT_FOUND");

  // These secrets are deployment-wide constants, not request-specific data.
  // Node.js compatibility is enabled by wrangler.jsonc for existing Vercel handlers.
  if (typeof process === "undefined" || !process.env) {
    return jsonError(request, env, 500, "El runtime no habilitó la compatibilidad Node.js.", "NODE_COMPAT_REQUIRED");
  }
  for (const key of ["GROQ_API_KEY", "GEMINI_API_KEY"]) {
    if (typeof env[key] === "string" && env[key]) process.env[key] = env[key];
    else delete process.env[key];
  }

  let body;
  if (request.method !== "OPTIONS" && request.method !== "GET" && request.method !== "HEAD") {
    const declaredLength = Number(request.headers.get("Content-Length") || 0);
    if (declaredLength > MAX_JSON_BODY_BYTES) {
      return jsonError(request, env, 413, "La solicitud supera el límite seguro de 4 MiB.", "REQUEST_TOO_LARGE");
    }
    let raw;
    try { raw = await request.text(); }
    catch { return jsonError(request, env, 400, "No se pudo leer el cuerpo de la solicitud.", "INVALID_REQUEST_BODY"); }
    if (new TextEncoder().encode(raw).byteLength > MAX_JSON_BODY_BYTES) {
      return jsonError(request, env, 413, "La solicitud supera el límite seguro de 4 MiB.", "REQUEST_TOO_LARGE");
    }
    try { body = raw ? JSON.parse(raw) : {}; }
    catch { return jsonError(request, env, 400, "El cuerpo debe ser JSON válido.", "INVALID_JSON"); }
  }

  const req = {
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    body
  };
  const res = createVercelResponse();

  try {
    await handler(req, res);
    return res.response || new Response(null, { status: res.statusCode });
  } catch (error) {
    console.error("[JAI][Worker adapter]", error?.name || "Error", error?.message || "Unhandled API error");
    return jsonError(request, env, 500, "Error interno del backend. No se expusieron detalles sensibles.", "WORKER_ADAPTER_ERROR");
  }
}

export default { fetch: handleRequest };
