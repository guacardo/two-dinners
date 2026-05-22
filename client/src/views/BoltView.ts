import * as THREE from "three";
import { sfx } from "../audio";

export interface BoltState {
  x: number;
  y: number;
}

export class BoltView extends THREE.Group {
  static readonly RADIUS = 5;
  static readonly Y = 26;

  private serverX: number;
  private serverY: number;
  private interpX: number;
  private interpY: number;

  constructor(state: BoltState) {
    super();
    const mesh = new THREE.Mesh(geom, material);
    mesh.position.y = BoltView.Y;
    this.add(mesh);

    this.position.set(state.x, 0, state.y);
    this.serverX = this.interpX = state.x;
    this.serverY = this.interpY = state.y;

    sfx.cast(state.x, state.y);
  }

  applyServerState(state: BoltState) {
    this.serverX = state.x;
    this.serverY = state.y;
  }

  update(dt: number) {
    const k = 1 - Math.exp(-30 * dt);
    this.interpX += (this.serverX - this.interpX) * k;
    this.interpY += (this.serverY - this.interpY) * k;
    this.position.x = this.interpX;
    this.position.z = this.interpY;
  }

  dispose() {
    sfx.hit(this.position.x, this.position.z);
    this.removeFromParent();
  }
}

const geom = new THREE.SphereGeometry(BoltView.RADIUS, 12, 8);
const material = new THREE.MeshBasicMaterial({ color: 0xf0e36a });
