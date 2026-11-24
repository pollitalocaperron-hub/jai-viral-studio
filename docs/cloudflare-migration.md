# J.A.I. Viral Studio — backend migration candidate

## Architecture decision

Keep GitHub Pages as the frontend. Cloudflare Worker is the public API gateway and abuse-control layer. The three small API routes (generation, narration, scene direction) stay on Workers Free. Visual inspection is streamed without JSON parsing to a private Netlify Function, because image batches are the only large CPU-heavy payload.

The Netlify inspector is not publicly usable without a 32+ character shared secret. Cloudflare sends that secret server-to-server; it is never sent to the browser. Netlify reads `GEMINI_API_KEY` from its encrypted environment and passes it to the existing visual inspector handler. Groq remains on Cloudflare for the other routes.

## Why the split solves the Free CPU bottleneck

Cloudflare Workers Free has a 10 ms CPU budget per HTTP request. Waiting on a provider request does not count, but parsing large JSON/base64 payloads does. The Worker therefore streams the visual-audit body through a byte-counting transform and does not call `JSON.parse` or build the Gemini request. It rejects bodies over 1,280 KiB before forwarding.

Netlify Functions Free has a 60-second synchronous execution limit, 1 GB default memory and a 6 MB buffered request/response limit. The inspector's 35-second Gemini timeout fits inside that execution window. The image batches are capped at 1.1 MB encoded, so they remain well below Netlify's payload ceiling.

Netlify Free includes 300 credits/month and has a hard limit with no automatic recharge. Function compute is 10 credits per GB-hour; the function defaults to 1 GB. The shared Cloudflare Durable Object caps the inspector at 600 calls/month. Even at the full 60-second function ceiling, that is at most 10 GB-hours / 100 compute credits; one production deploy costs 15 credits, leaving a buffer for web requests and other usage. The actual inspector aborts its Gemini call after 35 seconds, so normal worst-case compute should be lower. Netlify credits are account-wide: any other projects using the same account consume the same pool, so inspect account usage before activation.

## Visual inspection payload controls

- Browser renders each audit frame at 448 × 796 JPEG, starts at quality 0.58 and falls back to 0.42 / 0.30.
- Hard client cap: 250 KB per frame.
- Four frames per batch; maximum 1.1 MB encoded across the batch.
- Cloudflare streams and counts bytes; it never parses the inspection JSON.
- Netlify validates the shared secret, enforces a 1,280 KiB body limit, parses JSON and invokes Gemini.
- Gemini request timeout: 35 seconds.

## Shared abuse and quota controls

A SQLite-backed Durable Object is allocated per API route. All client IPs, Worker isolates and edge locations share the same counters. Cloudflare's trusted `CF-Connecting-IP` is SHA-256 hashed; the raw IP is never stored.

Per-IP fixed-window limits (10 minutes):
- Generate: 6.
- Narration: 8.
- Scene direction: 8.
- Visual inspection: 20.

Route-wide burst ceilings (all IPs combined):
- Generate, narration and scene direction: 60 requests/minute per route.
- Visual inspection: 120 requests/minute.

The visual inspector also has a shared monthly hard cap of 600 calls. A call is one four-frame batch, so this allows up to 2,400 inspected frames/month. The monthly cap resets at UTC month start and returns a clear 429 when exhausted. If the Durable Object binding, trusted IP, or counter is unavailable, the Worker rejects the request (fail-closed). CORS is not treated as authentication. Distributed clients can evade per-IP limits, but not the route-wide or monthly caps.

Durable Objects are used for shared counters, not as a way to bypass the Worker CPU limit.

## Provider compatibility tests

All provider tests use mocked `fetch` responses. They cover Groq success, Groq 429 followed by Gemini fallback, both providers quota-limited, scene-director validation/fallback, Gemini TTS parsing and quota exhaustion, visual QA responses, private Netlify inspector authentication, payload limits, and Worker-to-Netlify proxy headers. No test calls Groq or Gemini for real and no provider quota is consumed.

## Reference-derived audiovisual direction

The visual director resolves one of four profiles from the topic/script and returns the profile ID. The same profile is passed to visual QA and saved with the project:
- `cinematic-cartoon-story`: expressive animated-cartoon storytelling, indigo / amber lighting, character reactions and prop-driven narrative (reference 15811).
- `paper-craft-explainer`: layered paper/collage, kraft tabletop, torn labels, chapter colors and playful cutout mascot (reference 15973).
- `retro-mascot-ui`: recurring retro mascot, charcoal/wood backdrop, amber UI panels and progress indicators (reference 15968).
- `cinematic-desk-tech`: workstation, monitor evidence, dark room, green action highlights and red/white alert chips (reference 15972).

The browser renderer paints profile-specific backdrops, title treatments and synchronized captions. The director and visual inspector share the selected profile. Social-app capture chrome (likes, comments, status bars and profile UI) is explicitly excluded from the visual language. The renderer remains a layered 2.5D vector system; it does not yet reproduce full 3D character animation, photographic depth of field or physical paper texture.

## Rollback and activation

- The frontend remains on its existing Vercel API URL. No API base URL was changed.
- Cloudflare Worker is not deployed and Netlify site/function is not deployed.
- Rollback remains one frontend configuration change: restore `JAI_API_BASE` to the existing Vercel API URL. Keep Vercel and its secrets intact.
- If the private Netlify inspector is unavailable, the Worker fails closed for visual inspection; generation, narration and scene direction remain separate routes.
- Add Cloudflare secrets: `GROQ_API_KEY`, `GEMINI_API_KEY` (for non-inspection routes), `NETLIFY_INSPECT_SECRET`. Add variable `NETLIFY_INSPECT_URL=https://<netlify-site>.netlify.app/internal/jai/inspect-visual`.
- Add Netlify secrets: `GEMINI_API_KEY` and `JAI_INTERNAL_PROXY_SECRET` (same random 32+ character value as Cloudflare's `NETLIFY_INSPECT_SECRET`).
- Netlify Free has a hard 300-credit monthly cap and no auto-recharge. Do not activate if account-wide remaining credits are insufficient.
- No branch ref update, deployment, account creation, billing action or live provider call is performed by this candidate.

## Activation gates

1. Review Cloudflare and Netlify account-wide free usage.
2. Add the encrypted secrets and private inspector URL through the respective dashboards; never paste secrets into chat or commit them.
3. Run `npm test` and the Cloudflare / Netlify local runtime checks.
4. Measure Worker CPU on all routes, especially the streaming proxy, and measure Netlify function compute for the four-frame audit batch.
5. Verify the monthly counter, per-IP counters, global route ceilings, and fail-closed behavior.
6. Only then authorize deployment and switch `JAI_API_BASE`; keep Vercel as rollback.

## Current status

Candidate source only. Syntax and deterministic profile-selection checks have been performed. Full Node integration tests and Cloudflare / Netlify runtime measurements have not yet been executed. Nothing is deployed or active.
