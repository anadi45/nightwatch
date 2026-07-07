import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Film pass: vignette + animated grain + slight cool grade. Runs on the
// linear HDR buffer before OutputPass tone-maps, so the vignette multiply
// and grain add behave like light, not like screen-space stickers.
const FilmShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      // vignette — corners fall to ~45%
      float d = distance(vUv, vec2(0.5));
      float vig = mix(0.45, 1.0, 1.0 - smoothstep(0.32, 0.82, d));
      c.rgb *= vig;
      // cool grade
      c.rgb *= vec3(0.97, 1.0, 1.06);
      // animated grain, scaled down in bright areas so glow stays clean
      float n = fract(sin(dot(vUv + fract(uTime * 61.7), vec2(12.9898, 78.233))) * 43758.5453);
      c.rgb += (n - 0.5) * 0.025 / (1.0 + dot(c.rgb, vec3(1.0)));
      gl_FragColor = c;
    }
  `,
};

/**
 * Bloom + film-grade post-processing pipeline. Selective bloom works by
 * HDR color boosting: emissive materials multiply their color above 1.0
 * and the bloom threshold sits at 1.0, so only boosted pixels (eyes,
 * flames, lantern core, moon, ghost rims) bloom while the dark scene
 * passes through untouched. A film pass (vignette/grain/grade) sits
 * between bloom and output.
 */
export class PostFX {
  /** False on WebGL1 — callers must fall back to direct rendering. */
  readonly enabled: boolean;

  private composer!: EffectComposer;
  private bloomPass!: UnrealBloomPass;
  private filmPass!: ShaderPass;
  private renderer: THREE.WebGLRenderer;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    width: number,
    height: number
  ) {
    this.renderer = renderer;
    this.enabled = renderer.capabilities.isWebGL2;
    if (!this.enabled) return;

    const mobile = window.matchMedia('(pointer: coarse)').matches;
    const dpr = renderer.getPixelRatio();

    // HalfFloat keeps boosted colors >1 alive for the threshold test;
    // samples restores MSAA that the composer otherwise disables.
    const target = new THREE.WebGLRenderTarget(width * dpr, height * dpr, {
      type: THREE.HalfFloatType,
      samples: mobile ? 2 : 4,
    });

    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      mobile ? 0.55 : 0.7, // strength
      0.4, // radius
      1.0 // threshold — only HDR-boosted pixels bloom
    );
    this.composer.addPass(this.bloomPass);
    this.filmPass = new ShaderPass(FilmShader);
    this.composer.addPass(this.filmPass);
    this.composer.addPass(new OutputPass());

    this.setSize(width, height);
  }

  setSize(cssWidth: number, cssHeight: number): void {
    if (!this.enabled) return;
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(cssWidth, cssHeight);
    // composer.setSize propagates device-pixel sizes to every pass;
    // re-sizing bloom with CSS pixels afterward keeps its mip chain at
    // half CSS resolution regardless of DPR (quarter-res on dpr-2 phones).
    this.bloomPass.setSize(cssWidth, cssHeight);
  }

  render(): void {
    this.filmPass.uniforms['uTime']!.value = performance.now() * 0.001;
    this.composer.render();
  }

  dispose(): void {
    if (this.enabled) this.composer.dispose();
  }
}
