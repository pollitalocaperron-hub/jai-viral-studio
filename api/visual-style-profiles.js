const LOCKED_STYLE = Object.freeze({
  id: "jai-reference-motion-01",
  label: "J.A.I. Reference Motion · estilo visual fijo",
  references: ["referencia audiovisual J.A.I."],
  palette: "azul marino profundo y fondos tecnológicos oscuros; túneles luminosos cian; haces de luz cálida sobre madera; tipografía blanca cinética con énfasis cian; acentos ámbar y verdes solo cuando el contenido lo justifique",
  prompt: "Apply one consistent 2D motion-graphics and editorial-illustration visual identity across every topic and every shot. Use deep navy technology backgrounds, luminous cyan tunnels and data paths, warm wood surfaces with directional amber light rays, crisp white kinetic typography with cyan emphasis, and carefully illustrated objects such as laptops, routers, meters, switches, and simplified recreated software interfaces when they are relevant to the subject. Use clean geometric silhouettes, separated 2D layers, strong hierarchy, restrained glow, purposeful depth through parallax, and high-contrast readable compositions. This is a fixed visual language, not a selectable theme. Never switch to anime, photorealism, 3D/CGI, paper collage, mascot cartoons, or unrelated visual presets. Adapt the objects and diagrams to the topic while preserving the same visual identity.",
  motion: "Use purposeful 2D layer animation: staged reveals, object movement, interface state changes, diagram assembly, short parallax moves, controlled light sweeps, and kinetic title emphasis. Every motion must explain a real action or narrative beat; avoid decorative motion and static slide sequences.",
  audit: "Verify the same deep-navy/cyan/warm-wood 2D motion-graphics identity across all shots, consistent line weight and lighting, readable composition, distinct objects and layers, purposeful animation, and topic accuracy. Reject style drift into anime, photorealistic imagery, 3D/CGI, paper craft, or alternate mascot styles."
});

export function resolveVisualStyleProfile() {
  return { ...LOCKED_STYLE };
}

export function getVisualStyleProfileIds() {
  return [LOCKED_STYLE.id];
}
