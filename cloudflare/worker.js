import generate from "../api/generate.js";
import narrate from "../api/narrate.js";
import inspectVisual from "../api/inspect-visual.js";
import directScenes from "../api/direct-scenes.js";

const ROUTES = new Map([
  ["/api/generate", generate],
  ["/api/narrate", narrate],
  ["/api/inspect-visual", inspectVisual],
  ["/api/direct-scenes", directScenes]
]);

function createResponseBridge() {
  let statusCode = 200;
  let body = null;
  let ended = false;
  const headers = new Headers();
  const response = {
    status(code) { statusCode = Number(code) || 200; return this; },
    setHeader(name, value) { headers.set(name, String(value)); return this; },
    json(value) {
      body = JSON.stringify(value);
      headers.set("Content-Type", "application/json; charset=utf-8");
      ended = true;
      return this;
    },
    end(value) {
      if (value !== undefined) body = String(value);
      ended = true;
      return this;
    }
  };
  return {
    response,
    toWebResponse() {
      return new Response(ended ? body : null, { status: statusCode, headers });
    }
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const handler = ROUTES.get(url.pathname.replace(/\\/$/, ""));
    if (!handler) return Response.json({ error: "Ruta no encontrada." }, { status: 404 });

    let body;
    if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "OPTIONS") {
      const contentType = request.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        try { body = await request.json(); }
        catch { return Response.json({ error: "El cuerpo JSON no es válido." }, { status: 400 }); }
      } else {
        return Response.json({ error: "Se requiere Content-Type: application/json." }, { status: 415 });
      }
    }

    const req = {
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body,
      url: request.url
    };
    const bridge = createResponseBridge();
    try {
      await handler(req, bridge.response, env);
      return bridge.toWebResponse();
    } catch (error) {
      console.error("[JAI][Worker] Error no controlado:", error?.message || error);
      return Response.json({ error: "Error interno del servidor." }, { status: 500 });
    }
  }
};
