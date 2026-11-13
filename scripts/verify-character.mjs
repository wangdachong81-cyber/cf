import fs from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
  headless: true,
  args: ["--enable-unsafe-swiftshader"],
});
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(process.env.ARENA_TEST_URL ?? "http://localhost:5173");
  await page.waitForFunction(() => window.__arena, { timeout: 90000 });
  await page.evaluate(() => {
    document.querySelector("#lobby").hidden = true;
    document.querySelector(".masthead").hidden = true;
    document.body.classList.add("deployed");
    const view = window.__arena;
    const state = {
      id: "portrait",
      name: "对手视角",
      color: "#69c8d3",
      x: -28,
      y: 0,
      z: 6,
      vy: 0,
      yaw: Math.PI / 2,
      pitch: 0,
      health: 100,
      kills: 0,
      deaths: 0,
      ammo: 30,
      reloadAt: 0,
      respawnAt: 0,
      protectedUntil: 0,
      ack: 0,
    };
    view.sync([state], "viewer");
    const frame = view.frame.bind(view);
    view.frame = (dt) => {
      frame(
        dt,
        0,
        { x: -32, y: -0.35, z: 6, vy: 0 },
        -Math.PI / 2,
        -0.085,
        false,
        false,
      );
      view.context.weapon.root.visible = false;
      view.context.render.frame(dt);
    };
    window.portrait = state;
  });
  fs.mkdirSync("artifacts", { recursive: true });
  for (const [angle, yaw] of [
    ["front", Math.PI / 2],
    ["side", 0],
    ["back", -Math.PI / 2],
  ]) {
    await page.evaluate((yaw) => {
      window.portrait.yaw = yaw;
      window.__arena.sync([window.portrait], "viewer");
    }, yaw);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `artifacts/character-${angle}.png` });
  }
  const animation = await page.evaluate(() => {
    const view = window.__arena,
      actor = view.actors.get("portrait");
    view.characters.update(actor, 0.1, 6, 0.4, false, false);
    const walk = actor.getObjectByName("left-leg").rotation.x;
    const aim = actor.getObjectByName("upper").rotation.x;
    view.characters.update(actor, 0.1, 0, 0.4, true, true);
    return {
      walk,
      aim,
      knee: actor.getObjectByName("left-knee").rotation.x,
      reload: actor.getObjectByName("rifle").rotation.z,
    };
  });
  assert.notEqual(animation.walk, 0);
  assert.ok(animation.aim > 0);
  assert.ok(animation.knee < 0);
  assert.ok(animation.reload < 0);
  const metrics = await page.evaluate(() => {
    const actor = window.__arena.actors.get("portrait");
    const model = { meshes: 0, triangles: 0, bodyColors: [], bounds: null };
    actor.traverse((o) => {
      if (o.isMesh) {
        model.meshes++;
        model.triangles +=
          (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
        if (o.material.color)
          model.bodyColors.push(o.material.color.getHexString());
      }
    });
    return model;
  });
  assert.ok(metrics.triangles > 20000);
  assert.ok(
    metrics.meshes < 70,
    "Static parts should batch by material, preserving animation joints",
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        meshes: metrics.meshes,
        triangles: metrics.triangles,
        colors: [...new Set(metrics.bodyColors)],
        errors,
      },
      null,
      2,
    ),
  );
  await page.evaluate(() => {
    const view = window.__arena;
    for (let n = 0; n < 10; n++) {
      view.sync([], "viewer");
      view.sync([window.portrait], "viewer");
    }
  });
  await page.waitForTimeout(200);
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
