import * as THREE from 'three';

export class World {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  private lanternLight: THREE.PointLight;

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050510);
    this.scene.fog = new THREE.FogExp2(0x050510, 0.06);

    const w = container.clientWidth;
    const h = container.clientHeight;

    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100);
    this.camera.position.set(0, 2.5, 6);
    this.camera.lookAt(0, 0.5, -5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    const ambient = new THREE.AmbientLight(0x111122, 0.2);
    this.scene.add(ambient);

    this.lanternLight = new THREE.PointLight(0xf4c430, 1.5, 20, 2);
    this.lanternLight.position.set(0, 3, 5);
    this.lanternLight.castShadow = true;
    this.scene.add(this.lanternLight);

    this.buildEnvironment();

    window.addEventListener('resize', () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    });
  }

  private buildEnvironment(): void {
    const groundGeo = new THREE.PlaneGeometry(20, 40);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a1a,
      roughness: 0.95,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -10;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const pathGeo = new THREE.PlaneGeometry(3, 40);
    const pathMat = new THREE.MeshStandardMaterial({
      color: 0x151525,
      roughness: 0.8,
    });
    const path = new THREE.Mesh(pathGeo, pathMat);
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.01, -10);
    this.scene.add(path);

    for (let i = 0; i < 8; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const postGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6);
      const postMat = new THREE.MeshStandardMaterial({ color: 0x2a2a3a });
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(side * 2, 0.75, -i * 4);
      this.scene.add(post);

      const lampLight = new THREE.PointLight(0x334466, 0.15, 5);
      lampLight.position.set(side * 2, 1.5, -i * 4);
      this.scene.add(lampLight);
    }
  }

  update(): void {
    const time = performance.now() * 0.001;
    this.lanternLight.intensity = 1.5 + Math.sin(time * 3) * 0.3;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
