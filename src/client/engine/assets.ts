import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import gravestoneCrossUrl from '../assets/gravestone-cross.glb?url';
import gravestoneRoundUrl from '../assets/gravestone-round.glb?url';
import gravestoneBrokenUrl from '../assets/gravestone-broken.glb?url';
import cryptUrl from '../assets/crypt-small.glb?url';
import lanternUrl from '../assets/lantern-glass.glb?url';

// Props/lantern from Kenney's Graveyard Kit (kenney.nl, CC0). The ghost
// is fully procedural (Creature.ts) — no model asset.

export interface GameAssets {
  gravestones: THREE.Group[];
  crypt: THREE.Group;
  /** Normalized: height exactly 1, feet at y=0, centered on x/z. */
  lantern: THREE.Group;
}

/** Wrap a scene so the wrapper is height 1 with feet at the origin. */
function normalize(scene: THREE.Group): THREE.Group {
  const box = new THREE.Box3().setFromObject(scene);
  const height = Math.max(box.max.y - box.min.y, 0.0001);
  scene.scale.setScalar(1 / height);
  const scaled = new THREE.Box3().setFromObject(scene);
  scene.position.set(
    -(scaled.min.x + scaled.max.x) / 2,
    -scaled.min.y,
    -(scaled.min.z + scaled.max.z) / 2
  );
  const wrapper = new THREE.Group();
  wrapper.add(scene);
  return wrapper;
}

export async function loadGameAssets(): Promise<GameAssets> {
  const loader = new GLTFLoader();
  const [cross, round, broken, crypt, lantern] = await Promise.all([
    loader.loadAsync(gravestoneCrossUrl),
    loader.loadAsync(gravestoneRoundUrl),
    loader.loadAsync(gravestoneBrokenUrl),
    loader.loadAsync(cryptUrl),
    loader.loadAsync(lanternUrl),
  ]);

  return {
    gravestones: [cross.scene, round.scene, broken.scene],
    crypt: crypt.scene,
    lantern: normalize(lantern.scene),
  };
}
