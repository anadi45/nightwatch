import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/**
 * Bloom post-processing pipeline. Selective bloom works by HDR color
 * boosting: emissive materials multiply their color above 1.0 and the
 * bloom threshold sits at 1.0, so only boosted pixels (eyes, flames,
 * lantern core, moon, ghost rims) bloom while the dark scene passes
 * through untouched.
 */
export class PostFX {
  /** False on WebGL1 — callers must fall back to direct rendering. */
  readonly enabled: boolean;

  private composer!: EffectComposer;
  private bloomPass!: UnrealBloomPass;
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
    this.composer.render();
  }

  dispose(): void {
    if (this.enabled) this.composer.dispose();
  }
}
