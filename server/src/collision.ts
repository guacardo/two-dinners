type Positioned = { x: number; y: number };
type Hitbox = { HALF_W: number; HALF_D: number };

export function aabbOverlap(
  a: Positioned, aCls: Hitbox,
  b: Positioned, bCls: Hitbox,
): boolean {
  return Math.abs(a.x - b.x) <= aCls.HALF_W + bCls.HALF_W
      && Math.abs(a.y - b.y) <= aCls.HALF_D + bCls.HALF_D;
}
