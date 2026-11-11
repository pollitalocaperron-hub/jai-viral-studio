const ALLOWED_ORIGIN = "https://pollitalocaperron-hub.github.io";

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const corsHeaders = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };

    if (request.method === "OPTIONS") {
      if (origin !== ALLOWED_ORIGIN) {
        return new Response(null, { status: 403 });
      }
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (origin !== ALLOWED_ORIGIN) {
      return Response.json({ error: "Origen no autorizado." }, { status: 403 });
    }

    if (request.method !== "POST") {
      return Response.json({ error: "Método no permitido." }, { status: 405, headers: corsHeaders });
    }

    if (!env.OPENAI_API_KEY) {
      return Response.json({ error: "Falta configurar OPENAI_API_KEY en el servidor." }, { status: 500, headers: corsHeaders });
    }

    try {
      const body = await request.json();
      const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, 300) : "";
      const research = typeof body.research === "string" ? body.research.trim().slice(0, 8000) : "";
      const duration = typeof body.duration === "string" ? body.duration.slice(0, 40) : "45–60 segundos";
      const platform = typeof body.platform === "string" ? body.platform.slice(0, 40) : "Reels";

      if (!topic) {
        return Response.json({ error: "Escribe un tema para el vídeo." }, { status: 400, headers: corsHeaders });
      }

      const prompt = [
        "Eres el director creativo y guionista de J.A.I. Viral Studio.",
        "Crea una propuesta educativa para un vídeo vertical 9:16.",
        "No inventes cifras, estudios, citas ni hechos. Si falta evidencia, dilo claramente y marca qué debe verificarse.",
        "Escribe en español natural, claro y atractivo. Evita clickbait engañoso.",
        "Devuelve estas secciones con títulos: CATEGORÍA, ENFOQUE, HOOK (máximo 2 frases), GUION CON TIEMPOS, STORYBOARD DE 5 ESCENAS, FUENTES O DATOS QUE HAY QUE VERIFICAR, CHECKLIST FINAL.",
        "El guion debe tener inicio, explicación comprensible, un detalle memorable y cierre.",
        "Duración objetivo: " + duration + ". Plataforma: " + platform + ".",
        "Tema: " + topic,
        "Notas del usuario: " + (research || "No proporcionó notas.")
      ].join("\n\n");

      const aiResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + env.OPENAI_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-6-luna",
          input: prompt,
          max_output_tokens: 1800
        })
      });

      const data = await aiResponse.json();
      if (!aiResponse.ok) {
        return Response.json(
          { error: data.error?.message || "La API de IA no pudo completar la solicitud." },
          { status: aiResponse.status, headers: corsHeaders }
        );
      }

      const plan = (data.output || [])
        .flatMap(item => item.content || [])
        .filter(item => item.type === "output_text")
        .map(item => item.text)
        .join("\n")
        .trim();

      if (!plan) {
        return Response.json({ error: "La IA devolvió una respuesta vacía. Inténtalo otra vez." }, { status: 502, headers: corsHeaders });
      }

      return Response.json({ plan }, { headers: corsHeaders });
    } catch (error) {
      return Response.json({ error: "No se pudo procesar la solicitud. Inténtalo de nuevo." }, { status: 500, headers: corsHeaders });
    }
  }
};
