# Valley of the Shadow of Death — Progress Log

Stack: Vite + three@0.184, n8ao. All assets procedural (canvas textures, noise terrain, kit-bashed rocks).
Screenshots: headless Chrome (SwiftShader CPU rendering) via `node tools/shoot.mjs <label>`.
NOTE: FPS numbers from the harness are CPU-software-rendered and NOT representative of the
60fps target hardware (mid-range laptop GPU). Draw calls / triangle counts are tracked instead
as the controllable proxy, alongside the SwiftShader fps trend.

## Iteration 1 — first full build

| Axis | Score | Notes |
|---|---|---|
| Darkness legibility | 3 | Whole scene far too bright; navy postcard sky, path not the focal point |
| Fire/smoke believability | 2 | Fissure mesh misplaced (buried under path) — fire light visible but no seam, smoke unseen |
| Fog depth | 3 | Bright sky overpowers the FogExp2; no layered depth |
| Material response | 4 | Cracked-mud crazing reads well; rocks render as smooth golden blobs (envmap too hot) |
| Dread factor | 2 | Looks like a hiking trail at dusk, not the valley of death |

SwiftShader fps: ~0.4 @1280x720 (CPU rendering; not the real target measure).

Fixes queued:
- [bug] yaw=0 faces -z, not PI — all debug views and player spawn faced the wrong way.
- [bug] Fissure geometry baked local x but sampled world heights; bake world x so the seam
  actually lies in the shelf trench beside the path.
- [look] Darken sky dome ~4x, rim light 0.5→0.12, hemi 0.22→0.10, env map intensity 0.7→0.2
  (terrain) / 0.8→0.25 (rocks), darken PMREM env scene; rocks' base color down.
- [harness] Shoot `exit` LAST (dawn state contaminated `free`); shoot `entrance` before
  taking the lantern so the post lantern is still burning in frame.
- [harness] renderer.info.autoReset=false so draw-call stats survive the composer's passes.
