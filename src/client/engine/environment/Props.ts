import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Grayscale moonlight pool for the ground's emissive map (tinted by the
 * material's emissive color). One soft elliptical pool of light centered
 * on the path, biased toward the far half where the moon hangs, with
 * grain so it reads as lit earth instead of a gradient. Not tiled — it
 * maps 1:1 onto the oversized ground plane (canvas top = far edge).
 */
export function makeMoonPoolTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);

  // elongated pool along the path (stretched vertically = along z)
  ctx.save();
  ctx.translate(size / 2, size * 0.42);
  ctx.scale(1, 2.4);
  const pool = ctx.createRadialGradient(0, 0, 8, 0, 0, size * 0.24);
  pool.addColorStop(0, 'rgba(255,255,255,0.85)');
  pool.addColorStop(0.5, 'rgba(255,255,255,0.32)');
  pool.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = pool;
  ctx.fillRect(-size / 2, -size / 2, size, size);
  ctx.restore();

  // grain — mottles the pool so it reads as ground, not a gradient
  for (let i = 0; i < 2600; i++) {
    const v = Math.floor(Math.random() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},0.16)`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random(), 1 + Math.random());
  }

  return new THREE.CanvasTexture(canvas);
}

/**
 * Worn dirt streaks running along the path direction, with alpha-feathered
 * ragged edges so the path melts into the ground instead of ending in a
 * hard seam. The material using this must set `transparent: true`.
 */
export function makePathTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#8d8d8d';
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

  // feather the left/right edges to full transparency…
  ctx.globalCompositeOperation = 'destination-out';
  const fade = ctx.createLinearGradient(0, 0, size, 0);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(0.2, 'rgba(0,0,0,0)');
  fade.addColorStop(0.8, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, size, size);
  // …and bite ragged notches out of them so the edge isn't a clean line
  for (let i = 0; i < 26; i++) {
    const edgeX = Math.random() < 0.5 ? Math.random() * size * 0.16 : size - Math.random() * size * 0.16;
    const y = Math.random() * size;
    const r = 8 + Math.random() * 18;
    const grad = ctx.createRadialGradient(edgeX, y, 1, edgeX, y, r);
    grad.addColorStop(0, 'rgba(0,0,0,0.9)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(edgeX - r, y - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = 'source-over';

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

// Shared cutout material for everything that reads as a black paper-cut
// layer (crystals, monoliths, rocks). Never mutated, never disposed.
const SILHOUETTE_MAT = new THREE.MeshBasicMaterial({ color: 0x05060c });

interface CrystalSpot {
  x: number;
  z: number;
  ry: number;
  rz: number;
  s: number;
}

/**
 * Static alien-field decor: silhouetted dead trees, angular crystal-shard
 * growths, grass tufts, rocks, drifting ground mist, teal spore motes.
 * Each scatter (trees, crystals, rocks, grass) merges into a single
 * geometry — the whole class costs ~8 draw calls. Everything is a black
 * cutout per the art direction; the spores are the only glowing element
 * and share the aliens' teal.
 */
export class Props {
  readonly group: THREE.Group;
  private mistPlanes: THREE.Mesh[] = [];
  private smokeClouds: THREE.Mesh[] = [];
  private smokeDrift: { x: number; speed: number; phase: number }[] = [];
  private sporeMat: THREE.ShaderMaterial;
  /** Shared with the grass material's injected wind shader. */
  private grassTime = { value: 0 };
  /** Crystal-cluster placements flanking the path (former grave spots). */
  private crystalSpots: CrystalSpot[] = [];

  constructor() {
    this.group = new THREE.Group();
    for (let i = 0; i < 10; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      this.crystalSpots.push({
        x: side * (2.6 + Math.random() * 1.1),
        z: -2 - Math.random() * 26,
        ry: (Math.random() - 0.5) * 0.9,
        rz: (Math.random() - 0.5) * 0.16,
        s: 1.15 + Math.random() * 0.35,
      });
    }
    this.buildTrees();
    this.buildCrystals();
    this.buildRocks();
    this.buildGrass();
    this.buildMist();
    this.buildSmoke();
    this.sporeMat = this.buildSpores();
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

  // ─── CRYSTAL SHARDS (alien growths flanking the path) ─────────────
  // Each spot grows a cluster: one tall tilted spike plus smaller shards
  // leaning out around it — angular where the graveyard was rounded.
  private buildCrystals(): void {
    const geos: THREE.BufferGeometry[] = [];
    for (const spot of this.crystalSpots) {
      const shards = 3 + Math.floor(Math.random() * 3);
      for (let s = 0; s < shards; s++) {
        const main = s === 0;
        const h = (main ? 0.9 + Math.random() * 0.8 : 0.3 + Math.random() * 0.4) * spot.s;
        const r = h * (0.13 + Math.random() * 0.05);
        // 5-sided cone reads as a faceted shard in silhouette
        const shard = new THREE.ConeGeometry(r, h, 5);
        shard.translate(0, h / 2, 0);
        const m = new THREE.Matrix4()
          .makeTranslation(
            spot.x + (main ? 0 : (Math.random() - 0.5) * 0.6),
            -0.04,
            spot.z + (main ? 0 : (Math.random() - 0.5) * 0.6)
          )
          .multiply(new THREE.Matrix4().makeRotationY(spot.ry + Math.random() * Math.PI * 2))
          .multiply(
            new THREE.Matrix4().makeRotationZ(spot.rz + (Math.random() - 0.5) * (main ? 0.3 : 0.7))
          );
        shard.applyMatrix4(m);
        geos.push(shard);
      }
    }
    const merged = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    const crystals = new THREE.Mesh(merged, SILHOUETTE_MAT);
    this.group.add(crystals);
  }

  // ─── ROCKS (boulders off the path, pebbles hugging its edges) ─────
  private buildRocks(): void {
    const geos: THREE.BufferGeometry[] = [];
    const addRock = (x: number, z: number, r: number): void => {
      const geo = new THREE.DodecahedronGeometry(r, 0);
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(x, r * 0.35, z),
        new THREE.Quaternion().setFromEuler(
          new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
        ),
        new THREE.Vector3(1, 0.65 + Math.random() * 0.25, 1)
      );
      geo.applyMatrix4(m);
      geos.push(geo);
    };
    for (let i = 0; i < 12; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      addRock(side * (2.4 + Math.random() * 5.5), -2 - Math.random() * 27, 0.09 + Math.random() * 0.16);
    }
    for (let i = 0; i < 10; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      addRock(side * (1.55 + Math.random() * 0.3), -1 - Math.random() * 28, 0.035 + Math.random() * 0.05);
    }
    const merged = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    const rocks = new THREE.Mesh(merged, SILHOUETTE_MAT);
    this.group.add(rocks);
  }

  // ─── GRASS (patchy silhouette tufts that sway in the wind) ────────
  // Blades grow in patches (clusters of clusters) for a natural
  // distribution. Wind is injected into the shared MeshBasicMaterial's
  // vertex shader via onBeforeCompile — displacement scales with height²
  // so bases stay planted while tips wave. One merged geometry, fog and
  // silhouette color kept from the stock material.
  private buildGrass(): void {
    const geos: THREE.BufferGeometry[] = [];
    const addTuft = (cx: number, cz: number, tall: number): void => {
      const blades = 3 + Math.floor(Math.random() * 3);
      for (let b = 0; b < blades; b++) {
        const h = (0.15 + Math.random() * 0.3) * tall;
        const blade = new THREE.ConeGeometry(0.014 + Math.random() * 0.018, h, 3, 1, true);
        blade.translate(0, h / 2, 0);
        const m = new THREE.Matrix4()
          .makeTranslation(cx + (Math.random() - 0.5) * 0.3, -0.01, cz + (Math.random() - 0.5) * 0.3)
          .multiply(new THREE.Matrix4().makeRotationY(Math.random() * Math.PI * 2))
          .multiply(new THREE.Matrix4().makeRotationZ((Math.random() - 0.5) * 0.6));
        blade.applyMatrix4(m);
        geos.push(blade);
      }
    };

    // patches scattered off the path…
    for (let p = 0; p < 14; p++) {
      const side = p % 2 === 0 ? -1 : 1;
      const px = side * (2.0 + Math.random() * 6.5);
      const pz = -1.5 - Math.random() * 27;
      const tufts = 5 + Math.floor(Math.random() * 5);
      for (let t = 0; t < tufts; t++) {
        addTuft(
          px + (Math.random() - 0.5) * 1.6,
          pz + (Math.random() - 0.5) * 1.6,
          1 + Math.random() * 0.4
        );
      }
    }
    // …plus taller lone reeds hugging the path edges, backlit by the pool
    for (let i = 0; i < 16; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      addTuft(side * (1.6 + Math.random() * 0.35), -1 - Math.random() * 28, 1.5 + Math.random() * 0.6);
    }

    const merged = mergeGeometries(geos);
    for (const g of geos) g.dispose();

    const mat = new THREE.MeshBasicMaterial({ color: 0x02040a });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms['uTime'] = this.grassTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          float sway = transformed.y * transformed.y * 0.5;
          float phase = transformed.x * 1.7 + transformed.z * 0.9;
          transformed.x += (sin(uTime * 1.6 + phase) + 0.35 * sin(uTime * 3.7 + phase * 2.3)) * sway;
          transformed.z += cos(uTime * 1.2 + phase) * sway * 0.4;`
        );
    };
    const grass = new THREE.Mesh(merged, mat);
    grass.frustumCulled = false; // swaying tips can exceed the static bounds
    this.group.add(grass);
  }

  // ─── GROUND MIST ──────────────────────────────────────────────────
  private buildMist(): void {
    const tex = makeMistTexture();
    const geo = new THREE.PlaneGeometry(11, 3.4);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.13,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    for (let i = 0; i < 3; i++) {
      const mist = new THREE.Mesh(geo, mat);
      mist.position.set((i - 1) * 1.5, 0.4 + i * 0.12, -5 - i * 6);
      mist.renderOrder = 1;
      this.mistPlanes.push(mist);
      this.group.add(mist);
    }
  }

  // ─── SMOKE CLOUDS (occluding — the difficulty mechanic) ───────────
  // Unlike the additive ground mist, these use normal alpha blending
  // and draw after aliens/particles (renderOrder 3), so an alien drifting
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

  // ─── SPORES (drifting alien motes, animated in vertex shader) ─────
  private buildSpores(): THREE.ShaderMaterial {
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
          // slightly >1 violet so bright blinks catch a whisper of bloom —
          // same color language as the aliens' rims
          gl_FragColor = vec4(vec3(0.78, 0.48, 1.2) * a, a);
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
    this.sporeMat.uniforms.uTime!.value = time;
    this.grassTime.value = time;
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
