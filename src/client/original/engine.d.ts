import type * as THREE from "three";
export interface Quality {
  name: string;
  scale: number;
  msaa: number;
  shadow: number;
  tex: number;
  volSteps: number;
  ao: boolean;
  planar: number;
  bloom: boolean;
  motionBlur: boolean;
  rain: number;
}
export interface OriginalRender {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  viewCamera: THREE.PerspectiveCamera;
  post: Record<string, number>;
  exposure: number;
  advanced: boolean;
  frame(dt: number): void;
  resize(): void;
  onLevelReady(): Promise<void>;
  setQuality(quality: Quality): void;
  stats(): Record<string, unknown>;
  lightPool: {
    flash(
      position: THREE.Vector3,
      color?: number,
      power?: number,
      distance?: number,
      duration?: number,
    ): void;
  };
}
export interface OriginalMaterials {
  get(
    name: string,
    options?: Record<string, unknown>,
  ): THREE.MeshStandardMaterial;
  emissive(color: number, intensity: number): THREE.Material;
  update(dt: number): void;
  stats(): Record<string, unknown>;
}
export interface OriginalLevel {
  root: THREE.Group;
  cinematicPath: { pos: number[]; look: number[] }[];
  interiorBoxes: { min: THREE.Vector3; max: THREE.Vector3 }[];
  update(dt: number): void;
}
export interface OriginalEffects {
  update(dt: number): void;
  clear(): void;
  tracer(from: THREE.Vector3, to: THREE.Vector3): void;
  impact(point: THREE.Vector3, normal: THREE.Vector3, surface: string): void;
  smoke(point: THREE.Vector3, options?: Record<string, unknown>): void;
  shell(point: THREE.Vector3, velocity: THREE.Vector3): void;
}
export interface OriginalWeapon {
  root: THREE.Group;
  ammo: number;
  reserve: number;
  ads: number;
  debug: {
    noFire: boolean;
    flash: boolean;
    empty: boolean;
    reloadT: number | null;
  };
  playShot(): void;
  update(dt: number): void;
  reset(): void;
  setVisible(value: boolean): void;
  setWetness(value: number): void;
  muzzleWorld(target?: THREE.Vector3): THREE.Vector3;
}
export function createRenderer(context: unknown): Promise<OriginalRender>;
export function createMaterials(context: unknown): Promise<OriginalMaterials>;
export function createLevel(context: unknown): Promise<OriginalLevel>;
export function createProps(context: unknown): unknown;
export function createBackdrop(
  context: unknown,
): Promise<{ update(dt: number): void }>;
export function createGround(
  context: unknown,
): Promise<{
  update(dt: number): void;
  wetnessAt(x: number, z: number): number;
  setRain(value: number): void;
}>;
export function createEffects(context: unknown): Promise<OriginalEffects>;
export function createWeapon(context: unknown): Promise<OriginalWeapon>;
export function createRifleGeometry(): Record<string, THREE.BufferGeometry>;
export const rifleInfo: { name: string };
export function selectQuality(name?: string): Quality;
export function createEvents(): {
  on(name: string, callback: (data: unknown) => void): () => void;
  emit(name: string, data: unknown): void;
};
export function createRandom(
  seed?: number,
): (() => number) & { fork: () => () => number };
