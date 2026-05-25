import * as THREE from "three";

export class OvenView extends THREE.Group {
  static readonly WIDTH = 120;
  static readonly HEIGHT = 140;
  static readonly DEPTH = 100;

  readonly door: THREE.Group;

  private static readonly TOP_THICKNESS = 8;
  private static readonly PANEL_HEIGHT = 18;
  private static readonly BURNER_RADIUS = 18;

  constructor(opts: { x: number; z: number }) {
    super();
    this.position.set(opts.x, 0, opts.z);

    this.add(this.buildBody());
    this.add(this.buildStovetop());
    this.add(this.buildBurners());
    this.add(this.buildControlPanel());
    this.door = this.buildDoor();
    this.add(this.door);
  }

  faceToward(targetX: number, targetZ: number) {
    lookTarget.set(targetX, this.position.y, targetZ);
    this.lookAt(lookTarget);
  }

  private get bodyHeight(): number {
    return OvenView.HEIGHT - OvenView.TOP_THICKNESS;
  }

  private get frontZ(): number {
    return -OvenView.DEPTH / 2;
  }

  private buildBody(): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(OvenView.WIDTH, this.bodyHeight, OvenView.DEPTH),
      bodyMat,
    );
    mesh.position.y = this.bodyHeight / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildStovetop(): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        OvenView.WIDTH + 4,
        OvenView.TOP_THICKNESS,
        OvenView.DEPTH + 4,
      ),
      topMat,
    );
    mesh.position.y = this.bodyHeight + OvenView.TOP_THICKNESS / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildBurners(): THREE.Group {
    const group = new THREE.Group();
    const r = OvenView.BURNER_RADIUS;
    const y = this.bodyHeight + OvenView.TOP_THICKNESS + 0.5;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(r + 2, r + 2, 2, 24),
        ringMat,
      );
      ring.position.set(sx * OvenView.WIDTH * 0.25, y, sz * OvenView.DEPTH * 0.25);
      group.add(ring);

      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, 2.5, 24),
        burnerMat,
      );
      disc.position.set(sx * OvenView.WIDTH * 0.25, y + 0.5, sz * OvenView.DEPTH * 0.25);
      group.add(disc);
    }
    return group;
  }

  private buildControlPanel(): THREE.Group {
    const group = new THREE.Group();
    const panelY = this.bodyHeight - OvenView.PANEL_HEIGHT / 2 - 4;

    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(OvenView.WIDTH - 12, OvenView.PANEL_HEIGHT, 2),
      topMat,
    );
    panel.position.set(0, panelY, this.frontZ - 1);
    group.add(panel);

    for (const kx of [-32, 0, 32]) {
      const knob = new THREE.Mesh(
        new THREE.CylinderGeometry(4, 4, 3, 12),
        metalMat,
      );
      knob.rotation.x = Math.PI / 2;
      knob.position.set(kx, panelY, this.frontZ - 3);
      group.add(knob);
    }
    return group;
  }

  private buildDoor(): THREE.Group {
    // Group origin = hinge (bottom-front edge of the door); rotating
    // group.rotation.x opens the door downward toward the player later.
    const group = new THREE.Group();
    const doorHeight = this.bodyHeight - OvenView.PANEL_HEIGHT - 16;
    const doorWidth = OvenView.WIDTH - 16;
    const doorBottomY = 8;
    group.position.set(0, doorBottomY, this.frontZ);

    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(doorWidth, doorHeight, 3),
      doorMat,
    );
    panel.position.set(0, doorHeight / 2, -1.5);
    panel.castShadow = true;
    group.add(panel);

    const win = new THREE.Mesh(
      new THREE.BoxGeometry(doorWidth * 0.7, doorHeight * 0.55, 1),
      windowMat,
    );
    win.position.set(0, doorHeight * 0.55, -3.2);
    group.add(win);

    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(2, 2, doorWidth * 0.8, 10),
      metalMat,
    );
    handle.rotation.z = Math.PI / 2;
    handle.position.set(0, doorHeight - 6, -4);
    group.add(handle);

    return group;
  }
}

const bodyMat   = new THREE.MeshLambertMaterial({ color: 0x2a2c30 });
const topMat    = new THREE.MeshLambertMaterial({ color: 0x1f2024 });
const burnerMat = new THREE.MeshLambertMaterial({ color: 0x141416 });
const ringMat   = new THREE.MeshLambertMaterial({ color: 0x303236 });
const doorMat   = new THREE.MeshLambertMaterial({ color: 0x26282d });
const windowMat = new THREE.MeshLambertMaterial({ color: 0x09090c });
const metalMat  = new THREE.MeshLambertMaterial({ color: 0x787c84 });

const lookTarget = new THREE.Vector3();
