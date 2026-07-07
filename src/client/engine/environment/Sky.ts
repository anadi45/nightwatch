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
        uHorizon: { value: new THREE.Color(0x3d4a68) }, // concept fog haze — darker than before
        uMid:     { value: new THREE.Color(0x1a2440) }, // mid-sky transition
        uZenith:  { value: new THREE.Color(0x0a0e22) },
        uMoonDir: { value: new THREE.Vector3(8, 13, -44).normalize() },
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
        uniform vec3 uMid;
        uniform vec3 uZenith;
        uniform vec3 uMoonDir;
        varying vec3 vPos;
        void main() {
          vec3 dir = normalize(vPos);
          float h = pow(clamp(dir.y, 0.0, 1.0), 0.45);
          // three-stop gradient: horizon → mid-sky → zenith
          vec3 col = h < 0.42
            ? mix(uHorizon, uMid,    h / 0.42)
            : mix(uMid,    uZenith, (h - 0.42) / 0.58);
          float moonGlow = pow(max(dot(dir, uMoonDir), 0.0), 16.0);
          col += vec3(0.04, 0.05, 0.08) * moonGlow;
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
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      phases[i] = Math.random();
      sizes[i]  = 0.7 + Math.random() * 1.1; // smaller, more delicate
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
          vAlpha = 0.18 + 0.52 * (0.5 + 0.5 * sin(uTime * (0.4 + aPhase * 1.6) + aPhase * 6.283));
          gl_PointSize = aSize;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          // cooler blue-white (#c8d8f4), dimmer range (0.18–0.70) vs old (0.35–1.0)
          float a = smoothstep(0.5, 0.08, d) * vAlpha;
          gl_FragColor = vec4(vec3(0.78, 0.85, 0.96) * a, a);
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
    // Upper-right position — matches concept art; elevation stays low enough
    // that hill ridges and trees can still silhouette against it.
    const moonPos = new THREE.Vector3(8, 13, -44);
    const lookTarget = new THREE.Vector3(0, 2.5, 6);

    // Four layered additive halos (large→small, dim→bright) matching concept art
    const haloLayers: [number, number][] = [
      [14.5, 0.028], [10.5, 0.048], [7.2, 0.07], [5.0, 0.10],
    ];
    for (const [radius, opacity] of haloLayers) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x8898c8,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        fog: false,
        depthWrite: false,
      });
      const halo = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), mat);
      halo.position.copy(moonPos);
      halo.lookAt(lookTarget);
      halo.renderOrder = -1;
      this.group.add(halo);
    }

    // Disc: radial gradient canvas — bright ivory centre fading to cool slate edge,
    // with subtle maria blotches. Matches concept: #f2f6ff → #8ca8d0.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(64, 58, 4, 64, 64, 64);
    grad.addColorStop(0.0,  '#f2f6ff');
    grad.addColorStop(0.55, '#d0e0f8');
    grad.addColorStop(1.0,  '#8ca8d0');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    // subtle maria
    ctx.globalAlpha = 0.09;
    ctx.fillStyle = '#607090';
    const blotches: [number, number, number, number][] = [
      [72, 48, 10, 6], [44, 64, 7, 5], [82, 80, 8, 6], [56, 90, 6, 4],
    ];
    for (const [x, y, rx, ry] of blotches) {
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.MeshBasicMaterial({ map: tex, fog: false });
    mat.color.multiplyScalar(1.20); // nudge over bloom threshold for soft glow
    const moon = new THREE.Mesh(new THREE.CircleGeometry(3.8, 32), mat);
    moon.position.copy(moonPos);
    moon.lookAt(lookTarget);
    moon.translateZ(0.5);
    moon.renderOrder = -1;
    this.group.add(moon);
  }

  update(time: number): void {
    this.starMat.uniforms.uTime!.value = time;
  }
}
