import * as THREE from 'three';

export interface ParticleOptions {
  /** Base color; values >1 bloom under the PostFX pipeline. */
  color: THREE.Color;
  /** World-space size factor (perspective-attenuated). */
  size?: number;
  sizeJitter?: number;
  life?: number;
  lifeJitter?: number;
  /** Base velocity applied to every particle. */
  velocity?: THREE.Vector3;
  /** Random velocity magnitude added per particle. */
  spread?: number;
  /** Y acceleration per second (positive = rise). */
  gravity?: number;
  /** Fraction of velocity kept per second (1 = none lost). */
  drag?: number;
}

/**
 * Pooled particle system — one THREE.Points, one draw call, additive
 * soft-dot shader. CPU integrates positions; dead particles swap with
 * the last live one so the draw range stays contiguous.
 */
export class ParticleSystem {
  readonly points: THREE.Points;

  private capacity: number;
  private count = 0;
  private positions: Float32Array;
  private velocities: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private alphas: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private gravity: Float32Array;
  private drag: Float32Array;
  private geo: THREE.BufferGeometry;
  private mat: THREE.ShaderMaterial;

  constructor(capacity: number, fogDensity = 0) {
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 3);
    this.velocities = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    this.alphas = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage)
    );
    this.geo.setAttribute(
      'aColor',
      new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage)
    );
    this.geo.setAttribute(
      'aSize',
      new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage)
    );
    this.geo.setAttribute(
      'aAlpha',
      new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage)
    );
    this.geo.setDrawRange(0, 0);
    // large static bounds — recomputing per frame costs more than it saves
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, -12), 40);

    this.mat = new THREE.ShaderMaterial({
      uniforms: { uFogDensity: { value: fogDensity } },
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        uniform float uFogDensity;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float fog = exp(-pow(uFogDensity * -mv.z, 2.0));
          vAlpha = aAlpha * fog;
          gl_PointSize = aSize * (200.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.08, d) * vAlpha;
          gl_FragColor = vec4(vColor, a);
        }
      `,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });

    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
  }

  spawn(pos: THREE.Vector3, opts: ParticleOptions): void {
    if (this.count >= this.capacity) return;
    const i = this.count++;

    const spread = opts.spread ?? 0;
    this.positions[i * 3] = pos.x;
    this.positions[i * 3 + 1] = pos.y;
    this.positions[i * 3 + 2] = pos.z;
    this.velocities[i * 3] = (opts.velocity?.x ?? 0) + (Math.random() - 0.5) * spread;
    this.velocities[i * 3 + 1] = (opts.velocity?.y ?? 0) + (Math.random() - 0.5) * spread;
    this.velocities[i * 3 + 2] = (opts.velocity?.z ?? 0) + (Math.random() - 0.5) * spread;
    this.colors[i * 3] = opts.color.r;
    this.colors[i * 3 + 1] = opts.color.g;
    this.colors[i * 3 + 2] = opts.color.b;
    this.sizes[i] = (opts.size ?? 0.05) + Math.random() * (opts.sizeJitter ?? 0);
    const life = (opts.life ?? 0.8) + Math.random() * (opts.lifeJitter ?? 0);
    this.life[i] = life;
    this.maxLife[i] = life;
    this.alphas[i] = 1;
    this.gravity[i] = opts.gravity ?? 0;
    this.drag[i] = opts.drag ?? 1;
  }

  burst(pos: THREE.Vector3, count: number, opts: ParticleOptions): void {
    for (let n = 0; n < count; n++) this.spawn(pos, opts);
  }

  update(delta: number): void {
    let i = 0;
    while (i < this.count) {
      this.life[i]! -= delta;
      if (this.life[i]! <= 0) {
        this.swapWithLast(i);
        continue;
      }
      const dragFactor = Math.pow(this.drag[i]!, delta);
      this.velocities[i * 3]! *= dragFactor;
      this.velocities[i * 3 + 1] = this.velocities[i * 3 + 1]! * dragFactor + this.gravity[i]! * delta;
      this.velocities[i * 3 + 2]! *= dragFactor;
      this.positions[i * 3]! += this.velocities[i * 3]! * delta;
      this.positions[i * 3 + 1]! += this.velocities[i * 3 + 1]! * delta;
      this.positions[i * 3 + 2]! += this.velocities[i * 3 + 2]! * delta;
      const frac = this.life[i]! / this.maxLife[i]!;
      // quick fade-in, linear fade-out
      this.alphas[i] = frac > 0.85 ? (1 - frac) / 0.15 : frac / 0.85;
      i++;
    }

    this.geo.setDrawRange(0, this.count);
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
  }

  private swapWithLast(i: number): void {
    const last = --this.count;
    if (i === last) return;
    for (let k = 0; k < 3; k++) {
      this.positions[i * 3 + k] = this.positions[last * 3 + k]!;
      this.velocities[i * 3 + k] = this.velocities[last * 3 + k]!;
      this.colors[i * 3 + k] = this.colors[last * 3 + k]!;
    }
    this.sizes[i] = this.sizes[last]!;
    this.alphas[i] = this.alphas[last]!;
    this.life[i] = this.life[last]!;
    this.maxLife[i] = this.maxLife[last]!;
    this.gravity[i] = this.gravity[last]!;
    this.drag[i] = this.drag[last]!;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
