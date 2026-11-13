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
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tScene;
      uniform float uTime, uSepia, uVignette, uGrain, uFlash;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec3 c = texture2D(tScene, vUv).rgb;
        #ifdef TONE_MAPPING
          c = toneMapping(c);
        #endif
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

  return {
    material,
    setSize(w, h) { target.setSize(w, h); },
    render(scene, camera, time) {
      material.uniforms.uTime.value = time;
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(postScene, postCam);
    },
  };
}
