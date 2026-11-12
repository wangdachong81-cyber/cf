import fs from "node:fs";
import assert from "node:assert/strict";
import { once } from "node:events";
import { chromium } from "@playwright/test";
import { WebSocket } from "ws";
const base = process.env.ARENA_TEST_URL ?? "http://localhost:5173";
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
  headless: true,
  args: ["--enable-unsafe-swiftshader"],
});
const errors = [];
let bot;
const observe = (page) => {
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
};
try {
  fs.mkdirSync("artifacts", { recursive: true });
  const player = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  observe(player);
  await player.goto(base);
  await player.waitForFunction(() => window.__arena, { timeout: 90000 });
  await player.screenshot({ path: "artifacts/restored-lobby.png" });
  const diagnostics = await player.evaluate(() => window.__arena.stats);
  assert.equal(diagnostics.advanced, true);
  assert.equal(diagnostics.softShadows, true);
  assert.equal(diagnostics.colliders, 557);
  const { WORLD_COLLIDERS } = await import("../src/shared/config.ts");
  const liveColliders = await player.evaluate(() =>
    window.__arena.context.physics.boxes.map(({ min, max, ...rest }) => ({
      ...rest,
      min: min.toArray(),
      max: max.toArray(),
    })),
  );
  assert.equal(liveColliders.length, WORLD_COLLIDERS.length);
  for (let index = 0; index < liveColliders.length; index++) {
    const live = liveColliders[index],
      baked = WORLD_COLLIDERS[index];
    for (const key of ["surface", "tag", "noNav", "bulletOnly", "playerOnly"])
      assert.equal(live[key], baked[key]);
    for (const edge of ["min", "max"])
      for (let axis = 0; axis < 3; axis++)
        assert.ok(
          Math.abs(live[edge][axis] - baked[edge][axis]) < 1e-9,
          `Collider ${index} differs on ${edge}/${axis}`,
        );
  }
  await player.locator("#nickname").fill("画面验收");
  await player.locator("#create").click();
  await player.locator("#session").waitFor({ state: "visible" });
  const room = (await player.locator("#room-title").textContent()).match(
    /\d{6}/,
  )[0];
  bot = new WebSocket(base.replace(/^http/, "ws") + "/ws");
  await once(bot, "open");
  let botState;
  bot.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type === "state") botState = msg;
  });
  bot.send(
    JSON.stringify({
      type: "join",
      name: "联机对手",
      room,
      role: "player",
      create: false,
    }),
  );
  await player.waitForFunction(() => window.__arena.actors.size === 1, {
    timeout: 10000,
  });
  // Exercise an accepted local shot through the original viewmodel/effects code.
  await player.evaluate(() => {
    const v = window.__arena,
      id = v.local.id;
    const p = v.local;
    v.shot(
      {
        id: 98765,
        shooter: id,
        from: [p.x, p.y + 1.68, p.z],
        to: [p.x, p.y + 1.68, p.z - 12],
        hit: null,
        kill: false,
      },
      id,
    );
  });
  await player.locator("#resume").click();
  await player.waitForFunction(
    () => document.pointerLockElement?.id === "world",
  );
  await player.keyboard.down("KeyW");
  await player.waitForTimeout(300);
  await player.keyboard.up("KeyW");
  await player.mouse.down();
  await player.waitForTimeout(450);
  await player.mouse.up();
  await player.waitForFunction(
    () => Number(document.querySelector("#ammo").textContent) < 30,
  );
  const ammo = Number(await player.locator("#ammo").textContent());
  assert.ok(ammo < 30 && ammo > 0);
  await player.keyboard.press("KeyR");
  await player.waitForFunction(() =>
    document.querySelector("#reload-hint").textContent.includes("正在换弹"),
  );
  await player.waitForFunction(
    () => document.querySelector("#ammo").textContent === "30",
    { timeout: 5000 },
  );
  await player.screenshot({ path: "artifacts/multiplayer-gameplay.png" });
  const spectator = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  observe(spectator);
  await spectator.goto(base + "/?room=" + room);
  await spectator.waitForFunction(() => window.__arena, { timeout: 90000 });
  await spectator.locator("#nickname").fill("观战验收");
  await spectator.locator('[data-role="spectator"]').click();
  await spectator.locator("#join").click();
  await spectator.locator("#spectator").waitFor({ state: "visible" });
  await spectator.waitForFunction(
    () => document.querySelectorAll("#rank-rows .rank-row").length === 2,
  );
  await spectator.screenshot({ path: "artifacts/restored-spectator.png" });
  assert.equal(botState.players.length, 2);
  assert.equal(botState.spectators, 1);
  assert.deepEqual(errors, [], "No browser or shader errors");
  console.log(
    JSON.stringify(
      {
        room,
        diagnostics,
        ammoAfterFiring: ammo,
        players: botState.players.length,
        spectators: botState.spectators,
        errors,
        screenshots: "artifacts/",
      },
      null,
      2,
    ),
  );
  await spectator.locator("#leave").click();
  await player.evaluate(() => document.exitPointerLock());
  await player.locator("#leave").click();
} finally {
  bot?.terminate();
  await browser.close();
}
