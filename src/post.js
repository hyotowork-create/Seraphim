// Post stack: N8AO -> bloom -> tonemap/output -> vignette+grain+CA.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { N8AOPass } from 'n8ao';

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 1.15 },
    uGrain: { value: 0.055 },
    uAberration: { value: 0.0 },   // pumped near the fissure
    uLift: { value: 0.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uAberration, uLift;
    varying vec2 vUv;

    float hash(vec2 p) {
      // gl_FragCoord-based with a per-frame jitter offset; avoids UV moiré.
      vec2 q = p + fract(uTime * vec2(17.31, 9.137)) * 113.0;
      return fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;
      vec2 fromCenter = uv - 0.5;
      float r2 = dot(fromCenter, fromCenter);

      // Chromatic aberration, radial, scaled by proximity uniform.
      float ca = (0.0015 + uAberration * 0.006) * r2 * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + fromCenter * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - fromCenter * ca).b;

      // Film grain, luminance-weighted so shadows crawl.
      float g = (hash(gl_FragCoord.xy) - 0.5);
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col += g * uGrain * (1.0 - lum * 0.7);

      // Vignette.
      float vig = 1.0 - smoothstep(0.18, 0.85, r2 * uVignette);
      col *= 0.25 + vig * 0.75;

      col += uLift;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function createPost(renderer, scene, camera) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const composer = new EffectComposer(renderer);
  const size = renderer.getSize(new THREE.Vector2());

  composer.addPass(new RenderPass(scene, camera));

  const n8ao = new N8AOPass(scene, camera, size.x, size.y);
  n8ao.configuration.aoRadius = 2.2;
  n8ao.configuration.distanceFalloff = 3.0;
  n8ao.configuration.intensity = 4.0;
  n8ao.configuration.halfRes = true;
  n8ao.setQualityMode('Medium');
  composer.addPass(n8ao);

  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.5, 0.5, 0.88);
  composer.addPass(bloom);

  composer.addPass(new OutputPass());

  const finalPass = new ShaderPass(FinalShader);
  composer.addPass(finalPass);

  function setSize(w, h) {
    composer.setSize(w, h);
    n8ao.setSize(w, h);
    bloom.setSize(w, h);
  }

  function update(dt, t, aberration) {
    finalPass.uniforms.uTime.value = t % 100;
    finalPass.uniforms.uAberration.value = aberration;
  }

  return { composer, n8ao, bloom, finalPass, setSize, update };
}
