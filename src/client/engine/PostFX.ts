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
      // gentle vignette — starts well off-centre, corners keep ~72%.
      // (The old 0.32→45% curve read as CRT corner shadowing.)
      float d = distance(vUv, vec2(0.5));
      float vig = mix(0.72, 1.0, 1.0 - smoothstep(0.45, 0.85, d));
      c.rgb *= vig;
      // cool grade
      c.rgb *= vec3(0.97, 1.0, 1.06);
      // whisper of animated dither — just enough to break gradient banding
      // in the sky, far below visible "TV static" level (was 0.025)
      float n = fract(sin(dot(vUv + fract(uTime * 61.7), vec2(12.9898, 78.233))) * 43758.5453);
      c.rgb += (n - 0.5) * 0.006;
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
  private mobile = false;

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
    this.mobile = mobile;
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
      0.3, // radius — tighter halo; 0.4 smeared glows into a soft wash
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
    const dpr = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(cssWidth, cssHeight);
    // composer.setSize propagates device-pixel sizes to every pass, so
    // bloom must be re-sized after it. UnrealBloom's mip0 is half its
    // input: plain CSS size meant quarter-device-res glow on dpr-2
    // phones — the blocky "old TV" smear. Scale toward device res,
    // capped for the mobile GPU budget.
    const bloomScale = Math.min(dpr, this.mobile ? 1.5 : 2);
    this.bloomPass.setSize(cssWidth * bloomScale, cssHeight * bloomScale);
  }

  render(): void {
    this.filmPass.uniforms['uTime']!.value = performance.now() * 0.001;
    this.composer.render();
  }

  dispose(): void {
    if (this.enabled) this.composer.dispose();
  }
}
