import * as THREE from 'three';

const container = document.getElementById('game-container')!;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050510);
scene.fog = new THREE.FogExp2(0x050510, 0.08);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 2, 5);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

const ambient = new THREE.AmbientLight(0x111122, 0.3);
scene.add(ambient);

const lanternLight = new THREE.PointLight(0xf4c430, 2, 15, 2);
lanternLight.position.set(0, 1.5, 0);
lanternLight.castShadow = true;
scene.add(lanternLight);

const groundGeo = new THREE.PlaneGeometry(50, 50);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.9 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const lanternGeo = new THREE.CylinderGeometry(0.1, 0.15, 0.4, 8);
const lanternMat = new THREE.MeshStandardMaterial({ color: 0xf4c430, emissive: 0xf4c430, emissiveIntensity: 0.5 });
const lantern = new THREE.Mesh(lanternGeo, lanternMat);
lantern.position.set(0, 1.3, 0);
lantern.castShadow = true;
scene.add(lantern);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);

  const time = performance.now() * 0.001;
  lanternLight.intensity = 2 + Math.sin(time * 3) * 0.3;
  lantern.position.y = 1.3 + Math.sin(time * 2) * 0.02;

  renderer.render(scene, camera);
}

animate();
