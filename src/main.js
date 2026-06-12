import * as THREE from 'three';
import { buildValley, groundHeight, pathCenterX, VALLEY } from './valley.js';
import { buildHazards } from './hazards.js';
import { createPlayer } from './player.js';
import { createInteractions } from './interact.js';
import { createPost } from './post.js';
import { createAudio } from './audio.js';

// ---------- Renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.info.autoReset = false; // stats survive the composer's multi-pass render
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010102);

const BASE_FOG_DENSITY = 0.042;
const BASE_FOG_COLOR = new THREE.Color(0x06070c);
scene.fog = new THREE.FogExp2(BASE_FOG_COLOR.getHex(), BASE_FOG_DENSITY);
const fogCtl = {
  get density() { return scene.fog.density; },
  set density(v) { scene.fog.density = v; },
  get color() { return scene.fog.color; },
  baseDensity: BASE_FOG_DENSITY,
  baseColor: BASE_FOG_COLOR,
  dawnLock: 0,
};

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 400);

// ---------- UI ----------
const $ = (id) => document.getElementById(id);
const ui = {
  setPrompt: (s) => { const p = $('prompt'); p.textContent = s; p.style.opacity = s ? 1 : 0; },
  setHud: (s) => { $('hud').textContent = s; },
  fadeTo: (opacity, seconds) => {
    const f = $('fade');
    f.classList.toggle('slow', seconds > 1);
    f.style.transitionDuration = seconds + 's';
    f.style.opacity = opacity;
  },
  showMessage: (text, inS, holdS) => {
    const m = $('message');
    m.textContent = text;
    m.style.transitionDuration = inS + 's';
    m.style.opacity = 1;
    setTimeout(() => { m.style.opacity = 0; }, (inS + holdS) * 1000);
  },
  showEndCard: () => { $('endcard').style.opacity = 1; },
};

// ---------- World ----------
const valley = buildValley(scene, renderer);
const hazards = buildHazards(scene);
const player = createPlayer(camera, renderer.domElement);
scene.add(player.yaw);
const audio = createAudio();
const post = createPost(renderer, scene, camera);
const interact = createInteractions({ camera, player, valley, ui, audio, postFx: post, scene });

ui.setHud('The Valley of the Shadow of Death');

// First click: hide title, start audio, fade in.
let entered = false;
renderer.domElement.addEventListener('click', () => {
  if (entered) return;
  entered = true;
  $('title').classList.add('hidden');
  $('crosshair').classList.remove('hidden');
  audio.start();
  ui.fadeTo(0, 2.5);
});

// ---------- Respawn ----------
let respawning = false;
function stumble(kind) {
  if (respawning) return;
  respawning = true;
  player.state.enabled = false;
  ui.fadeTo(1, 0.5);
  setTimeout(() => {
    ui.showMessage('You stumble back to the path', 0.7, 1.4);
    player.respawn();
    setTimeout(() => {
      ui.fadeTo(0, 1.2);
      player.state.enabled = true;
      respawning = false;
    }, 900);
  }, 550);
}

// ---------- Resize ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Main loop ----------
const clock = new THREE.Clock();
let elapsed = 0;
const fpsBuf = [];

function tick() {
  renderer.info.reset();
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  const t = elapsed;

  player.update(dt);
  const pos = player.yaw.position;

  hazards.update(dt, t, pos);
  valley.updateQuagmire(t);
  interact.update(dt, t, fogCtl);
  audio.update(dt);

  // Sky dome rides with the player so its gradient/sun stay put on screen.
  valley.sky.position.copy(pos);

  // Breathing fog: slow asymmetric swell, unless dawn has taken over.
  if (fogCtl.dawnLock < 0.02) {
    const breathe = Math.sin(t * 0.21) * 0.5 + Math.sin(t * 0.071 + 2) * 0.5;
    scene.fog.density = BASE_FOG_DENSITY * (1 + breathe * 0.22);
  }

  // Fall check.
  if (!respawning && entered) {
    const kind = hazards.checkFall(pos);
    if (kind) stumble(kind);
  }

  post.update(dt, t, hazards.fissureProximity(pos));
  post.composer.render();

  fpsBuf.push(dt);
  if (fpsBuf.length > 120) fpsBuf.shift();

  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---------- Debug / screenshot API ----------
function setView(name) {
  const place = (z, dOff, yawAngle, pitchAngle, eyeOff = 0) => {
    const x = pathCenterX(z) + dOff;
    player.yaw.position.set(x, groundHeight(x, z) + 1.7 + eyeOff, z);
    player.yaw.rotation.y = yawAngle;
    player.pitch.rotation.x = pitchAngle;
  };
  switch (name) {
    case 'entrance': place(4.5, -0.3, -0.10, -0.04); break;
    case 'ditch': place(-30, 0, 0.62, -0.45); break;
    case 'hellmouth': place(-52.5, -0.3, -0.32, -0.14); break;
    case 'exit': place(VALLEY.zEnd + 14, -0.4, 0.12, 0.05); break;
    case 'free': place(-78, -0.2, Math.PI + 0.5, -0.12); break; // back toward the glow, mire in frame
  }
}

window.__VALLEY__ = {
  ready: false,
  setView,
  enter() { // simulate the first click for headless runs
    if (!entered) {
      entered = true;
      $('title').classList.add('hidden');
      ui.fadeTo(0, 0.1);
    }
  },
  takeLantern: () => interact.takeLantern(),
  dawn(instant = false) {
    interact.pressOn();
    if (instant) {
      for (let i = 0; i < 200; i++) interact.update(0.05, elapsed, fogCtl);
    }
  },
  advance(seconds) { // settle particles deterministically
    const steps = Math.ceil(seconds / 0.0166);
    for (let i = 0; i < steps; i++) {
      elapsed += 0.0166;
      hazards.update(0.0166, elapsed, player.yaw.position);
      valley.updateQuagmire(elapsed);
      interact.update(0.0166, elapsed, fogCtl);
    }
  },
  async fpsProbe(seconds = 5) {
    // Walk the hell-mouth crossing while measuring real frame times.
    const z0 = -50, z1 = -70;
    const t0 = performance.now();
    let frames = 0;
    return new Promise((resolve) => {
      const step = () => {
        const k = (performance.now() - t0) / (seconds * 1000);
        if (k >= 1) {
          resolve(frames / seconds);
          return;
        }
        const z = z0 + (z1 - z0) * k;
        const x = pathCenterX(z);
        player.yaw.position.set(x, groundHeight(x, z) + 1.7, z);
        player.yaw.rotation.y = 0;
        frames++;
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  },
  stats: () => ({ drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
};

// Flag ready after the world has had a moment to compile shaders.
requestAnimationFrame(() => requestAnimationFrame(() => { window.__VALLEY__.ready = true; }));
