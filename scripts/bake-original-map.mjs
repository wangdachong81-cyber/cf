// Use the same original prop/level factories as the browser; no GPU is needed
// to export their explicit collision boxes and generated map layout.
import fs from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import * as THREE from "three";
import {
  createLevel,
  createProps,
  createRandom,
  createBackdrop,
  createEvents,
} from "../src/client/original/engine.js";
import { createPhysics } from "../src/shared/original/physics.js";
globalThis.document = {
  createElement: () => createCanvas(1, 1),
  fonts: { load: () => Promise.resolve(), addEventListener: () => {} },
};
const materials = new Map();
const labelCanvas = createCanvas(8, 8),
  labelMaterial = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(labelCanvas),
    transparent: true,
  });
const ctx = {
  params: {},
  time: { t: 0, dt: 1 / 60 },
  quality: { name: "high" },
  rng: createRandom(4207),
  events: createEvents(),
  scene: new THREE.Scene(),
  camera: new THREE.PerspectiveCamera(),
  render: { lightPool: { acquire: () => null } },
};
ctx.mats = {
  get(name, options = {}) {
    const key = name + JSON.stringify(options);
    if (!materials.has(key)) {
      const m = new THREE.MeshStandardMaterial({
        color: options.color ?? 0x777777,
        vertexColors: options.vertexColors ?? false,
      });
      m.name = name;
      materials.set(key, m);
    }
    return materials.get(key);
  },
  emissive: () => labelMaterial,
  label: () => ({ material: labelMaterial, aspect: 4 }),
  decal: () => ({ material: labelMaterial, aspect: 1 }),
  number: () => ({ material: labelMaterial, aspect: 1 }),
  names: [],
  tileOf: () => 1,
};
ctx.physics = createPhysics(ctx);
ctx.props = createProps(ctx);
ctx.level = await createLevel(ctx);
ctx.backdrop = await createBackdrop(ctx);
ctx.physics.build();
const data = {
  seed: 4207,
  bounds: { minX: -39, maxX: 29.4, minZ: -29, maxZ: 29 },
  colliders: ctx.physics.boxes.map((b) => ({
    ...b,
    min: b.min.toArray(),
    max: b.max.toArray(),
  })),
  placed: ctx.level.placed,
  spawnPoints: ctx.level.enemySpawns
    .filter((s) => s.type === "ground")
    .map((s) => s.pos.toArray()),
};
fs.writeFileSync("src/shared/original/map.json", JSON.stringify(data));
console.log(
  "Baked original map:",
  data.colliders.length,
  "collision boxes,",
  data.placed.length,
  "props,",
  data.spawnPoints.length,
  "spawn points",
);
