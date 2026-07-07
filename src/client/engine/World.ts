import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PostFX } from './PostFX';
import { Sky } from './environment/Sky';
import { Props, makeMoonPoolTexture, makePathTexture } from './environment/Props';

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
    this.scene.background = new THREE.Color(0x0a0e22);
    // Silhouette-horror fog: distance fades toward pale moonlit haze, not
    // black — that's what separates the scene into paper-cut layers.
    // Density 0.06 must stay in sync with the particle shader's manual fog.
    this.scene.fog = new THREE.FogExp2(0x3d4a68, 0.06);

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
    const ambient = new THREE.AmbientLight(0x25304a, 0.3);
    this.scene.add(ambient);

    // Cool moonlight from behind the scene (the moon's position) — a
    // backlight that rims ghosts and hands while fronts stay dark, which
    // is the whole silhouette look. Directionals are cheap: no shadows.
    const moonlight = new THREE.DirectionalLight(0xa9bfe8, 0.55);
    moonlight.position.set(-6, 10, -46);
    this.scene.add(moonlight);

    // warm pool near the player only — the world stays moon-cold
    this.lanternLight = new THREE.PointLight(0xf4c430, 1.5, 12, 2);
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

    // Near-black ground with a baked moonlight pool down the middle (the
    // emissive map is grayscale, tinted by the emissive color). Oversized
    // so no edge ever shows against the luminous horizon.
    const groundGeo = new THREE.PlaneGeometry(60, 100);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x10121f,
      roughness: 1,
      emissive: 0x93a7cf,
      emissiveIntensity: 0.38,
      emissiveMap: makeMoonPoolTexture(),
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -20;
    this.scene.add(ground);

    // Moonlit path strip: the texture multiplies both color and emissive
    // (streaks stay visible in the glow); transparent for its
    // alpha-feathered ragged edges
    const pathGeo = new THREE.PlaneGeometry(3.4, 40);
    const pathTex = makePathTexture();
    const pathMat = new THREE.MeshStandardMaterial({
      color: 0x3f4a6a,
      roughness: 0.8,
      map: pathTex,
      emissive: 0x8fa3c8,
      emissiveIntensity: 0.3,
      emissiveMap: pathTex,
      transparent: true,
      depthWrite: false,
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
    // pure cutout — silhouettes don't take light
    const fence = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ color: 0x05060c }));
    this.scene.add(fence);
  }

  /** Swap procedural stand-ins for loaded Kenney kit models. */
  installKitProps(assets: { gravestones: THREE.Group[]; crypt: THREE.Group }): void {
    this.props.installKit(assets);
  }

  update(time: number): void {
    this.lanternLight.intensity = 1.5 + Math.sin(time * 3) * 0.3;
    this.sky.update(time);
    this.props.update(time);
  }

  render(): void {
    if (this.postfx.enabled) this.postfx.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
