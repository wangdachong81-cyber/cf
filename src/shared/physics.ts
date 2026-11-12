import { Vector3 } from "three";
import { RULES, WORLD_BOUNDS, WORLD_COLLIDERS } from "./config";
import { createPhysics } from "./original/physics.js";
import type { Body, Input } from "./protocol";
export const worldPhysics = createPhysics({});
for (const { min, max, ...options } of WORLD_COLLIDERS)
  worldPhysics.addBox(min, max, options);
worldPhysics.build();
const position = new Vector3(),
  velocity = new Vector3();
export function groundAt(x: number, z: number, maxY = 0.42) {
  return worldPhysics.groundHeight(x, z, maxY);
}
export function freeAt(x: number, z: number, r: number = RULES.radius) {
  if (
    x < WORLD_BOUNDS.minX + r ||
    x > WORLD_BOUNDS.maxX - r ||
    z < WORLD_BOUNDS.minZ + r ||
    z > WORLD_BOUNDS.maxZ - r
  )
    return false;
  if (!worldPhysics.nav.isWalkable(x, z)) return false;
  const floor = groundAt(x, z);
  return !worldPhysics.boxes.some(
    (b) =>
      !b.bulletOnly &&
      b.max.y > floor + 0.42 &&
      b.min.y < floor + 1.8 &&
      x > b.min.x - r &&
      x < b.max.x + r &&
      z > b.min.z - r &&
      z < b.max.z + r,
  );
}
export function move(body: Body, input: Input, dt: number) {
  const length = Math.max(1, Math.hypot(input.forward, input.strafe));
  const speed = input.sprint ? RULES.sprintSpeed : RULES.speed;
  const f = input.forward / length,
    s = input.strafe / length;
  position.set(body.x, body.y, body.z);
  const floor = groundAt(body.x, body.z, body.y + 0.05);
  let vy = body.vy;
  if (input.jump && body.y <= floor + 0.05 && vy <= 0) vy = RULES.jumpSpeed;
  velocity.set(
    (Math.cos(input.yaw) * s - Math.sin(input.yaw) * f) * speed,
    vy - RULES.gravity * dt,
    (-Math.sin(input.yaw) * s - Math.cos(input.yaw) * f) * speed,
  );
  worldPhysics.moveCapsule(position, velocity, dt, RULES.radius, 1.8, true);
  body.x = Math.max(
    WORLD_BOUNDS.minX + RULES.radius,
    Math.min(WORLD_BOUNDS.maxX - RULES.radius, position.x),
  );
  body.z = Math.max(
    WORLD_BOUNDS.minZ + RULES.radius,
    Math.min(WORLD_BOUNDS.maxZ - RULES.radius, position.z),
  );
  body.y = position.y;
  body.vy = velocity.y;
}
export function direction(
  yaw: number,
  pitch: number,
): [number, number, number] {
  return [
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch),
  ];
}
export function rayBox(
  origin: number[],
  dir: number[],
  min: number[],
  max: number[],
) {
  let near = 0,
    far = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dir[i]) < 1e-8) {
      if (origin[i] < min[i] || origin[i] > max[i]) return Infinity;
      continue;
    }
    const a = (min[i] - origin[i]) / dir[i],
      b = (max[i] - origin[i]) / dir[i];
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
    if (near > far) return Infinity;
  }
  return far < 0 ? Infinity : near;
}
export function wallDistance(origin: number[], dir: number[]) {
  const hit = worldPhysics.raycast(
    new Vector3(...origin),
    new Vector3(...dir),
    RULES.range,
  );
  return hit?.dist ?? RULES.range;
}
