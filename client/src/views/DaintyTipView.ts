import * as THREE from "three";
import { sfx } from "../audio";

export interface DaintyTipState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export class DaintyTipView extends THREE.Group {
  static readonly LENGTH = 50;
  static readonly RADIUS = 2.5;
  static readonly Y = 26;

  private serverX: number;
  private serverY: number;
  private interpX: number;
  private interpY: number;

  constructor(state: DaintyTipState) {
    super();

    const finger = new THREE.Mesh(fingerGeom, fingerMat);
    finger.rotation.z = Math.PI / 2; // capsule is Y-aligned by default; rotate length onto +X
    finger.castShadow = true;
    this.add(finger);

    const nail = new THREE.Mesh(nailGeom, nailMat);
    nail.position.set(DaintyTipView.LENGTH / 2 - 0.5, DaintyTipView.RADIUS * 0.5, 0);
    this.add(nail);

    // Palm knuckle ball at the rear of the finger — the "back of the hand".
    const palm = new THREE.Mesh(palmGeom, fingerMat);
    palm.position.set(-DaintyTipView.LENGTH / 2, 0, 0);
    palm.castShadow = true;
    this.add(palm);

    // Thumb extending sideways from the palm, perpendicular to flight direction.
    // Reads as a 👉 silhouette from the top-down camera.
    const thumb = new THREE.Mesh(thumbGeom, fingerMat);
    thumb.rotation.x = Math.PI / 2; // capsule (Y-aligned) onto +Z
    thumb.position.set(
      -DaintyTipView.LENGTH / 2 + 2,
      0,
      PALM_RADIUS + THUMB_LENGTH / 2,
    );
    thumb.castShadow = true;
    this.add(thumb);

    this.position.set(state.x, DaintyTipView.Y, state.y);
    // Top-down: +Y world-axis rotation maps +X mesh-axis to (cos θ, 0, -sin θ).
    // We want it pointing at scene direction (vx, 0, vy), so θ = -atan2(vy, vx).
    this.rotation.y = -Math.atan2(state.vy, state.vx);

    this.serverX = this.interpX = state.x;
    this.serverY = this.interpY = state.y;

    sfx.cast(state.x, state.y);
  }

  applyServerState(state: { x: number; y: number }) {
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

const PALM_RADIUS = DaintyTipView.RADIUS * 1.8;
const THUMB_RADIUS = DaintyTipView.RADIUS * 0.9;
const THUMB_LENGTH = 8; // cylindrical section; total thumb ≈ THUMB_LENGTH + 2*THUMB_RADIUS

const fingerGeom = new THREE.CapsuleGeometry(DaintyTipView.RADIUS, DaintyTipView.LENGTH - DaintyTipView.RADIUS * 2, 4, 8);
const fingerMat = new THREE.MeshLambertMaterial({ color: 0xe8d2b8 });

const nailGeom = new THREE.BoxGeometry(3, 0.5, DaintyTipView.RADIUS * 1.6);
const nailMat = new THREE.MeshBasicMaterial({ color: 0xf5e6e6 });

const palmGeom = new THREE.SphereGeometry(PALM_RADIUS, 12, 8);
const thumbGeom = new THREE.CapsuleGeometry(THUMB_RADIUS, THUMB_LENGTH, 3, 6);
