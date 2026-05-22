import * as THREE from "three";
import { sfx } from "../audio";

export interface PlayerState {
  x: number;
  y: number;
  hp: number;
  color: string;
}

export class PlayerView extends THREE.Group {
  static readonly RADIUS = 16;
  static readonly HEIGHT = PlayerView.RADIUS * 3;
  static readonly MAX_HP = 50;
  static readonly SPEED = 220;

  hp: number;
  private material: THREE.MeshLambertMaterial;
  private serverX: number;
  private serverY: number;
  private interpX: number;
  private interpY: number;

  constructor(state: PlayerState) {
    super();
    this.material = new THREE.MeshLambertMaterial({ color: new THREE.Color(state.color) });
    const mesh = new THREE.Mesh(geom, this.material);
    mesh.position.y = PlayerView.HEIGHT / 2;
    mesh.castShadow = true;
    this.add(mesh);

    this.position.set(state.x, 0, state.y);
    this.serverX = this.interpX = state.x;
    this.serverY = this.interpY = state.y;
    this.hp = state.hp;
  }

  applyServerState(state: PlayerState) {
    if (state.hp < this.hp) sfx.damage(state.x, state.y);
    this.serverX = state.x;
    this.serverY = state.y;
    this.hp = state.hp;
  }

  /** Remote players: ease toward the authoritative position. */
  update(dt: number) {
    const k = 1 - Math.exp(-15 * dt);
    this.interpX += (this.serverX - this.interpX) * k;
    this.interpY += (this.serverY - this.interpY) * k;
    this.position.x = this.interpX;
    this.position.z = this.interpY;
  }

  /** Local player: apply client-predicted position directly, no lerp. */
  setPredictedPosition(x: number, z: number) {
    this.interpX = x;
    this.interpY = z;
    this.position.x = x;
    this.position.z = z;
  }

  dispose() {
    this.removeFromParent();
    this.material.dispose();
  }
}

const geom = new THREE.BoxGeometry(
  PlayerView.RADIUS * 2,
  PlayerView.HEIGHT,
  PlayerView.RADIUS * 2,
);
