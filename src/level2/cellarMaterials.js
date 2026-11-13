// Level 2 cellar — materials (owner: world).
// Static world: MeshBasicMaterial + baked per-vertex light (attributes aL / aF, see cellarGeo MB.build):
//   light = uAmb * aL.x + uWarm * (aL.y + dot(aF, uFl) + aL.z * uFl5)   (uFl* = flicker multipliers)
// Casks (instanced): per-vertex Lambert from all bulbs in the vertex shader, per-instance visibility.
// The formulas match three's Lambert response to PointLight (I * cos / (pi d^2)) so baked surfaces and
// the moving Lambert objects lit by the 4 real lights agree.
import * as THREE from 'three';
import { BULB_RANGE, BOUNCE } from './cellarGeo.js';

export function createUniforms(nBulbs) {
  return {
    uAmb: { value: new THREE.Vector3(0.1, 0.11, 0.13) },
    uWarm: { value: new THREE.Vector3(1, 0.5, 0.2) },
    uFl: { value: new THREE.Vector4(1, 1, 1, 1) },
    uFl5: { value: 1 },
    uWhite: { value: new THREE.Color(0x9c9584) },
    uLP: { value: [0, 1, 2, 3].map(() => new THREE.Vector3(0, -50, 0)) },
    uLI: { value: [0, 0, 0, 0] },
    uBP: { value: Array.from({ length: nBulbs }, () => new THREE.Vector3()) },
    uBI: { value: new Array(nBulbs).fill(0) },
    uBulbF: { value: new Array(nBulbs).fill(1) },
  };
}

const BAKED_VERT_PARS = /* glsl */`
attribute vec4 aL;
attribute vec4 aF;
uniform vec3 uAmb;
uniform vec3 uWarm;
uniform vec4 uFl;
uniform float uFl5;
varying float vW;
varying vec3 vWPos;
`;
const BAKED_VERT_COLOR = /* glsl */`
#include <color_vertex>
vColor.rgb *= uAmb * aL.x + uWarm * (aL.y + dot(aF, uFl) + aL.z * uFl5);
vW = aL.w;
`;

/**
 * kind: 'brick' (whitewash mask in map alpha), 'floor' (wet gloss + specular from the 4 active lights),
 *       'plain' (vertex colour only), 'tex' (map * colour), 'decal' (transparent)
 */
export function bakedMaterial(kind, map, U, { specLights = 4 } = {}) {
  const opts = { vertexColors: true };
  if (map) opts.map = map;
  if (kind === 'decal') Object.assign(opts, { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
  const mat = new THREE.MeshBasicMaterial(opts);
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uAmb: U.uAmb, uWarm: U.uWarm, uFl: U.uFl, uFl5: U.uFl5, uWhite: U.uWhite, uLP: U.uLP, uLI: U.uLI });
    sh.vertexShader = BAKED_VERT_PARS + sh.vertexShader
      .replace('#include <color_vertex>', BAKED_VERT_COLOR)
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    let pars = 'varying float vW;\nvarying vec3 vWPos;\nuniform vec3 uWhite;\nuniform vec3 uWarm;\n';
    if (kind === 'brick') {
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', /* glsl */`
        vec4 tx = texture2D(map, vMapUv);
        float ww = smoothstep(tx.a - 0.1, tx.a + 0.1, vW) * 0.92;
        vec3 lime = uWhite * (0.7 + 1.2 * dot(tx.rgb, vec3(0.3333)));
        diffuseColor.rgb *= mix(tx.rgb, lime, ww);
      `);
    } else if (kind === 'floor') {
      pars += `uniform vec3 uLP[4];\nuniform float uLI[4];\n`;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <map_fragment>', /* glsl */`
          vec4 tx = texture2D(map, vMapUv);
          float wet = clamp(vW, 0.0, 1.0);
          float gloss = clamp(wet * (0.35 + 0.8 * tx.a), 0.0, 1.0);
          diffuseColor.rgb *= tx.rgb * mix(1.0, 0.55, gloss);
        `)
        .replace('#include <envmap_fragment>', /* glsl */`
          {
            vec3 V = normalize(cameraPosition - vWPos);
            float shin = mix(12.0, 420.0, gloss * gloss);
            vec3 spec = vec3(0.0);
            for (int i = 0; i < ${specLights}; i++) {
              vec3 L = uLP[i] - vWPos;
              float d2 = max(dot(L, L), 0.25);
              L *= inversesqrt(d2);
              vec3 H = normalize(L + V);
              spec += uLI[i] * pow(max(H.y, 0.0), shin) * max(L.y, 0.0) / d2;
            }
            float fres = 0.04 + 0.96 * pow(1.0 - max(V.y, 0.0), 5.0);
            outgoingLight += uWarm * spec * ((shin + 8.0) / 25.13) * fres * gloss * 0.9;
          }
        `);
    }
    sh.fragmentShader = pars + sh.fragmentShader;
  };
  mat.customProgramCacheKey = () => 'cellar-' + kind + specLights;
  return mat;
}

/** lager casks: instanced, MeshBasic + per-vertex lighting from all bulbs; instance attrs aVisA/aVisB/aVisC(vis8, tint)/aHead */
export function caskMaterial(map, U, nBulbs) {
  const mat = new THREE.MeshBasicMaterial({ map, vertexColors: true });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uAmb: U.uAmb, uWarm: U.uWarm, uBP: U.uBP, uBI: U.uBI });
    sh.vertexShader = /* glsl */`
      attribute vec4 aVisA;
      attribute vec4 aVisB;
      attribute vec2 aVisC;
      attribute float aHead;
      uniform vec3 uAmb;
      uniform vec3 uWarm;
      uniform vec3 uBP[${nBulbs}];
      uniform float uBI[${nBulbs}];
    ` + sh.vertexShader
      .replace('#include <uv_vertex>', /* glsl */`
        #include <uv_vertex>
        if (vMapUv.x > 0.499) vMapUv += vec2(mod(aHead, 2.0) * 0.25, -floor(aHead / 2.0) * 0.25);
      `)
      .replace('#include <color_vertex>', /* glsl */`
        #include <color_vertex>
        {
          vec4 cwp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vec3 cwn = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
          float vis[${Math.max(nBulbs, 9)}];
          vis[0] = aVisA.x; vis[1] = aVisA.y; vis[2] = aVisA.z; vis[3] = aVisA.w;
          vis[4] = aVisB.x; vis[5] = aVisB.y; vis[6] = aVisB.z; vis[7] = aVisB.w; vis[8] = aVisC.x;
          float L = 0.0;
          for (int i = 0; i < ${Math.min(nBulbs, 9)}; i++) {
            vec3 d = uBP[i] - cwp.xyz;
            float d2 = dot(d, d);
            float q = d2 / ${(BULB_RANGE * BULB_RANGE).toFixed(1)};
            float win = clamp(1.0 - q * q, 0.0, 1.0); win *= win;
            float nl = max(dot(cwn, d * inversesqrt(d2)), 0.0);
            L += uBI[i] * win * (vis[i] * nl / max(d2, 0.36) + ${BOUNCE.toFixed(3)} * (0.25 + 0.75 * vis[i]) / (d2 + 2.5));
          }
          L *= 0.31831;
          float ao = 0.3 + 0.7 * smoothstep(0.2, 2.1, cwp.y);
          vColor.rgb *= aVisC.y * (uAmb * ao + uWarm * L * (0.55 + 0.45 * ao));
        }
      `);
  };
  mat.customProgramCacheKey = () => 'cellar-cask' + nBulbs;
  return mat;
}

const FOG_PARS = /* glsl */`
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
`;
/** emissive bulb glass (merged; attribute aIdx) */
export function glassMaterial(U, glow) {
  return new THREE.ShaderMaterial({
    uniforms: { uBulbF: U.uBulbF, uGlow: { value: glow }, ...THREE.UniformsLib.fog },
    vertexShader: /* glsl */`
      attribute float aIdx;
      uniform float uBulbF[${U.uBulbF.value.length}];
      varying float vF; varying vec3 vN; varying vec3 vV; varying float vDepth;
      void main() {
        vF = uBulbF[int(aIdx + 0.5)];
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = -mv.xyz; vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: FOG_PARS + /* glsl */`
      uniform vec3 uGlow;
      varying float vF; varying vec3 vN; varying vec3 vV; varying float vDepth;
      void main() {
        float rim = abs(dot(normalize(vN), normalize(vV)));
        vec3 c = uGlow * vF * (0.25 + 0.75 * rim * rim) + vec3(0.02, 0.018, 0.015);
        float f = smoothstep(fogNear, fogFar, vDepth);
        gl_FragColor = vec4(mix(c, fogColor, f * 0.6), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    fog: true,
  });
}
/** additive halos around the bulbs (merged camera-facing quads; attributes aCorner, aIdx) */
export function haloMaterial(U, color, sizes) {
  return new THREE.ShaderMaterial({
    uniforms: { uBulbF: U.uBulbF, uColor: { value: color }, uSize: { value: sizes }, ...THREE.UniformsLib.fog },
    vertexShader: /* glsl */`
      attribute vec2 aCorner;
      attribute float aIdx;
      uniform float uBulbF[${sizes.length}];
      uniform float uSize[${sizes.length}];
      varying vec2 vUv; varying float vF; varying float vDepth;
      void main() {
        int i = int(aIdx + 0.5);
        vF = uBulbF[i];
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float s = uSize[i];
        mv.xy += aCorner * s;
        mv.z += min(0.3, max(0.0, -mv.z - 0.3));     // pull toward the camera so the vault does not cut it
        vUv = aCorner; vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: FOG_PARS + /* glsl */`
      uniform vec3 uColor;
      varying vec2 vUv; varying float vF; varying float vDepth;
      void main() {
        float r2 = dot(vUv, vUv);
        float g = exp(-r2 * 6.0) * 0.32 + exp(-r2 * 38.0) * 1.1;
        g *= 1.0 - smoothstep(0.6, 1.0, r2);
        g *= 1.0 - smoothstep(fogNear, fogFar, vDepth) * 0.8;
        gl_FragColor = vec4(uColor * g * vF * vF, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
  });
}
