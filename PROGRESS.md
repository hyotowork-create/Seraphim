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

## Iteration 2 — orientation + fissure placement fixes, global darkening

| Axis | Score | Notes |
|---|---|---|
| Darkness legibility | 5 | Baseline finally dark; path reads under lantern |
| Fire/smoke believability | 4 | Seam visible but floats ON the surface (trench misaligned d=2.65 vs mesh d=1.6); fire light floods half the valley |
| Fog depth | 5 | Fog and sky now blend; depth layering appears |
| Material response | 5 | Mud crazing strong; rocks read as smooth blobs, cliffs as flat slabs |
| Dread factor | 5 | Mood arriving; hellmouth too cheerful-bright |

Fixes: shared `fissureWobble(z)` so trench + glow mesh + embers align; crag noise on ditch
walls and cliff flanks; fire light 60→26; smoke bigger/denser; dawn sun 2.6→0.85; grain hash
moiré fixed (gl_FragCoord + frame jitter); rocks flat-shaded (mistake — see iter3).

## Iteration 3 — crags, alignment, smoke

| Axis | Score | Notes |
|---|---|---|
| Darkness legibility | 6 | Ditch view reads as a real drop; entrance solid |
| Fire/smoke believability | 6 | Smoke crossing the path believable; near-fissure blowout from carried lantern + bloom |
| Fog depth | 6 | Free view layers nicely |
| Material response | 5 | flatShading made rocks honeycomb domes; cliff UV stretch streaks |
| Dread factor | 6 | Ditch + free views carry dread |

Fixes: rocks back to smooth shading with ridged-noise crumple (icosa detail 3); carried
lantern 18→9 (decay 2); dawn sky horizon halved; ditch vertex colors fall to black faster
(bottomless); free view reframed to include the quagmire looking back at the glow.

## Iteration 4 — current

| Axis | Score | Notes |
|---|---|---|
| Darkness legibility | 6 | Entrance still slightly flat; path pool good |
| Fire/smoke believability | 6 | Near-fissure white clipping via bloom; cliff behind hellmouth oversaturated red |
| Fog depth | 6 | Exit dawn still whites out the horizon |
| Material response | 5 | Rock instances show scale/fishskin texture tiling; cliff strata stretch |
| Dread factor | 6 | Free view (looking back at the glow) is the strongest frame yet |

SwiftShader fps 0.6 @1280x720 (CPU; tracking only). 123 draw calls / 570k tris.

Fixes queued for iter5:
- Bloom threshold 0.82→0.88, strength 0.55→0.5; fissure emissive pump 2.7x→2.0x; fire 26→20.
- Sky shader: explicit low gold sun disc at dawn instead of a white horizon wash (uDawn 0.75→0.6).
- Dedicated rock maps (separate texture instance, low repeat) to kill the fishskin tiling.
- Darken cliff vertex color above ad>8 to hide UV stretch; raise terrain z-repeat.

## Iterations 5–9 — texture identity, dawn rescue, sky tracking

Key changes: dedicated boulder texture set (fishskin tiling gone); cliff vertex-color
silhouetting; gold sun disc in sky shader; dawn fog #2e3850 (was washing white); carried
flame shrunk (was a bloom blob dead-center); sky dome now follows the camera (sun disc
parallax fix); fire light casts 512px cube shadows; fps probe walks facing -z (was backward).

| Axis (iter9) | Score | Notes |
|---|---|---|
| Darkness legibility | 7 | Path pool reads; entrance silhouettes good; path fades a touch early beyond lantern |
| Fire/smoke believability | 7 | Seam buried in trench, embers cross path; near-lantern hotspot below camera |
| Fog depth | 7 | Free view layers beautifully; exit horizon still a pale band (dawnGlow sprite saturating) |
| Material response | 7 | Boulders read as wet hewn stone; mud crazing strong; cliff strata acceptable as hatching |
| Dread factor | 7 | Free + ditch views genuinely oppressive |

Perf note: fire cube shadow re-renders the scene 6 ways every frame (2.18M tris/frame
measured). Queued: shadow autoUpdate off, refresh every 5th frame.
