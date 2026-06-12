// Procedural canvas-generated textures. No downloaded assets anywhere.
import * as THREE from 'three';

// Deterministic RNG so every iteration renders the same valley.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tileable value noise on a lattice of size `period`.
function makeLattice(period, rng) {
  const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
    const p = (ix, iy) => g[((iy % period + period) % period) * period + ((ix % period + period) % period)];
    const a = p(xi, yi), b = p(xi + 1, yi), c = p(xi, yi + 1), d = p(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

export function fbmFactory(seed, period = 16) {
  const rng = mulberry32(seed);
  const lattices = [];
  for (let o = 0; o < 6; o++) lattices.push(makeLattice(period, rng));
  return (x, y, octaves = 5) => {
    let v = 0, amp = 0.5, f = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      v += lattices[o](x * f, y * f) * amp;
      norm += amp; amp *= 0.5; f *= 2.07;
    }
    return v / norm;
  };
}

function canvasTexture(size, draw, { srgb = true, repeat = 1 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Sobel a grayscale height canvas into a tangent-space normal map.
function heightToNormal(heightData, size, strength = 2.0) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const out = ctx.createImageData(size, size);
  const h = (x, y) => heightData[((y % size + size) % size) * size + ((x % size + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * size + x) * 4;
      out.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out.data[i + 2] = (1 / len) * 0.5 + 0.5 > 1 ? 255 : ((1 / len) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// Charcoal rock: dark albedo with ash-grey strata, wet (low-rough) patches.
export function makeRockMaps(seed = 101) {
  const size = 512;
  const fbm = fbmFactory(seed, 8);
  const wet = fbmFactory(seed + 7, 4);
  const height = new Float32Array(size * size);

  const albedo = canvasTexture(size, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / s * 8, v = y / s * 8;
        // Strata: stretched noise bands, like an engraving's hatch lines.
        const strata = fbm(u * 1.1, v * 2.2, 4);
        const grain = fbm(u * 2.0, v * 2.0, 5);
        const cracks = Math.pow(Math.abs(fbm(u * 1.3, v * 1.3, 4) - 0.5) * 2, 0.55);
        let l = 0.10 + strata * 0.13 + grain * 0.07;
        l *= 0.45 + cracks * 0.65; // crack shadows
        height[y * s + x] = strata * 0.5 + grain * 0.5;
        const i = (y * s + x) * 4;
        // Charcoal with the faintest cold-blue cast.
        img.data[i] = l * 235;
        img.data[i + 1] = l * 240;
        img.data[i + 2] = l * 255;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });

  const roughness = canvasTexture(size, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / s * 4, v = y / s * 4;
        const w = wet(u, v, 4);             // big wet patches
        const det = fbm(u * 4, v * 4, 3);
        // wet -> rough 0.18, dry -> 0.95
        const r = w > 0.55 ? 0.16 + det * 0.12 : 0.78 + det * 0.2;
        const i = (y * s + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, r * 255);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, { srgb: false });

  const normal = heightToNormal(height, size, 3.2);
  return { albedo, roughness, normal };
}

// Dry cracked mud for the quagmire banks.
export function makeMudMaps(seed = 202) {
  const size = 512;
  const fbm = fbmFactory(seed, 8);
  const rng = mulberry32(seed);
  const height = new Float32Array(size * size);

  // Crack network: jittered voronoi cell edges.
  const pts = [];
  const N = 60;
  for (let i = 0; i < N; i++) pts.push([rng() * size, rng() * size]);
  const crackDist = (x, y) => {
    let d1 = 1e9, d2 = 1e9;
    for (const [px, py] of pts) {
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const dx = x - (px + ox * size), dy = y - (py + oy * size);
        const d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
    }
    return Math.sqrt(d2) - Math.sqrt(d1); // small near cell edges
  };

  const albedo = canvasTexture(size, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / s * 6, v = y / s * 6;
        const base = fbm(u, v, 5);
        const cd = crackDist(x, y);
        const crack = Math.min(1, cd / 7);          // 0 in crack, 1 on plate
        const l = (0.10 + base * 0.10) * (0.3 + crack * 0.8);
        height[y * s + x] = crack * 0.8 + base * 0.2;
        const i = (y * s + x) * 4;
        img.data[i] = l * 255;
        img.data[i + 1] = l * 215;
        img.data[i + 2] = l * 175;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });

  const roughness = canvasTexture(size, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = (y * s + x) * 4;
        const r = 0.85 + fbm(x / s * 5, y / s * 5, 3) * 0.15;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = r * 255;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, { srgb: false });

  const normal = heightToNormal(height, size, 4.5);
  return { albedo, roughness, normal };
}

// Lava / inner-fissure emissive: white-hot veins over ember orange.
export function makeLavaMaps(seed = 303) {
  const size = 256;
  const fbm = fbmFactory(seed, 8);
  const emissive = canvasTexture(size, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / s * 5, v = y / s * 5;
        const vein = Math.pow(1 - Math.abs(fbm(u, v, 5) - 0.5) * 2, 6);
        const glow = fbm(u * 0.7 + 9, v * 0.7, 4);
        const heat = Math.min(1, vein * 1.6 + glow * 0.35);
        const i = (y * s + x) * 4;
        img.data[i] = Math.min(255, 90 + heat * 215);
        img.data[i + 1] = Math.min(255, heat * heat * 235);
        img.data[i + 2] = Math.min(255, Math.pow(heat, 4) * 160);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
  return { emissive };
}

// Soft round sprite with falloff exponent, optional inner color -> outer color.
export function makeSoftSprite(size, inner, outer, exp = 1.6) {
  return canvasTexture(size, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const dx = (x / s - 0.5) * 2, dy = (y / s - 0.5) * 2;
        const d = Math.min(1, Math.sqrt(dx * dx + dy * dy));
        const a = Math.pow(Math.max(0, 1 - d), exp);
        const i = (y * s + x) * 4;
        img.data[i] = inner[0] + (outer[0] - inner[0]) * d;
        img.data[i + 1] = inner[1] + (outer[1] - inner[1]) * d;
        img.data[i + 2] = inner[2] + (outer[2] - inner[2]) * d;
        img.data[i + 3] = a * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

// Lumpy smoke puff: soft disc broken up by noise so edges look turbulent.
export function makeSmokeSprite(seed = 404) {
  const size = 256;
  const fbm = fbmFactory(seed, 8);
  return canvasTexture(size, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const dx = (x / s - 0.5) * 2, dy = (y / s - 0.5) * 2;
        const d = Math.sqrt(dx * dx + dy * dy);
        const n = fbm(x / s * 4, y / s * 4, 5);
        const edge = d + (n - 0.5) * 0.7;
        const a = Math.max(0, 1 - edge) * (0.5 + n * 0.5);
        const l = 28 + n * 30;
        const i = (y * s + x) * 4;
        img.data[i] = l; img.data[i + 1] = l * 0.96; img.data[i + 2] = l * 0.92;
        img.data[i + 3] = Math.pow(Math.min(1, a), 1.3) * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}
