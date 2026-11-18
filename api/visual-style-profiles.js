const PROFILES = {
  "cinematic-cartoon-story": {
    label: "Narrativa animada cinematográfica",
    references: ["15811.mp4"],
    palette: "azul índigo nocturno, sombras ciruela, luz ámbar de ventanas y acentos mostaza; variar según la hora y el entorno",
    prompt: "Use a stylized animated-cartoon story world: rounded readable characters with expressive simple faces, strong dark contour lines, dimensional layered shading, warm amber practical lights against deep indigo night when the scene is nocturnal, recognizable locations, story-critical props, establishing views followed by medium shots and expressive close-ups. Build a coherent 2.5D/vector approximation with separated foreground, subject and background layers; do not imitate any exact character or shot from the reference.",
    motion: "Narrative continuity, motivated cutaways to evidence or props, gentle parallax/push-ins, reaction close-ups, clear character gestures and visible cause-to-effect actions. Avoid static slide sequences.",
    audit: "Check for a coherent stylized cartoon story world, readable expressive characters, location continuity, strong dark contours, layered depth and warm/cool lighting contrast. A 2.5D layered vector interpretation is acceptable; do not demand photorealistic 3D."
  },
  "paper-craft-explainer": {
    label: "Infografía de papel y collage",
    references: ["15973(1).mp4"],
    palette: "fondos saturados por capítulo — turquesa, verde, rosa coral y azul — combinados con papel crema, kraft y acentos rojos",
    prompt: "Use a tactile paper-craft explainer language: layered cut-paper shapes, kraft/cardboard tabletop or lower shelf, torn-paper title strips, small tape tabs, paper labels, playful geometric mascot, physical props and clean infographic diagrams. Give each chapter a distinct but coordinated saturated background (teal, green, coral-pink, blue) while retaining cream/kraft paper surfaces. Recreate the craft language with vector silhouettes and layered shapes; never copy the exact mascot or wording.",
    motion: "Reveal numbered sections one by one, slide or peel paper labels, assemble diagrams from separate pieces, move the mascot between steps, and use quick prop-to-title transitions. Captions should be short and timed to spoken emphasis.",
    audit: "Check for visible paper-layer hierarchy, kraft/cream paper surfaces, torn or taped label motifs, playful cutout shapes, saturated chapter colors and clear step-by-step visual organization. Do not reject clean vector approximations merely because they are not physical paper."
  },
  "retro-mascot-ui": {
    label: "Mascota retro y panel digital",
    references: ["15968(1).mp4"],
    palette: "carbón y marrón madera, negro cálido, dorado/ámbar y coral; crema para texto y detalles luminosos",
    prompt: "Use a retro product-demo language: a recurring simple robot/monitor mascot as a visual host, dark charcoal interface panels, warm wood-slat or desk-like backdrop, amber/gold highlights, coral hardware accents, compact dashboard cards, progress indicators and legible simplified UI mockups. Keep the mascot consistent in shape and color across shots. Use vector panels and shapes; never reproduce exact logos, UI screenshots, mascot design or wording from the reference.",
    motion: "Keep the mascot as a recurring anchor; transition between its reaction, a focused UI panel, a highlighted control and a visible result. Use progress/step indicators and small UI state changes rather than decorative camera movement.",
    audit: "Check for a consistent retro mascot, dark interface hierarchy, warm wood/charcoal environment, amber highlights, coral accents and purposeful UI states. Ensure interface text is added later as editable captions, not baked into illustration paths."
  },
  "cinematic-desk-tech": {
    label: "Demostración tecnológica de escritorio",
    references: ["15972.mp4"],
    palette: "carbón, oliva oscuro y madera cálida, con verde brillante para la acción y rojo/blanco para alertas",
    prompt: "Use a cinematic desk-tech explainer language: a simplified human operator at a workstation, monitor or device as the main evidence, dark softly lit room, warm desk surfaces, restrained depth-of-field illusion through layered contrast, green highlighted action text/indicators and red/white alert chips. Connect devices and steps with fine dotted paths or waveform-like progress motifs. Build a coherent 2.5D vector scene with foreground, desk, operator and monitor layers; never copy exact people, screenshots or logos.",
    motion: "Move from a wide workstation view to a close-up of the relevant control, then show the UI state change and its result. Use short dotted-path reveals, waveform pulses and clear before/after states synchronized to narration.",
    audit: "Check for a dark desk/workstation environment, a recognizable operator/device relationship, monitor UI as evidence, green action emphasis, red/white alert labels and clear depth layering. A vector-based 2.5D approximation is acceptable."
  }
};

function normalize(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, " ").replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

export function resolveVisualStyleProfile(requestedId, topic = "", script = "") {
  if (Object.prototype.hasOwnProperty.call(PROFILES, requestedId)) {
    return { id: requestedId, ...PROFILES[requestedId] };
  }
  const text = normalize(topic + " " + script.slice(0, 1800));
  let id = "paper-craft-explainer";
  if (/historia|relato|cuento|misterio|crimen|caso real|leyenda|biografia|personaje|drama|terror|narrativa/.test(text)) {
    id = "cinematic-cartoon-story";
  } else if (/obs|stream|streaming|transmitir|transmision|podcast|microfono|camara web|webcam|escritorio|monitor|captura de pantalla|audio en vivo/.test(text)) {
    id = "cinematic-desk-tech";
  } else if (/top \d|lista|pasos|guia|comparativa|consejos|plugins|herramientas|ranking|checklist|ventajas y desventajas/.test(text)) {
    id = "paper-craft-explainer";
  } else if (/app|software|programa|plataforma|inteligencia artificial|\bia\b|codigo|automatizacion|interfaz|dashboard|producto digital/.test(text)) {
    id = "retro-mascot-ui";
  }
  return { id, ...PROFILES[id] };
}

export function getVisualStyleProfileIds() {
  return Object.keys(PROFILES);
}
