// Raycast interactions: lantern, prayer stone, exit ridge.
import * as THREE from 'three';

export function createInteractions({ camera, player, valley, ui, audio, postFx, scene }) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 3.2;
  const center = new THREE.Vector2(0, 0);

  const state = {
    hasLantern: false,
    prayed: false,
    praying: false,
    prayerBoostUntil: 0,
    dawnStarted: false,
    dawnT: 0,           // 0..1 over 8s
    hover: null,
  };

  // Player-carried lantern light (born when taken).
  const carried = new THREE.PointLight(0xff9a3d, 0, 4.5, 2.0);
  carried.position.set(0.25, -0.35, 0.15); // low right hand
  camera.add(carried);
  const carriedFlame = new THREE.Mesh(
    new THREE.SphereGeometry(0.011, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xcc8a3a })
  );
  carriedFlame.position.copy(carried.position);
  carriedFlame.visible = false;
  camera.add(carriedFlame);

  const entries = [
    {
      key: 'lantern',
      hitMesh: valley.props.lantern.hitMesh,
      prompt: 'E: Take the lantern',
      available: () => !state.hasLantern,
      action: takeLantern,
    },
    {
      key: 'pray',
      hitMesh: valley.props.prayerStone.hitMesh,
      prompt: 'E: Pray',
      available: () => !state.praying,
      action: pray,
    },
    {
      key: 'exit',
      hitMesh: valley.props.exitCairn.hitMesh,
      prompt: 'E: Press on',
      available: () => !state.dawnStarted,
      action: pressOn,
    },
  ];

  function takeLantern() {
    state.hasLantern = true;
    const src = valley.props.lantern;
    src.light.intensity = 0;
    src.flame.visible = false;
    src.cage.visible = false;
    carried.intensity = 7;
    carriedFlame.visible = true;
    ui.setHud('The lantern is lit · keep to the path');
    audio?.onLantern?.();
  }

  function pray() {
    state.praying = true;
    audio?.duckWhispers?.(34);
    ui.fadeTo(0.92, 1.6);
    ui.showMessage('His candle shineth upon my head', 1.8, 3.6);
    setTimeout(() => {
      ui.fadeTo(0, 2.4);
      state.prayed = true;
      state.praying = false;
      state.prayerBoostUntil = performance.now() / 1000 + 30;
      ui.setHud('The light grows · 30s of grace');
    }, 3800);
  }

  function pressOn() {
    state.dawnStarted = true;
    ui.setHud('Dawn');
    audio?.onDawn?.();
  }

  let prevHover = null;
  function update(dt, t, fog) {
    // Hover + prompt.
    raycaster.setFromCamera(center, camera);
    state.hover = null;
    for (const e of entries) {
      if (!e.available()) continue;
      const hits = raycaster.intersectObject(e.hitMesh, true);
      if (hits.length) { state.hover = e; break; }
    }
    if (state.hover !== prevHover) {
      ui.setPrompt(state.hover ? state.hover.prompt : '');
      for (const e of entries) {
        const root = e.hitMesh;
        root.traverse?.((o) => {
          if (o.material && 'emissive' in o.material) {
            o.material.emissive.setHex(e === state.hover ? 0x2a1f0c : 0x000000);
            o.material.emissiveIntensity = e === state.hover ? 1.2 : 0;
          }
        });
        if (root.material && 'emissive' in root.material) {
          root.material.emissive.setHex(e === state.hover ? 0x2a1f0c : 0x000000);
        }
      }
      prevHover = state.hover;
    }

    // Carried lantern flicker + prayer boost.
    if (state.hasLantern) {
      const boosted = t < state.prayerBoostUntil;
      const radius = boosted ? 9 : 4.5;
      const power = boosted ? 13 : 7;
      const fl = 0.85 + Math.sin(t * 11.3) * 0.05 + Math.sin(t * 27.7) * 0.04 + Math.sin(t * 5.1) * 0.06;
      carried.distance = THREE.MathUtils.lerp(carried.distance, radius, dt * 2);
      carried.intensity = power * fl * (1 - state.dawnT * 0.75);
      if (boosted && state.prayerBoostUntil - t < 0.1) ui.setHud('The light fades back');
    }

    // Dawn sequence: fog lifts over 8s, blue-gold floods the far end.
    if (state.dawnStarted && state.dawnT < 1) {
      state.dawnT = Math.min(1, state.dawnT + dt / 8);
      const k = state.dawnT;
      const e = k * k * (3 - 2 * k);
      valley.skyUniforms.uDawn.value = e * 0.6;
      valley.dawn.sun.intensity = e * 2.2;
      valley.dawn.ambient.intensity = e * 0.3;
      valley.dawn.glow.material.opacity = e * 0.3;
      fog.density = THREE.MathUtils.lerp(fog.baseDensity, 0.009, e);
      fog.color.lerpColors(fog.baseColor, new THREE.Color(0x2e3850), e);
      fog.dawnLock = e; // tell main loop to stop breathing the fog
      if (state.dawnT >= 1) {
        ui.showEndCard();
        audio?.fadeOut?.(6);
      }
    }
  }

  function onKeyE() {
    if (state.hover && player.state.enabled) {
      const e = state.hover;
      state.hover = null;
      ui.setPrompt('');
      e.action();
    }
  }
  document.addEventListener('keydown', (ev) => { if (ev.code === 'KeyE') onKeyE(); });

  return { update, state, takeLantern, pray, pressOn, carried };
}
