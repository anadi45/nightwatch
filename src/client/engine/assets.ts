import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import ghostUrl from '../assets/character-ghost.glb?url';
import gravestoneCrossUrl from '../assets/gravestone-cross.glb?url';
import gravestoneRoundUrl from '../assets/gravestone-round.glb?url';
import gravestoneBrokenUrl from '../assets/gravestone-broken.glb?url';
import cryptUrl from '../assets/crypt-small.glb?url';

// Models from Kenney's Graveyard Kit (kenney.nl, CC0)
export interface GameAssets {
  ghost: THREE.Group;
  gravestones: THREE.Group[];
  crypt: THREE.Group;
}

async function loadModel(loader: GLTFLoader, url: string): Promise<THREE.Group> {
  const gltf = await loader.loadAsync(url);
  return gltf.scene;
}

export async function loadGameAssets(): Promise<GameAssets> {
  const loader = new GLTFLoader();
  const [ghost, cross, round, broken, crypt] = await Promise.all([
    loadModel(loader, ghostUrl),
    loadModel(loader, gravestoneCrossUrl),
    loadModel(loader, gravestoneRoundUrl),
    loadModel(loader, gravestoneBrokenUrl),
    loadModel(loader, cryptUrl),
  ]);
  return { ghost, gravestones: [cross, round, broken], crypt };
}
