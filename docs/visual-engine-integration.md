# J.A.I. Visual Engine Integration

## Purpose

This branch introduces a versioned scene boundary between the scene director, visual asset producer, timeline renderer, audiovisual mixer, and export quality gate. It is isolated from `main`; no deployment or production configuration is changed here.

## Contract

- Schema: `schemas/jai.scene.v1.schema.json`
- Runtime adapter and validator: `api/jai-scene-contract.js`
- Regression test: `tests/scene-contract.mjs`

Every shot carries stable scene/shot IDs, absolute start/end times, 720x1280 canvas metadata, visual source type, verifiable asset metadata, continuity anchor, camera/motion instructions, narration/subtitle sync events, transition, and independent validation flags.

Supported visual source types:

- `image`: a single still. It is not considered motion footage.
- `image_sequence`: multiple decoded images with a time mapping.
- `video_clip`: an actual decoded video asset with duration and MIME metadata.
- `vector_scene`: the existing legacy vector output. This is a preview/illustration path, not cinematic footage.

Assets require a stable ID, URI, MIME type, dimensions, and SHA-256. Video assets additionally require duration. The runtime adapter deliberately does not invent assets or claim validation that has not occurred.

## Current legacy adapter

`api/direct-scenes.js` still asks Groq/Gemini for structured shot descriptions, vector paths, and transform steps. It now also returns `scene_contracts` normalized to `jai.scene.v1`.

The response deliberately separates:
- `vector_preview_ready: true`: vector paths and transform instructions passed structural validation.
- `animation_ready: false`: the legacy path is not the cinematic animation engine.
- `cinematic_ready: false`: no real cinematic image/video assets have been generated and independently verified.

The browser labels its rasterized vector frames as technical previews. It blocks final export unless a future visual producer supplies real assets and all required QC flags are true. This prevents a technically valid vector preview from being presented as the requested finished video.

## Renderer integration boundary

The timeline remains the master clock. Each scene's absolute times are normalized to the timeline; audio sync events, subtitle cues, sound cues, and transitions must use that same clock. A future renderer adapter must implement each source type distinctly:

- `image`: draw a still; do not label a pan/zoom as generated animation.
- `image_sequence`: decode and select frames by timestamp; validate frame coverage and continuity.
- `video_clip`: decode the clip, seek/render frames against the master clock, and handle trim, frame rate, and audio policy explicitly.
- `vector_scene`: retain the current legacy renderer for previews only.

## Local media import and renderer adapter

The Openverse bridge now exposes the original media URL separately from its thumbnail. The browser importer attempts a CORS-safe HTTPS fetch, rejects redirects, accepts only JPEG/PNG/WebP, enforces a 24 MB limit, decodes the file, computes SHA-256, and stores the original Blob plus creator/license/source attribution in IndexedDB. A failed CORS request is reported as an import failure; the thumbnail or remote URL is never mislabeled as a locally stored original.

Imported still images can be assigned to a specific directed shot. The timeline renderer decodes them with ImageBitmap and draws them into the existing 9:16 canvas before the fixed J.A.I. title/subtitle overlays. The renderer adapter also supports decoded image sequences and local video clips as distinct source types; Openverse search currently supplies images only. The library also accepts user-provided MP4/WebM files locally, with metadata validation; these are not attributed to Openverse.

Storage is browser-local to the current device/profile, not shared cloud storage. Clearing browser site data or using another device does not transfer these blobs. A durable shared library still requires an approved persistent object store and credentials. The export gate remains closed until independent asset, continuity, full-file decode, and audiovisual QC pass.

## Character rig continuity

The 2D motion engine now validates reusable character skeletons across the full directed shot list before the scene director response is accepted. A character part must keep the same explicit parent across shots; explicit parents must exist in that character's collected parts; self-links and cyclic hierarchies are rejected. Parts with identical names remain isolated by character ID. Invalid saved plans fail closed instead of silently changing a character's skeleton during animation.

This is structural continuity validation only. It does not claim that generated vector artwork is anatomically correct or that visual continuity has passed human/artistic review.

### Motion-step continuity

Animation steps targeting the same layer are checked before a shot plan is accepted. Sequential steps must meet at the same transform, and overlapping steps are rejected; separate layers may still animate concurrently. A character's explicit parent bone must also be present in the same shot, because the current renderer can only propagate parent transforms through layers included in that shot. These checks prevent abrupt pose jumps and silent loss of inherited articulation.

## Export quality gate

The browser export path now decodes the recorded Blob before exposing a download. It checks:
- a non-empty file;
- decodable media metadata;
- 720x1280 output;
- duration within a bounded tolerance of the timeline;
- an audio track was attached to the recorder stream;
- sampled frames are not all identical (freeze-screen guard).

This browser check is a first QC layer, not a substitute for a complete FFmpeg/FFprobe decode and independent audiovisual review. A full production release must still add server/local media inspection of the entire file and inspect audio clipping, silence, dropped frames, and scene continuity.

## Provider and quota constraint

Groq's current integration is a text scene director; it does not return image or video media. The current Gemini text model integration also returns JSON scene plans, not generated media. Google's published Gemini API pricing currently lists Gemini image-generation models and Veo video-generation models without a free tier. Therefore this branch does not silently call those models, incur charges, or pretend that a prompt is a rendered scene. Under the project's no-paid-provider/no-quota-consumption constraint, the actual cinematic asset producer remains a hard blocker until a permitted free media-generation capability or an approved existing asset source is available.

Official capability/pricing references:
- https://ai.google.dev/gemini-api/docs/image-generation
- https://ai.google.dev/gemini-api/docs/video
- https://ai.google.dev/gemini-api/docs/pricing

## Release policy

Do not merge this branch into `main` or deploy it as a completed product yet. The branch is a development candidate. It must pass local Node tests, Chromium tests, real asset-generation tests within approved quotas, full media decode, and audiovisual QC before it can be considered ready for the published page.
