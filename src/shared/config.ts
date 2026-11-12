import originalMap from "./original/map.json";
export const RULES = {
  tickRate: 30,
  maxPlayers: 8,
  maxSpectators: 16,
  duration: 300_000,
  killLimit: 20,
  respawn: 3000,
  protection: 2000,
  roundBreak: 10_000,
  speed: 6,
  sprintSpeed: 8.5,
  radius: 0.36,
  eye: 1.68,
  jumpSpeed: 6,
  gravity: 18,
  magazine: 30,
  reload: 1800,
  fireInterval: 150,
  damage: 34,
  range: 100,
} as const;
export const COLORS = [
  "#f5ad55",
  "#69c8d3",
  "#b5cf77",
  "#c697e0",
  "#ee7f85",
  "#8aaafa",
  "#f0d778",
  "#85d4b1",
];
export const WORLD_BOUNDS = originalMap.bounds;
export const WORLD_COLLIDERS = originalMap.colliders;
export const WORLD_SEED = originalMap.seed;
export const SPAWN_POINTS = originalMap.spawnPoints;
export const ARENA_SIZE = Math.max(
  WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX,
  WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ,
);
export interface Block {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  color: string;
}
// The spectator map projects the exact same colliders used by the server.
export const BLOCKS: Block[] = WORLD_COLLIDERS.filter(
  (b) => !b.bulletOnly && b.min[1] < 1.8 && b.max[1] > 0.42,
).map((b) => ({
  x: (b.min[0] + b.max[0]) / 2,
  z: (b.min[2] + b.max[2]) / 2,
  w: b.max[0] - b.min[0],
  d: b.max[2] - b.min[2],
  h: b.max[1] - b.min[1],
  color:
    b.surface === "metal"
      ? "#5a7373"
      : b.surface === "wood"
        ? "#927e5d"
        : "#6b7469",
}));
