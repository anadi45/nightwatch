import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PostFX } from './PostFX';
import { Sky } from './environment/Sky';
import { Props, makeGroundTexture, makePathTexture } from './environment/Props';

export class World {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  private lanternLight: THREE.PointLight;
  private postfx: PostFX;
  private sky!: Sky;
  private props!: Props;

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050510);
    this.scene.fog = new THREE.FogExp2(0x050510, 0.06);

    const w = container.clientWidth;
    const h = container.clientHeight;

    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100);
    this.camera.position.set(0, 2.5, 6);
    this.camera.lookAt(0, 0.5, -5);
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);

    this.postfx = new PostFX(this.renderer, this.scene, this.camera, w, h);

    // Intensities tuned for ACES tone mapping (darker rolloff than linear)
    const ambient = new THREE.AmbientLight(0x111122, 0.35);
    this.scene.add(ambient);

    this.lanternLight = new THREE.PointLight(0xf4c430, 2.0, 20, 2);
    this.lanternLight.position.set(0, 3, 5);
    this.scene.add(this.lanternLight);

    this.buildEnvironment();

    window.addEventListener('resize', () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
      this.postfx.setSize(width, height);
    });
  }

  private buildEnvironment(): void {
    this.sky = new Sky();
    this.scene.add(this.sky.group);
    this.props = new Props();
    this.scene.add(this.props.group);

    // grayscale noise maps multiply the base color (~0.55 avg), so the
    // colors here are roughly double the intended on-screen shade
    const groundGeo = new THREE.PlaneGeometry(20, 40);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x161634,
      roughness: 0.95,
      map: makeGroundTexture(),
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -10;
    this.scene.add(ground);

    const pathGeo = new THREE.PlaneGeometry(3, 40);
    const pathMat = new THREE.MeshStandardMaterial({
      color: 0x28284a,
      roughness: 0.8,
      map: makePathTexture(),
    });
    const path = new THREE.Mesh(pathGeo, pathMat);
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.01, -10);
    this.scene.add(path);

    this.buildFence();
  }

  // Decrepit fence: tilted posts + sagging rails on both sides of the
  // path, merged into a single geometry (one draw call).
  private buildFence(): void {
    const geos: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      for (let i = 0; i < 8; i++) {
        const post = new THREE.CylinderGeometry(0.045, 0.06, 1.5, 5);
        post.translate(0, 0.75, 0);
        const m = new THREE.Matrix4()
          .makeTranslation(side * 2, -0.03, -i * 4)
          .multiply(new THREE.Matrix4().makeRotationZ((Math.random() - 0.5) * 0.18))
          .multiply(new THREE.Matrix4().makeRotationX((Math.random() - 0.5) * 0.12));
        post.applyMatrix4(m);
        geos.push(post);
      }
      for (let i = 0; i < 7; i++) {
        for (const railY of [1.15, 0.62]) {
          const rail = new THREE.BoxGeometry(0.04, 0.06, 4.05);
          const m = new THREE.Matrix4()
            .makeTranslation(side * 2, railY + (Math.random() - 0.5) * 0.1, -i * 4 - 2)
            .multiply(new THREE.Matrix4().makeRotationX((Math.random() - 0.5) * 0.06));
          rail.applyMatrix4(m);
          geos.push(rail);
        }
      }
    }
    const merged = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    const fence = new THREE.Mesh(
      merged,
      new THREE.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 0.9 })
    );
    this.scene.add(fence);
  }

  update(time: number): void {
    this.lanternLight.intensity = 2.0 + Math.sin(time * 3) * 0.4;
    this.sky.update(time);
    this.props.update(time);
  }

  render(): void {
    if (this.postfx.enabled) this.postfx.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
