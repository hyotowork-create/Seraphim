// Hazards: the mouth of Hell, its fire/smoke/embers, drifting ash,
// and falling off the path into the ditch or the quagmire.
import * as THREE from 'three';
import { VALLEY, pathCenterX, groundHeight, fissureWobble } from './valley.js';
import { makeLavaMaps, makeSoftSprite, makeSmokeSprite, mulberry32 } from './textures.js';

export function buildHazards(scene) {
  const rng = mulberry32(31337);
  const fz = VALLEY.fissureZ;

  // ---- The fissure: a torn seam of light in the charred shelf ----
  const fissureGroup = new THREE.Group();
  const lava = makeLavaMaps();

  // Jagged strip following the shelf trench (d ≈ 1.6 right of path).
  const SEG = 42;
  const fissureGeo = new THREE.PlaneGeometry(2.0, 13, 4, SEG);
  fissureGeo.rotateX(-Math.PI / 2);
  {
    // Bake WORLD coordinates straight into the geometry — the seam must lie
    // exactly in the shelf trench that groundHeight() carves beside the path.
    const p = fissureGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const lx = p.getX(i), lz = p.getZ(i);
      const wz = fz + lz;
      const edge = Math.abs(lx) / 1.0; // 0 center, 1 edge
      const wx = pathCenterX(wz) + 1.6 + fissureWobble(wz) + lx * 0.75;
      const ground = groundHeight(wx, wz);
      p.setX(i, wx);
      p.setZ(i, wz);
      // Center of the seam sinks deepest; edges tuck under the trench lips.
      p.setY(i, ground + 0.06 - (1 - edge) * 0.9);
    }
    fissureGeo.computeVertexNormals();
  }
  const fissureMat = new THREE.MeshBasicMaterial({
    map: lava.emissive,
    fog: false,
    toneMapped: true,
  });
  const fissure = new THREE.Mesh(fissureGeo, fissureMat);
  fissureGroup.add(fissure);

  // Throbbing fire light over the seam.
  const fireLight = new THREE.PointLight(0xff5a14, 26, 15, 2.0);
  fireLight.position.set(pathCenterX(fz) + 1.6, groundHeight(pathCenterX(fz) + 1.6, fz) + 1.2, fz);
  scene.add(fireLight);
  // Secondary deeper glow.
  const coalLight = new THREE.PointLight(0xff7a1e, 10, 8, 2.0);
  coalLight.position.set(fireLight.position.x, fireLight.position.y - 0.6, fz + 3.5);
  scene.add(coalLight);

  scene.add(fissureGroup);

  // ---- Embers: sparks climbing out of the seam ----
  const N_EMBER = 240;
  const emberPos = new Float32Array(N_EMBER * 3);
  const emberData = []; // {vx,vy,vz,life,maxLife}
  const emberSpawn = () => {
    const t = rng();
    return {
      x: pathCenterX(fz + (t - 0.5) * 12) + 1.6 + fissureWobble(fz + (t - 0.5) * 12) + (rng() - 0.5) * 0.9,
      z: fz + (t - 0.5) * 12,
      vy: 0.8 + rng() * 1.6,
      vx: -(0.3 + rng() * 0.9), // wind pushes them across the path
      vz: (rng() - 0.5) * 0.3,
      life: 0, maxLife: 1.5 + rng() * 3.0,
    };
  };
  for (let i = 0; i < N_EMBER; i++) {
    const e = emberSpawn();
    e.life = rng() * e.maxLife; // desync
    e.y = groundHeight(e.x, e.z) + rng() * 3;
    emberData.push(e);
    emberPos[i * 3] = e.x; emberPos[i * 3 + 1] = e.y; emberPos[i * 3 + 2] = e.z;
  }
  const emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
  const emberMat = new THREE.PointsMaterial({
    size: 0.05,
    map: makeSoftSprite(32, [255, 190, 90], [255, 60, 0], 2.2),
    transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: 0xffa040,
  });
  const embers = new THREE.Points(emberGeo, emberMat);
  embers.frustumCulled = false;
  scene.add(embers);

  // ---- Smoke: ground-hugging billboards drifting ACROSS the walkway ----
  const N_SMOKE = 26;
  const smokeTex = makeSmokeSprite();
  const smokeGroup = new THREE.Group();
  const smokeData = [];
  for (let i = 0; i < N_SMOKE; i++) {
    const mat = new THREE.SpriteMaterial({
      map: smokeTex, transparent: true, depthWrite: false,
      opacity: 0, color: 0x4a4038, rotation: rng() * Math.PI * 2,
    });
    const spr = new THREE.Sprite(mat);
    const d = {
      sprite: spr,
      life: rng() * 9, maxLife: 7 + rng() * 5,
      zOff: (rng() - 0.5) * 11,
      spin: (rng() - 0.5) * 0.25,
      rise: 0.10 + rng() * 0.22,
      drift: 0.55 + rng() * 0.75,
      baseScale: 2.2 + rng() * 2.8,
    };
    smokeData.push(d);
    smokeGroup.add(spr);
  }
  scene.add(smokeGroup);

  // ---- Ash: a thin global snowfall of grief around the player ----
  const N_ASH = 500;
  const ashPos = new Float32Array(N_ASH * 3);
  const ashSeed = new Float32Array(N_ASH);
  for (let i = 0; i < N_ASH; i++) {
    ashPos[i * 3] = (rng() - 0.5) * 30;
    ashPos[i * 3 + 1] = rng() * 12;
    ashPos[i * 3 + 2] = (rng() - 0.5) * 30;
    ashSeed[i] = rng() * 10;
  }
  const ashGeo = new THREE.BufferGeometry();
  ashGeo.setAttribute('position', new THREE.BufferAttribute(ashPos, 3));
  const ashMat = new THREE.PointsMaterial({
    size: 0.035,
    map: makeSoftSprite(16, [170, 165, 158], [120, 116, 110], 1.5),
    transparent: true, depthWrite: false, opacity: 0.7,
    color: 0x8b867e,
  });
  const ash = new THREE.Points(ashGeo, ashMat);
  ash.frustumCulled = false;
  scene.add(ash);

  // ---- Update ----
  const flickerSeed = mulberry32(99);
  let flickerT = 0, flickerCur = 1, flickerNext = 1;

  function update(dt, t, playerPos) {
    // Fire light flicker: stepped noise, violent not sinusoidal.
    flickerT -= dt;
    if (flickerT <= 0) {
      flickerT = 0.04 + flickerSeed() * 0.09;
      flickerCur = flickerNext;
      flickerNext = 0.6 + flickerSeed() * 0.8;
    }
    const fl = flickerCur + (flickerNext - flickerCur) * Math.max(0, 1 - flickerT / 0.09);
    fireLight.intensity = 26 * fl;
    coalLight.intensity = 10 * (0.7 + 0.3 * fl);
    fissureMat.color.setScalar(1.4 + fl * 1.3); // pump emissive through tonemap

    // Embers.
    const ep = emberGeo.attributes.position.array;
    for (let i = 0; i < N_EMBER; i++) {
      const e = emberData[i];
      e.life += dt;
      if (e.life > e.maxLife) {
        Object.assign(e, emberSpawn());
        e.y = groundHeight(e.x, e.z) - 0.2;
      }
      const turb = Math.sin(t * 3.1 + i) * 0.4;
      e.x += (e.vx + turb * 0.3) * dt;
      e.y += e.vy * dt * (1 - e.life / e.maxLife * 0.5);
      e.z += (e.vz + Math.cos(t * 2.3 + i * 0.7) * 0.2) * dt;
      ep[i * 3] = e.x; ep[i * 3 + 1] = e.y; ep[i * 3 + 2] = e.z;
    }
    emberGeo.attributes.position.needsUpdate = true;

    // Smoke crossing the path.
    for (const d of smokeData) {
      d.life += dt;
      if (d.life > d.maxLife) {
        d.life = 0;
        d.maxLife = 7 + flickerSeed() * 5;
        d.zOff = (flickerSeed() - 0.5) * 11;
      }
      const k = d.life / d.maxLife;
      const z = fz + d.zOff + Math.sin(t * 0.2 + d.zOff) * 0.6;
      const x0 = pathCenterX(z) + 1.6;
      const x = x0 - d.life * d.drift; // crosses path toward the ditch
      const ground = Math.max(groundHeight(x, z), groundHeight(pathCenterX(z), z));
      const y = ground + 0.5 + d.life * d.rise + Math.sin(t * 0.5 + d.zOff * 2) * 0.12;
      d.sprite.position.set(x, y, z);
      const sc = d.baseScale * (0.5 + k * 1.8);
      d.sprite.scale.set(sc, sc * 0.7, 1);
      d.sprite.material.rotation += d.spin * dt;
      // Fade in fast, out slow; slightly lit from below by the fire when fresh.
      d.sprite.material.opacity = Math.min(k * 6, 1 - k) * 0.62;
      const warm = Math.max(0, 1 - d.life * 0.7);
      d.sprite.material.color.setRGB(0.34 + warm * 0.55, 0.30 + warm * 0.20, 0.27 + warm * 0.05);
    }

    // Ash falls around the player, wrapping in a 30m cube.
    const ap = ashGeo.attributes.position.array;
    for (let i = 0; i < N_ASH; i++) {
      let y = ap[i * 3 + 1] - dt * (0.25 + Math.sin(ashSeed[i]) * 0.1);
      let x = ap[i * 3] + Math.sin(t * 0.4 + ashSeed[i]) * dt * 0.5;
      if (y < -2) y += 13;
      ap[i * 3] = x; ap[i * 3 + 1] = y;
    }
    ash.position.set(playerPos.x, playerPos.y - 3, playerPos.z);
    ashGeo.attributes.position.needsUpdate = true;
  }

  // Fall detection: am I off the path and below it?
  function checkFall(playerPos) {
    const d = playerPos.x - pathCenterX(playerPos.z);
    const pathY = groundHeight(pathCenterX(playerPos.z), playerPos.z);
    if (playerPos.y - 1.7 < pathY - 1.1) {
      return d < 0 ? 'ditch' : 'mire';
    }
    return null;
  }

  // How close is the player to the fissure (for chromatic aberration)?
  function fissureProximity(playerPos) {
    const dx = playerPos.x - (pathCenterX(fz) + 1.6);
    const dz = playerPos.z - fz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    return THREE.MathUtils.clamp(1 - dist / 12, 0, 1);
  }

  return { update, checkFall, fissureProximity, fireLight };
}
