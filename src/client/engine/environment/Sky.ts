import * as THREE from 'three';

const SKY_RADIUS = 60;
const STAR_COUNT = 200;

/**
 * Night sky for the silhouette-horror look: a luminous moonlit horizon
 * band that every black cutout layer reads against, twinkling stars, a
 * large low moon, and hazy hill ridges layered like a paper-cut diorama.
 * All elements use fog-free materials — they sit conceptually beyond the
 * fog, and FogExp2 at 50+ units would otherwise erase them entirely.
 */
export class Sky {
  readonly group: THREE.Group;
  private starMat: THREE.ShaderMaterial;

  constructor() {
    this.group = new THREE.Group();
    this.buildDome();
    this.starMat = this.buildStars();
    this.buildMoon();
    this.buildHills();
  }

  private buildDome(): void {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uHorizon: { value: new THREE.Color(0x5a6f9a) },
        uZenith: { value: new THREE.Color(0x0a0e22) },
        uMoonDir: { value: new THREE.Vector3(-6, 10, -46).normalize() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uHorizon;
        uniform vec3 uZenith;
        uniform vec3 uMoonDir;
        varying vec3 vPos;
        void main() {
          vec3 dir = normalize(vPos);
          float h = clamp(dir.y, 0.0, 1.0);
          // 0.45 exponent keeps the bright band hugging the horizon —
          // it's what silhouettes cut against, not a lit whole sky
          vec3 col = mix(uHorizon, uZenith, pow(h, 0.45));
          // haze around the moon — tight, so the sky glow stays modest
          float moonGlow = pow(max(dot(dir, uMoonDir), 0.0), 14.0);
          col += vec3(0.06, 0.07, 0.10) * moonGlow;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 16, 12), mat);
    dome.renderOrder = -2;
    this.group.add(dome);
  }

  // ─── HILL RIDGES (paper-cut layers against the horizon glow) ──────
  // Hand-colored per layer — farther = lighter, exactly what distance fog
  // does to the playfield, so the diorama depth reads as one system.
  private buildRidge(z: number, height: number, color: number, seed: number): void {
    const width = 170;
    const segs = 28;
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, -2);
    for (let i = 0; i <= segs; i++) {
      const x = -width / 2 + (i / segs) * width;
      const rolling =
        (0.55 + 0.45 * Math.sin(i * 0.9 + seed)) * (0.6 + 0.4 * Math.sin(i * 0.37 + seed * 2.3));
      shape.lineTo(x, height * rolling);
    }
    shape.lineTo(width / 2, -2);
    shape.closePath();
    const ridge = new THREE.Mesh(
      new THREE.ShapeGeometry(shape, 1),
      new THREE.MeshBasicMaterial({ color, fog: false })
    );
    ridge.position.z = z;
    this.group.add(ridge);
  }

  private buildHills(): void {
    this.buildRidge(-52, 9, 0x2e3a58, 1.7); // far — palest, just off the sky band
    this.buildRidge(-46, 6, 0x1a2238, 4.2); // near — darker, can bite into the moon
  }

  private buildStars(): THREE.ShaderMaterial {
    const positions = new Float32Array(STAR_COUNT * 3);
    const phases = new Float32Array(STAR_COUNT);
    const sizes = new Float32Array(STAR_COUNT);
    for (let i = 0; i < STAR_COUNT; i++) {
      // upper hemisphere, biased away from the horizon
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(0.08 + Math.random() * 0.9);
      const r = SKY_RADIUS - 5;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      phases[i] = Math.random();
      sizes[i] = 1.5 + Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float aPhase;
        attribute float aSize;
        uniform float uTime;
        varying float vAlpha;
        void main() {
          vAlpha = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * (0.4 + aPhase * 1.6) + aPhase * 6.283));
          gl_PointSize = aSize;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.1, d) * vAlpha;
          gl_FragColor = vec4(vec3(0.75, 0.8, 1.0) * a, a);
        }
      `,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      fog: false,
    });

    const stars = new THREE.Points(geo, mat);
    stars.renderOrder = -1;
    this.group.add(stars);
    return mat;
  }

  private buildMoon(): void {
    // procedural maria blotches on a small canvas
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#d8d8e8';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#b4b4cc';
    const blotches: [number, number, number][] = [
      [45, 40, 18], [80, 60, 14], [60, 90, 11], [95, 35, 8], [35, 75, 9],
    ];
    for (const [x, y, r] of blotches) {
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.8, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;

    // low over the left horizon so hill ridges and trees can silhouette
    // against the disc — elevation must stay under ~19° or the camera's
    // pitch hides it
    const moonPos = new THREE.Vector3(-6, 10, -46);

    // additive halo behind the disc — visible even without bloom
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x8890b8,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      fog: false,
      depthWrite: false,
    });
    const halo = new THREE.Mesh(new THREE.CircleGeometry(8.5, 24), haloMat);
    halo.position.copy(moonPos);
    halo.lookAt(0, 2.5, 6);
    halo.renderOrder = -1;
    this.group.add(halo);

    const mat = new THREE.MeshBasicMaterial({ map: tex, fog: false });
    mat.color.multiplyScalar(1.25); // just over the bloom threshold — soft glow, no wash
    const moon = new THREE.Mesh(new THREE.CircleGeometry(4.8, 24), mat);
    moon.position.copy(moonPos);
    moon.lookAt(0, 2.5, 6);
    moon.translateZ(0.5); // sit in front of the halo
    moon.renderOrder = -1;
    this.group.add(moon);
  }

  update(time: number): void {
    this.starMat.uniforms.uTime!.value = time;
  }
}
