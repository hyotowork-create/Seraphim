// First-person controller: pointer lock, WASD, head bob, capsule-on-ground.
import * as THREE from 'three';
import { groundHeight, pathCenterX, VALLEY } from './valley.js';

const EYE_HEIGHT = 1.7;
const WALK_SPEED = 3.1;
const GRAVITY = 14;

export function createPlayer(camera, domElement) {
  const yaw = new THREE.Object3D();
  const pitch = new THREE.Object3D();
  yaw.add(pitch);
  pitch.add(camera);
  camera.position.set(0, 0, 0);

  const startZ = VALLEY.zStart - 2;
  yaw.position.set(pathCenterX(startZ), groundHeight(pathCenterX(startZ), startZ) + EYE_HEIGHT, startZ);
  yaw.rotation.y = 0; // face down the valley (-z)

  const state = {
    keys: {},
    locked: false,
    enabled: true,       // false during respawn/endcard
    velY: 0,
    grounded: true,
    bobPhase: 0,
    lastSafe: new THREE.Vector3().copy(yaw.position),
    fallen: null,        // 'ditch' | 'mire' while falling
  };

  domElement.addEventListener('click', () => {
    if (!state.locked) domElement.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === domElement;
  });
  document.addEventListener('mousemove', (e) => {
    if (!state.locked || !state.enabled) return;
    yaw.rotation.y -= e.movementX * 0.0021;
    pitch.rotation.x -= e.movementY * 0.0021;
    pitch.rotation.x = THREE.MathUtils.clamp(pitch.rotation.x, -1.45, 1.45);
  });
  document.addEventListener('keydown', (e) => { state.keys[e.code] = true; });
  document.addEventListener('keyup', (e) => { state.keys[e.code] = false; });

  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), move = new THREE.Vector3();

  function update(dt) {
    if (!state.enabled) return;

    move.set(0, 0, 0);
    if (state.locked) {
      fwd.set(0, 0, -1).applyQuaternion(yaw.quaternion);
      right.set(1, 0, 0).applyQuaternion(yaw.quaternion);
      if (state.keys['KeyW']) move.add(fwd);
      if (state.keys['KeyS']) move.sub(fwd);
      if (state.keys['KeyD']) move.add(right);
      if (state.keys['KeyA']) move.sub(right);
    }
    const moving = move.lengthSq() > 0;
    if (moving) move.normalize().multiplyScalar(WALK_SPEED * dt);

    // Capsule radius vs. terrain: probe the destination, refuse steep climbs.
    const nx = yaw.position.x + move.x;
    const nz = yaw.position.z + move.z;
    const hereY = groundHeight(yaw.position.x, yaw.position.z);
    const thereY = groundHeight(nx, nz);
    if (thereY - hereY < 0.55) { // step limit; cliffs and boulders block
      yaw.position.x = nx;
      yaw.position.z = nz;
    } else {
      // Try sliding along each axis.
      if (groundHeight(nx, yaw.position.z) - hereY < 0.55) yaw.position.x = nx;
      else if (groundHeight(yaw.position.x, nz) - hereY < 0.55) yaw.position.z = nz;
    }

    // Keep inside the valley bounds.
    yaw.position.z = THREE.MathUtils.clamp(yaw.position.z, VALLEY.zEnd - 2, VALLEY.zStart + 3);

    // Vertical: stick to ground unless the ground has left us (stepped off an edge).
    const gy = groundHeight(yaw.position.x, yaw.position.z) + EYE_HEIGHT;
    const feetGap = yaw.position.y - gy;
    if (feetGap > 0.12) {
      state.velY -= GRAVITY * dt;
      yaw.position.y += state.velY * dt;
      state.grounded = false;
      if (yaw.position.y < gy) { yaw.position.y = gy; state.velY = 0; state.grounded = true; }
    } else {
      // Smooth snap to terrain so stairsteps don't jolt.
      yaw.position.y = THREE.MathUtils.lerp(yaw.position.y, gy, Math.min(1, dt * 12));
      state.velY = 0;
      state.grounded = true;
    }

    // Remember the last spot that was safely ON the path.
    const d = Math.abs(yaw.position.x - pathCenterX(yaw.position.z));
    if (state.grounded && d < VALLEY.pathHalfWidth * 0.9) {
      state.lastSafe.copy(yaw.position);
    }

    // Head bob: subtle, speed-gated, settles when still.
    if (moving && state.grounded) {
      state.bobPhase += dt * 7.2;
      camera.position.y = Math.sin(state.bobPhase) * 0.045;
      camera.position.x = Math.cos(state.bobPhase * 0.5) * 0.025;
    } else {
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, 0, dt * 6);
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, 0, dt * 6);
    }
  }

  function respawn() {
    yaw.position.copy(state.lastSafe);
    state.velY = 0;
    state.grounded = true;
  }

  return { yaw, pitch, camera, state, update, respawn, EYE_HEIGHT };
}
