import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Grayscale noise texture that multiplies the ground material color. */
export function makeGroundTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#8a8a8a';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    const v = 100 + Math.floor(Math.random() * 90);
    ctx.fillStyle = `rgba(${v},${v},${v},0.5)`;
    const r = 2 + Math.random() * 9;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 8);
  return tex;
}

/** Worn dirt streaks running along the path direction. */
export function makePathTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#909090';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 60; i++) {
    const v = 105 + Math.floor(Math.random() * 80);
    ctx.strokeStyle = `rgba(${v},${v},${v},0.4)`;
    ctx.lineWidth = 2 + Math.random() * 6;
    const x = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(x, -20);
    ctx.bezierCurveTo(
      x + (Math.random() - 0.5) * 40, size * 0.33,
      x + (Math.random() - 0.5) * 40, size * 0.66,
      x + (Math.random() - 0.5) * 30, size + 20
    );
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 6);
  return tex;
}

function makeSmokeTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // overlapping soft blobs — billowing puff with ragged edges
  const blobs: [number, number, number, number][] = [
    [64, 70, 46, 0.55], [40, 56, 30, 0.5], [90, 58, 32, 0.5],
    [56, 88, 28, 0.45], [82, 86, 26, 0.4], [64, 42, 26, 0.45],
  ];
  for (const [x, y, r, a] of blobs) {
    const grad = ctx.createRadialGradient(x, y, 2, x, y, r);
    grad.addColorStop(0, `rgba(58,62,82,${a})`);
    grad.addColorStop(0.7, `rgba(46,50,68,${a * 0.5})`);
    grad.addColorStop(1, 'rgba(40,44,60,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

function makeMistTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size / 2;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 32, 4, 64, 32, 62);
  grad.addColorStop(0, 'rgba(160,170,200,1)');
  grad.addColorStop(0.6, 'rgba(160,170,200,0.35)');
  grad.addColorStop(1, 'rgba(160,170,200,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size / 2);
  return new THREE.CanvasTexture(canvas);
}

/**
 * Static graveyard decor: silhouetted dead trees, gravestones, drifting
 * ground mist, fireflies. Trees and gravestones each merge into a single
 * geometry — the whole class costs ~6 draw calls.
 */
export class Props {
  readonly group: THREE.Group;
  private mistPlanes: THREE.Mesh[] = [];
  private smokeClouds: THREE.Mesh[] = [];
  private smokeDrift: { x: number; speed: number; phase: number }[] = [];
  private fireflyMat: THREE.ShaderMaterial;

  constructor() {
    this.group = new THREE.Group();
    this.buildTrees();
    this.buildGravestones();
    this.buildMist();
    this.buildSmoke();
    this.fireflyMat = this.buildFireflies();
  }

  // ─── DEAD TREES (one merged geometry, pure silhouette) ────────────
  private addBranch(
    geos: THREE.BufferGeometry[],
    matrix: THREE.Matrix4,
    length: number,
    radius: number,
    level: number
  ): void {
    const geo = new THREE.CylinderGeometry(radius * 0.55, radius, length, 5);
    geo.translate(0, length / 2, 0);
    geo.applyMatrix4(matrix);
    geos.push(geo);
    if (level >= 3) return;

    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const tilt = new THREE.Matrix4()
        .makeRotationY(Math.random() * Math.PI * 2)
        .multiply(new THREE.Matrix4().makeRotationZ(0.45 + Math.random() * 0.55));
      const m = matrix
        .clone()
        .multiply(new THREE.Matrix4().makeTranslation(0, length * 0.95, 0))
        .multiply(tilt);
      this.addBranch(geos, m, length * 0.6, radius * 0.55, level + 1);
    }
  }

  private buildTrees(): void {
    const geos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * (5 + Math.random() * 4);
      const z = -4 - Math.random() * 26;
      const root = new THREE.Matrix4()
        .makeTranslation(x, 0, z)
        .multiply(new THREE.Matrix4().makeRotationY(Math.random() * Math.PI * 2))
        .multiply(new THREE.Matrix4().makeRotationZ((Math.random() - 0.5) * 0.15));
      this.addBranch(geos, root, 2.2 + Math.random() * 1.2, 0.16, 0);
    }
    const merged = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    // near-black silhouette — no lighting cost, reads against sky/fog
    const trees = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ color: 0x000005 }));
    this.group.add(trees);
  }

  // ─── GRAVESTONES (one merged geometry) ────────────────────────────
  private buildGravestones(): void {
    const geos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const w = 0.4 + Math.random() * 0.2;
      const h = 0.5 + Math.random() * 0.35;

      const slab = new THREE.BoxGeometry(w, h, 0.1);
      slab.translate(0, h / 2, 0);
      const arch = new THREE.CylinderGeometry(w / 2, w / 2, 0.1, 10, 1, false, 0, Math.PI);
      arch.rotateX(-Math.PI / 2);
      arch.translate(0, h, 0);

      const m = new THREE.Matrix4()
        .makeTranslation(side * (2.6 + Math.random() * 0.9), -0.05, -2 - Math.random() * 26)
        .multiply(new THREE.Matrix4().makeRotationY((Math.random() - 0.5) * 0.8))
        .multiply(new THREE.Matrix4().makeRotationZ((Math.random() - 0.5) * 0.25));
      slab.applyMatrix4(m);
      arch.applyMatrix4(m);
      geos.push(slab, arch);
    }
    const merged = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    const stones = new THREE.Mesh(
      merged,
      new THREE.MeshStandardMaterial({ color: 0x2e2e3c, roughness: 0.9 })
    );
    this.group.add(stones);
  }

  // ─── GROUND MIST ──────────────────────────────────────────────────
  private buildMist(): void {
    const tex = makeMistTexture();
    const geo = new THREE.PlaneGeometry(9, 3);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.05,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    for (let i = 0; i < 3; i++) {
      const mist = new THREE.Mesh(geo, mat);
      mist.position.set((i - 1) * 1.5, 0.45, -5 - i * 6);
      mist.renderOrder = 1;
      this.mistPlanes.push(mist);
      this.group.add(mist);
    }
  }

  // ─── SMOKE CLOUDS (occluding — the difficulty mechanic) ───────────
  // Unlike the additive ground mist, these use normal alpha blending
  // and draw after ghosts/particles (renderOrder 3), so a ghost drifting
  // behind one is genuinely obscured, eye glow included.
  private buildSmoke(): void {
    const tex = makeSmokeTexture();
    const geo = new THREE.PlaneGeometry(3.4, 1.9);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    for (let i = 0; i < 4; i++) {
      const cloud = new THREE.Mesh(geo, mat);
      const z = -5.5 - i * 3;
      cloud.position.set(0, 1.05 + (i % 2) * 0.25, z);
      cloud.scale.setScalar(0.9 + Math.random() * 0.4);
      cloud.renderOrder = 3;
      this.smokeClouds.push(cloud);
      this.smokeDrift.push({
        x: (Math.random() - 0.5) * 2,
        speed: 0.05 + Math.random() * 0.05,
        phase: Math.random() * Math.PI * 2,
      });
      this.group.add(cloud);
    }
  }

  // ─── FIREFLIES (static Points, animated in vertex shader) ─────────
  private buildFireflies(): THREE.ShaderMaterial {
    const COUNT = 30;
    const positions = new Float32Array(COUNT * 3);
    const phases = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 12;
      positions[i * 3 + 1] = 0.3 + Math.random() * 1.4;
      positions[i * 3 + 2] = -3 - Math.random() * 22;
      phases[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float aPhase;
        uniform float uTime;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          p.x += sin(uTime * 0.25 + aPhase * 6.283) * 1.2;
          p.y += sin(uTime * 0.5 + aPhase * 12.566) * 0.35;
          p.z += cos(uTime * 0.2 + aPhase * 6.283) * 1.2;
          // slow blink, mostly off
          vAlpha = smoothstep(0.55, 0.95, sin(uTime * (0.6 + aPhase) + aPhase * 10.0));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = 90.0 / -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.05, d) * vAlpha;
          // slightly >1 green-gold so bright blinks catch a whisper of bloom
          gl_FragColor = vec4(vec3(0.9, 1.3, 0.45) * a, a);
        }
      `,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });

    const flies = new THREE.Points(geo, mat);
    flies.renderOrder = 1;
    this.group.add(flies);
    return mat;
  }

  update(time: number): void {
    this.fireflyMat.uniforms.uTime!.value = time;
    for (let i = 0; i < this.mistPlanes.length; i++) {
      const mist = this.mistPlanes[i]!;
      mist.position.x = (i - 1) * 1.5 + Math.sin(time * 0.07 + i * 2.1) * 1.6;
    }
    for (let i = 0; i < this.smokeClouds.length; i++) {
      const cloud = this.smokeClouds[i]!;
      const drift = this.smokeDrift[i]!;
      // slow sweep across the lanes plus a gentle billow
      cloud.position.x = drift.x + Math.sin(time * drift.speed + drift.phase) * 2.4;
      cloud.position.y += Math.sin(time * 0.4 + drift.phase) * 0.0004;
      cloud.rotation.z = Math.sin(time * 0.1 + drift.phase) * 0.06;
    }
  }
}
