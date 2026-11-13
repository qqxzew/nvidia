import * as THREE from 'three';

// One-pass "hand-coloured postcard" look: scene -> HDR target -> fullscreen pass that does
// tone mapping, warm sepia grade, soft lifted blacks, vignette and a hint of paper grain,
// then the sRGB output conversion. Cheap enough for mid-range phones.

export function createGrading(renderer, { samples = 0 } = {}) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples,
    depthBuffer: true,
  });

  const material = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: target.texture },
      uTime: { value: 0 },
      uSepia: { value: 0.22 },
      uVignette: { value: 0.38 },
      uGrain: { value: 0.03 },
      uFlash: { value: 0 },
      uFade: { value: 0 },                          // dip to dark (menu dissolves)
      uContrast: { value: 1 },
      uSun: { value: new THREE.Vector3(0.5, 0.5, 0) }, // sun position in uv + glow strength
      uAspect: { value: 1 },
      uExposure: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tScene;
      uniform float uTime, uSepia, uVignette, uGrain, uFlash, uFade, uContrast, uAspect, uExposure;
      uniform vec3 uSun;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec3 c = texture2D(tScene, vUv).rgb;
        c *= uExposure;
        #ifdef TONE_MAPPING
          c = toneMapping(c);
        #endif
        // sun glow + a faint horizontal (anamorphic) streak, added before the grade so it gets warmed too
        if (uSun.z > 0.0) {
          vec2 dv = (vUv - uSun.xy) * vec2(uAspect, 1.0);
          float d2 = dot(dv, dv);
          vec3 glow = vec3(1.0, 0.78, 0.5) * (exp(-d2 * 9.0) * 0.55 + exp(-d2 * 90.0) * 0.6);
          glow += vec3(1.0, 0.82, 0.6) * exp(-abs(dv.y) * 70.0) * exp(-abs(dv.x) * 2.2) * 0.22;
          c += glow * uSun.z;
        }
        c = (c - 0.5) * uContrast + 0.5;
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        vec3 sepia = vec3(l * 1.08, l * 0.96, l * 0.80);
        c = mix(c, sepia, uSepia);
        c *= vec3(1.03, 1.0, 0.93);
        c = mix(vec3(0.045, 0.035, 0.03), vec3(1.0, 0.975, 0.92), c); // lifted blacks, creamy whites
        vec2 d = vUv - 0.5;
        float vig = smoothstep(0.85, 0.25, length(d * vec2(1.15, 1.0)));
        c *= mix(1.0 - uVignette, 1.0, vig);
        float g = hash(vUv * 1000.0 + fract(uTime) * 37.0) - 0.5;
        c += g * uGrain;
        c = mix(c, vec3(1.0, 0.35, 0.25), uFlash);
        c = mix(c, vec3(0.03, 0.022, 0.015), uFade);
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
        #include <colorspace_fragment>
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const postScene = new THREE.Scene();
  postScene.add(quad);
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  material.uniforms.uAspect.value = size.x / Math.max(1, size.y);
  return {
    material,
    setSize(w, h) { target.setSize(w, h); material.uniforms.uAspect.value = w / Math.max(1, h); },
    render(scene, camera, time) {
      material.uniforms.uTime.value = time;
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(postScene, postCam);
    },
  };
}
