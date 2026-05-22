import * as THREE from "three";
import { sfx } from "../audio";

export interface EnemyState {
  x: number;
  y: number;
  hp: number;
}

export class EnemyView extends THREE.Group {
  static readonly RADIUS = 14;
  static readonly HEIGHT = EnemyView.RADIUS * 3;

  hp: number;
  private serverX: number;
  private serverY: number;
  private interpX: number;
  private interpY: number;

  constructor(state: EnemyState, opts: { playSpawnSfx: boolean } = { playSpawnSfx: true }) {
    super();
    const mesh = new THREE.Mesh(geom, material);
    mesh.position.y = EnemyView.HEIGHT / 2;
    mesh.castShadow = true;
    this.add(mesh);

    this.position.set(state.x, 0, state.y);
    this.serverX = this.interpX = state.x;
    this.serverY = this.interpY = state.y;
    this.hp = state.hp;

    if (opts.playSpawnSfx) sfx.spawn(state.x, state.y);
  }

  applyServerState(state: EnemyState) {
    this.serverX = state.x;
    this.serverY = state.y;
    this.hp = state.hp;
  }

  update(dt: number) {
    const k = 1 - Math.exp(-15 * dt);
    this.interpX += (this.serverX - this.interpX) * k;
    this.interpY += (this.serverY - this.interpY) * k;
    this.position.x = this.interpX;
    this.position.z = this.interpY;
  }

  dispose() {
    sfx.kill(this.position.x, this.position.z);
    this.removeFromParent();
  }
}

const geom = new THREE.BoxGeometry(
  EnemyView.RADIUS * 2,
  EnemyView.HEIGHT,
  EnemyView.RADIUS * 2,
);
const material = new THREE.MeshLambertMaterial({ color: 0xc64a3a });
