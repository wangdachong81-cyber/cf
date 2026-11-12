import type { Vector3 } from "three";
export interface Collider {
  min: Vector3;
  max: Vector3;
  surface: string;
  tag: string;
  noNav: boolean;
  bulletOnly: boolean;
  playerOnly: boolean;
}
export interface OriginalPhysics {
  boxes: Collider[];
  addBox(
    min: number[] | Vector3,
    max: number[] | Vector3,
    options?: Partial<Collider>,
  ): Collider;
  build(): void;
  groundHeight(x: number, z: number, maxY?: number): number;
  moveCapsule(
    position: Vector3,
    velocity: Vector3,
    dt: number,
    radius?: number,
    height?: number,
    step?: boolean,
  ): { onGround: boolean; hitWall: boolean; hitCeil: boolean; surface: string };
  raycast(
    origin: Vector3,
    direction: Vector3,
    range?: number,
  ): {
    dist: number;
    point: Vector3;
    normal: Vector3;
    surface: string;
    box: Collider | null;
  } | null;
  nav: { isWalkable(x: number, z: number): boolean };
}
export function createPhysics(context: unknown): OriginalPhysics;
export const worldBounds: {
  min: Vector3;
  max: Vector3;
  groundY: number;
  seaY: number;
  quayX: number;
};
