// The valley itself: terrain, cliff walls, quagmire surface, sky, props.
import * as THREE from 'three';
import { makeRockMaps, makeMudMaps, makeSoftSprite, fbmFactory, mulberry32 } from './textures.js';

export const VALLEY = {
  zStart: 6,        // entrance (player spawns here)
  zEnd: -122,       // exit ridge
  pathHalfWidth: 1.05,
  fissureZ: -60,
  quagmireLevel: -2.1,
};

// Path meanders gently down the valley.
export function pathCenterX(z) {
  return Math.sin(z * 0.045) * 3.0 + Math.sin(z * 0.013 + 1.7) * 4.0;
}

const terrainNoise = fbmFactory(7321, 16);

// The seam of the hell-mouth wanders; terrain trench and glow mesh share this.
export function fissureWobble(z) {
  return Math.sin(z * 1.7) * 0.35 + Math.sin(z * 3.3 + 2) * 0.18;
}

// d > 0 is the quagmire side (right when walking toward -z), d < 0 the ditch.
export function groundHeight(x, z) {
  const d = x - pathCenterX(z);
  const hw = VALLEY.pathHalfWidth;
  const micro = (terrainNoise(x * 0.35 + 40, z * 0.35 + 40, 4) - 0.5);
  let h;

  // Rocky shelf carrying the hell-mouth fissure (right side, mid valley).
  const fz = Math.exp(-Math.pow((z - VALLEY.fissureZ) / 6.5, 2));

  if (d < -hw) {
    // Ditch: a fast plunge into nothing, walls broken into crags.
    const t = -d - hw;
    h = -Math.pow(t, 1.7) * 4.0 + micro * 0.4;
    h += (terrainNoise(x * 0.16 + 7, z * 0.16, 4) - 0.5) * Math.min(t, 5) * 2.2;
    if (h < -45) h = -45;
  } else if (d > hw) {
    const t = d - hw;
    // Quagmire banks slump down to the mire level...
    const bank = Math.max(VALLEY.quagmireLevel - 0.55,
      -Math.pow(Math.min(t, 4) / 4, 1.4) * (0.55 - VALLEY.quagmireLevel) * 1.18);
    // ...except by the fissure, where a charred shelf rises beside the path.
    let shelf = 0.18 + micro * 0.5;
    const dd = d - (1.6 + fissureWobble(z)); // trench follows the glowing seam
    const crack = Math.exp(-Math.pow(dd / 0.7, 2));
    shelf -= crack * 3.0;
    h = bank * (1 - fz) + shelf * fz;
  } else {
    // The path: worn nearly flat, slight crown.
    h = micro * 0.18 + (1 - Math.pow(d / hw, 2)) * 0.05;
  }

  // Valley floor dips toward the middle then climbs to the exit ridge.
  const along = (z - VALLEY.zStart) / (VALLEY.zEnd - VALLEY.zStart); // 0..1
  h += Math.sin(along * Math.PI) * -1.6;
  if (along > 0.86) h += Math.pow((along - 0.86) / 0.14, 2) * 5.0; // exit climb

  // Cliff walls far out on both flanks, heavily cragged.
  const ad = Math.abs(d);
  if (ad > 11) {
    const rise = ad - 11;
    h += Math.pow(rise * 0.42, 2.1) * (2.2 + terrainNoise(x * 0.08, z * 0.08, 3) * 2.5);
    h += (terrainNoise(x * 0.13 + 21, z * 0.13 + 5, 5) - 0.5) * Math.min(rise, 8) * 3.4;
  }
  return h;
}

function buildTerrain(rockMaps, mudMaps) {
  const width = 90, length = 150;
  const segX = 200, segZ = 340;
  const geo = new THREE.PlaneGeometry(width, length, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  const zMid = (VALLEY.zStart + VALLEY.zEnd) / 2;
  geo.translate(0, 0, zMid);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, groundHeight(x, z));

    const d = x - pathCenterX(z);
    const fz = Math.exp(-Math.pow((z - VALLEY.fissureZ) / 7.5, 2));
    const n = terrainNoise(x * 0.5, z * 0.5, 3);

    if (Math.abs(d) <= VALLEY.pathHalfWidth + 0.35) {
      // Worn ash-pale path so it reads even in near-dark.
      col.setRGB(0.62 + n * 0.18, 0.60 + n * 0.17, 0.55 + n * 0.15);
    } else if (d > VALLEY.pathHalfWidth) {
      // Mud flats on the quagmire side.
      col.setRGB(0.30 + n * 0.10, 0.25 + n * 0.08, 0.20 + n * 0.06);
    } else {
      // Ditch side: cold dead grey swallowed by black — bottomless.
      const depth = Math.min(1, Math.max(0, -groundHeight(x, z) / 6));
      const l = (0.30 + n * 0.10) * Math.pow(1 - depth, 2.6);
      col.setRGB(l * 0.95, l, l * 1.1);
    }
    // High cliffs sink into silhouette (hides UV stretch, deepens the engraving look).
    const ad = Math.abs(d);
    if (ad > 8) {
      const sink = Math.min(1, (ad - 8) / 7);
      col.multiplyScalar(1 - sink * 0.55);
    }
    // Charring near the fissure overrides everything.
    if (fz > 0.12 && d > -1) {
      const charAmt = Math.min(1, fz * 1.4);
      col.lerp(new THREE.Color(0.05, 0.04, 0.035), charAmt * 0.85);
    }
    colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    map: rockMaps.albedo,
    roughnessMap: rockMaps.roughness,
    normalMap: rockMaps.normal,
    normalScale: new THREE.Vector2(1.4, 1.4),
    vertexColors: true,
    roughness: 1.0,
    metalness: 0.0,
    envMapIntensity: 0.18,
  });
  rockMaps.albedo.repeat.set(26, 64);
  rockMaps.roughness.repeat.set(26, 64);
  rockMaps.normal.repeat.set(26, 64);

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

// Kit-bashed rocks lining the cliffs and the path edges.
// Takes its own texture set (low repeat) so boulders don't tile like fishskin.
function buildRocks(rockMaps) {
  const rng = mulberry32(5150);
  const proto = new THREE.IcosahedronGeometry(1, 3);
  // Ridged-noise crumple: sharp creases, hewn stone rather than a dimpled dome.
  const p = proto.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    const n = terrainNoise(v.x * 1.3 + 9, v.y * 1.3 + v.z * 0.9, 4);
    const ridge = 1 - 2 * Math.abs(n - 0.5); // creased
    const s = 0.72 + ridge * 0.55 + (terrainNoise(v.x * 3 + 4, v.z * 3, 3) - 0.5) * 0.3;
    v.multiplyScalar(s);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  proto.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    map: rockMaps.albedo, roughnessMap: rockMaps.roughness,
    normalMap: rockMaps.normal, normalScale: new THREE.Vector2(2.0, 2.0),
    roughness: 1, metalness: 0, color: 0x4a4e58, envMapIntensity: 0.22,
  });

  const COUNT = 420;
  const inst = new THREE.InstancedMesh(proto, mat, COUNT);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  let placed = 0;
  while (placed < COUNT) {
    const z = VALLEY.zEnd - 6 + rng() * (VALLEY.zStart - VALLEY.zEnd + 14);
    const side = rng() < 0.5 ? -1 : 1;
    // Cluster on cliff flanks and along the ditch lip.
    const band = rng();
    let d;
    if (band < 0.25) d = side * (VALLEY.pathHalfWidth + 0.5 + rng() * 1.6); // path edge boulders
    else d = side * (9 + rng() * 16); // cliff rubble
    const x = pathCenterX(z) + d;
    const y = groundHeight(x, z);
    if (y < -18) continue; // don't float in the ditch void
    const s = band < 0.25 ? 0.25 + rng() * 0.6 : 0.8 + rng() * 3.4;
    e.set(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI);
    q.setFromEuler(e);
    m.compose(
      new THREE.Vector3(x, y + s * 0.25, z),
      q,
      new THREE.Vector3(s * (0.7 + rng() * 0.8), s * (0.5 + rng() * 0.9), s * (0.7 + rng() * 0.8))
    );
    inst.setMatrixAt(placed, m);
    placed++;
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.receiveShadow = true;
  inst.castShadow = true;
  return inst;
}

export function buildValley(scene, renderer) {
  const rockMaps = makeRockMaps();
  const mudMaps = makeMudMaps();
  mudMaps.normal.repeat.set(10, 40);

  const terrain = buildTerrain(rockMaps, mudMaps);
  scene.add(terrain);

  const boulderMaps = makeRockMaps(909); // separate instance: repeat stays (1,1)
  const rocks = buildRocks(boulderMaps);
  scene.add(rocks);

  // ---- Quagmire skin ----
  const qGeo = new THREE.PlaneGeometry(34, 150, 40, 130);
  qGeo.rotateX(-Math.PI / 2);
  qGeo.translate(21, VALLEY.quagmireLevel, (VALLEY.zStart + VALLEY.zEnd) / 2);
  const qMat = new THREE.MeshStandardMaterial({
    color: 0x17120b, roughness: 0.2, metalness: 0,
    normalMap: mudMaps.normal, normalScale: new THREE.Vector2(0.55, 0.55),
    envMapIntensity: 1.0,
  });
  let qShader = null;
  qMat.onBeforeCompile = (s) => {
    s.uniforms.uTime = { value: 0 };
    s.vertexShader = 'uniform float uTime;\n' + s.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       transformed.y += sin(uTime * 0.5 + position.x * 0.8 + position.z * 0.5) * 0.05
                      + sin(uTime * 0.27 + position.z * 1.3 + position.x * 0.3) * 0.04;`
    );
    qShader = s;
  };
  const quagmire = new THREE.Mesh(qGeo, qMat);
  scene.add(quagmire);

  // Bubbles rising through the skin.
  const NB = 30;
  const bubbleGeo = new THREE.SphereGeometry(1, 10, 6);
  const bubbleMat = new THREE.MeshStandardMaterial({
    color: 0x201810, roughness: 0.12, metalness: 0, envMapIntensity: 1.3,
  });
  const bubbles = new THREE.InstancedMesh(bubbleGeo, bubbleMat, NB);
  const bRng = mulberry32(8181);
  const bState = [];
  for (let i = 0; i < NB; i++) {
    const z = VALLEY.zEnd + 8 + bRng() * (VALLEY.zStart - VALLEY.zEnd - 12);
    bState.push({
      x: pathCenterX(z) + 3.5 + bRng() * 9,
      z,
      phase: bRng() * 10,
      speed: 0.25 + bRng() * 0.5,
      size: 0.10 + bRng() * 0.22,
    });
  }
  scene.add(bubbles);

  const _m = new THREE.Matrix4();
  function updateQuagmire(t) {
    if (qShader) qShader.uniforms.uTime.value = t;
    for (let i = 0; i < NB; i++) {
      const b = bState[i];
      const c = (t * b.speed + b.phase) % 4; // 4s cycle: swell, pop, gone
      let s = 0.0001, y = VALLEY.quagmireLevel - 0.2;
      if (c < 2.6) {
        const k = c / 2.6;
        s = b.size * Math.sin(k * Math.PI * 0.5);
        y = VALLEY.quagmireLevel - b.size * 0.6 + k * b.size * 0.75;
      }
      _m.makeScale(s, s * 0.8, s);
      _m.setPosition(b.x, y, b.z);
      bubbles.setMatrixAt(i, _m);
    }
    bubbles.instanceMatrix.needsUpdate = true;
  }

  // ---- Sky dome ----
  const skyUniforms = {
    uTop: { value: new THREE.Color(0x030611) },
    uBottom: { value: new THREE.Color(0x000001) },
    uDawn: { value: 0 },
    uDawnDir: { value: new THREE.Vector3(0.05, 0.05, -1).normalize() },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(380, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: skyUniforms,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uTop; uniform vec3 uBottom; uniform float uDawn; uniform vec3 uDawnDir;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 col = mix(uBottom, uTop, pow(h, 0.55));
          float toward = clamp(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uDawnDir.x, 0.0, uDawnDir.z))), 0.0, 1.0);
          float horizon = exp(-d.y * 5.5) * step(0.0, d.y);
          vec3 gold = vec3(1.0, 0.62, 0.28);
          vec3 coldBlue = vec3(0.45, 0.60, 0.95);
          vec3 dawnCol = mix(coldBlue, gold, horizon) * pow(toward, 2.0);
          col += dawnCol * uDawn * (0.14 + horizon * 0.3);
          // The sun itself: a low gold disc with a tight halo, not a white wash.
          float sunDot = clamp(dot(d, normalize(uDawnDir)), 0.0, 1.0);
          col += gold * uDawn * (pow(sunDot, 350.0) * 3.0 + pow(sunDot, 40.0) * 0.6);
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
  );
  scene.add(sky);

  // ---- Lights: scarcity is the point ----
  const hemi = new THREE.HemisphereLight(0x202c44, 0x000000, 0.09);
  scene.add(hemi);
  // Faint cold rim from the unseen sky, raking down the cliffs.
  const rim = new THREE.DirectionalLight(0x33415e, 0.14);
  rim.position.set(18, 60, 30);
  scene.add(rim);

  // Dawn rig: dead until the exit interaction.
  const dawnSun = new THREE.DirectionalLight(0xffc97a, 0);
  dawnSun.position.set(8, 18, VALLEY.zEnd - 60);
  dawnSun.target.position.set(0, 0, VALLEY.zEnd + 30);
  scene.add(dawnSun, dawnSun.target);
  const dawnAmbient = new THREE.HemisphereLight(0x9db8e8, 0x4a3a28, 0);
  scene.add(dawnAmbient);
  // A broad gold halo low past the gate — the sun bleeding through the mist.
  const dawnGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeSoftSprite(128, [255, 200, 120], [255, 120, 40], 2.0),
    transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false,
  }));
  dawnGlow.scale.set(42, 24, 1);
  dawnGlow.position.set(pathCenterX(VALLEY.zEnd) + 4, 5, VALLEY.zEnd - 35);
  scene.add(dawnGlow);

  // ---- Props ----
  const props = {};

  // Lantern on a leaning post at the entrance.
  const lanternGroup = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: 0x2b2622, roughness: 0.9 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.7, 7), postMat);
  post.position.y = 0.85;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), postMat);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(-0.22, 1.66, 0);
  const cage = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.13, 0.26, 6, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x1a1714, roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide })
  );
  cage.position.set(-0.44, 1.5, 0);
  const flame = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 8, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.35, 0.5) }) // >1 so bloom catches it
  );
  flame.position.copy(cage.position);
  const lanternLight = new THREE.PointLight(0xff9a3d, 14, 9, 1.8);
  lanternLight.position.copy(cage.position);
  lanternGroup.add(post, arm, cage, flame, lanternLight);
  const lz = 1.5;
  lanternGroup.position.set(pathCenterX(lz) + 1.15, groundHeight(pathCenterX(lz) + 1.15, lz), lz);
  lanternGroup.rotation.z = -0.06;
  scene.add(lanternGroup);
  props.lantern = { group: lanternGroup, cage, flame, light: lanternLight, hitMesh: cage };

  // Prayer stone past the hell mouth: a leaning standing stone.
  const stoneGeo = new THREE.BoxGeometry(0.55, 1.5, 0.34);
  {
    const p = stoneGeo.attributes.position;
    const rng = mulberry32(444);
    for (let i = 0; i < p.count; i++) {
      p.setX(i, p.getX(i) + (rng() - 0.5) * 0.09);
      p.setZ(i, p.getZ(i) + (rng() - 0.5) * 0.09);
    }
    stoneGeo.computeVertexNormals();
  }
  const stone = new THREE.Mesh(stoneGeo, new THREE.MeshStandardMaterial({
    map: rockMaps.albedo, roughness: 0.85, color: 0x6e7280,
    normalMap: rockMaps.normal,
  }));
  const sz = -72;
  stone.position.set(pathCenterX(sz) - 1.45, groundHeight(pathCenterX(sz) - 1.45, sz) + 0.7, sz);
  stone.rotation.set(0.05, 0.6, 0.08);
  stone.castShadow = true;
  scene.add(stone);
  props.prayerStone = { mesh: stone, hitMesh: stone };

  // Exit ridge: two gate pillars framing the dawn.
  const pillarMat = new THREE.MeshStandardMaterial({
    map: rockMaps.albedo, roughness: 1, color: 0x4e525c, normalMap: rockMaps.normal,
  });
  const pz = VALLEY.zEnd + 2;
  for (const side of [-1, 1]) {
    const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.55 + 0.2 * side, 0.95, 7, 7), pillarMat);
    const px = pathCenterX(pz) + side * 4.3;
    pil.position.set(px, groundHeight(px, pz) + 2.8, pz);
    pil.rotation.z = side * 0.07;
    scene.add(pil);
  }
  // A waymark cairn the player presses on at.
  const cairn = new THREE.Group();
  const cRng = mulberry32(777);
  for (let i = 0; i < 5; i++) {
    const s = 0.34 - i * 0.05;
    const r = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), pillarMat);
    r.position.set((cRng() - 0.5) * 0.1, 0.18 + i * 0.30, (cRng() - 0.5) * 0.1);
    r.scale.y = 0.6;
    cairn.add(r);
  }
  const cz = VALLEY.zEnd + 4;
  cairn.position.set(pathCenterX(cz) + 1.3, groundHeight(pathCenterX(cz) + 1.3, cz), cz);
  scene.add(cairn);
  props.exitCairn = { group: cairn, hitMesh: cairn.children[2] };

  // ---- PMREM environment: a dark void with one ember-orange wound ----
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(
    new THREE.SphereGeometry(50, 16, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          vec3 col = mix(vec3(0.001,0.001,0.002), vec3(0.005,0.008,0.018), clamp(d.y,0.,1.));
          float fire = pow(clamp(dot(d, normalize(vec3(0.7,-0.15,0.2))), 0., 1.), 8.0);
          col += vec3(1.0,0.35,0.08) * fire * 0.35;
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
  ));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(envScene, 0.08);
  scene.environment = envRT.texture;
  pmrem.dispose();

  return {
    groundHeight,
    pathCenterX,
    props,
    sky,
    skyUniforms,
    dawn: { sun: dawnSun, ambient: dawnAmbient, glow: dawnGlow },
    baseLights: { hemi, rim },
    updateQuagmire,
  };
}
