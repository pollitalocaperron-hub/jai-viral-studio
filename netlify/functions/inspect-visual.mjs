import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";
import inspectVisualHandler from "../../api/inspect-visual.js";

const MAX_BODY_BYTES = 1280 * 1024;

function readEnv(name) {
  try {
    const value = globalThis.Netlify?.env?.get?.(name);
    if (typeof value === "string" && value) return value;
  } catch {}
  return process.env[name] || "";
}

function secureEquals(left, right) {
  const a = Buffer.from(String(left), "utf8");
  const b = Buffer.from(String(right), "utf8");
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

function createResponseAdapter() {
  let statusCode = 200;
  const headers = new Headers();
  let response = null;
  const res = {
    status(code) { statusCode = Number(code) || 200; return res; },
    setHeader(name, value) { headers.set(name, String(value)); return res; },
    json(value) {
      if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json; charset=utf-8");
      response = new Response(JSON.stringify(value), { status: statusCode, headers });
      return response;
    },
    end(value) {
      response = new Response(value == null ? null : String(value), { status: statusCode, headers });
      return response;
    },
    get response() { return response; },
    get statusCode() { return statusCode; }
  };
  return res;
}

export const config = { path: "/internal/jai/inspect-visual" };

export default async function handler(request) {
  if (request.method !== "POST") {
    return Response.json({ error: "Método no permitido." }, { status: 405, headers: { Allow: "POST" } });
  }

  const expectedSecret = readEnv("JAI_INTERNAL_PROXY_SECRET");
  const presentedSecret = request.headers.get("x-jai-proxy-secret") || "";
  if (expectedSecret.length < 32 || !secureEquals(expectedSecret, presentedSecret)) {
    return Response.json({ error: "Acceso no autorizado." }, { status: 403 });
  }

  const geminiKey = readEnv("GEMINI_API_KEY");
  if (!geminiKey) return Response.json({ error: "El inspector no tiene configurada la clave de Gemini." }, { status: 503 });

  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_BODY_BYTES) return Response.json({ error: "La auditoría supera el límite seguro de tamaño." }, { status: 413 });

  let raw;
  try { raw = await request.text(); }
  catch { return Response.json({ error: "No se pudo leer el cuerpo de la auditoría." }, { status: 400 }); }
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return Response.json({ error: "La auditoría supera el límite seguro de tamaño." }, { status: 413 });
  }

  let body;
  try { body = JSON.parse(raw); }
  catch { return Response.json({ error: "El cuerpo debe ser JSON válido." }, { status: 400 }); }

  const req = {
    method: "POST",
    headers: Object.fromEntries(request.headers.entries()),
    body,
    apiKeys: { gemini: geminiKey }
  };
  const res = createResponseAdapter();
  try {
    await inspectVisualHandler(req, res);
    return res.response || Response.json({ error: "El inspector no produjo una respuesta." }, { status: 500 });
  } catch {
    return Response.json({ error: "Error interno del inspector. No se expusieron detalles sensibles." }, { status: 500 });
  }
}
