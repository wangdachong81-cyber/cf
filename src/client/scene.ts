import * as THREE from "three";
import { CharacterFactory } from "./character";
import { RULES, WORLD_SEED, WORLD_COLLIDERS } from "../shared/config";
import { createPhysics } from "../shared/original/physics.js";
import { groundAt } from "../shared/physics";
import type { Body, Player, Shot } from "../shared/protocol";
import {
  createRenderer,
  createMaterials,
  createProps,
  createLevel,
  createBackdrop,
  createGround,
  createEffects,
  createWeapon,
  createEvents,
  createRandom,
  selectQuality,
  type OriginalRender,
  type OriginalMaterials,
  type OriginalLevel,
  type OriginalWeapon,
} from "./original/engine.js";

type Context = {
  canvas: HTMLCanvasElement;
  params: Record<string, string>;
  time: { t: number; dt: number; frame: number; real: number };
  quality: ReturnType<typeof selectQuality>;
  rng: ReturnType<typeof createRandom>;
  events: ReturnType<typeof createEvents>;
  render: OriginalRender;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  viewCamera: THREE.PerspectiveCamera;
  mats: OriginalMaterials;
  props: unknown;
  level: OriginalLevel;
  physics: ReturnType<typeof createPhysics>;
  backdrop: Awaited<ReturnType<typeof createBackdrop>>;
  ground: Awaited<ReturnType<typeof createGround>>;
  fx: Awaited<ReturnType<typeof createEffects>>;
  weapon: OriginalWeapon;
  player: {
    pos: THREE.Vector3;
    eye: THREE.Vector3;
    vel: THREE.Vector3;
    forward: THREE.Vector3;
    alive: boolean;
    onGround: boolean;
    sprinting: boolean;
    crouching: boolean;
    speed: number;
    ads: number;
    addRecoil: (p: number, y: number) => void;
    addShake: (amount: number) => void;
  };
  input: {
    fire: boolean;
    ads: boolean;
    move: { x: number; y: number };
    look: { dx: number; dy: number };
    pressed: () => boolean;
  };
  combat: { playerShot: () => { point: THREE.Vector3 } | null };
};
export class ArenaView {
  actors = new Map<string, THREE.Group>();
  onRecoil: (pitch: number, yaw: number) => void = () => {};
  private local: Player | undefined;
  private localShot: Shot | null = null;
  private reloadStartedAt = 0;
  private visualShake = 0;
  private lastYaw = 0;
  private lastPitch = 0;
  private previousPosition = new THREE.Vector3();
  private renderPosition = new THREE.Vector3();
  private wasPlaying = false;
  private characters!: CharacterFactory;
  private constructor(private context: Context) {}
  get renderer() {
    return this.context.renderer;
  }
  get scene() {
    return this.context.scene;
  }
  get camera() {
    return this.context.camera;
  }
  get quality() {
    return this.context.quality.name;
  }
  get stats() {
    return {
      ...this.context.render.stats(),
      materials: this.context.mats.stats(),
      colliders: this.context.physics.boxes.length,
      expectedColliders: WORLD_COLLIDERS.length,
    };
  }
  static async create(
    canvas: HTMLCanvasElement,
    progress: (text: string) => void,
  ) {
    const context = {
      canvas,
      params: {},
      time: { t: 0, dt: 0, frame: 0, real: 0 },
      events: createEvents(),
      rng: createRandom(WORLD_SEED),
    } as Context;
    const requested = localStorage.getItem("arena-quality");
    context.quality = selectQuality(
      requested && ["low", "medium", "high", "ultra"].includes(requested)
        ? requested
        : "high",
    );
    const view = new ArenaView(context);
    progress("正在恢复原版光照与后处理…");
    context.render = await createRenderer(context);
    context.renderer = context.render.renderer;
    context.scene = context.render.scene;
    context.camera = context.render.camera;
    context.viewCamera = context.render.viewCamera;
    progress("正在生成原版 PBR 材质、锈迹与雨水…");
    context.mats = await createMaterials(context);
    context.physics = createPhysics(context);
    context.props = createProps(context);
    progress("正在布置原版港区、仓库与集装箱…");
    context.level = await createLevel(context);
    context.backdrop = await createBackdrop(context);
    context.physics.build();
    progress("正在生成湿地反射、海面与雨雾…");
    context.ground = await createGround(context);
    context.fx = await createEffects(context);
    context.input = {
      fire: false,
      ads: false,
      move: { x: 0, y: 0 },
      look: { dx: 0, dy: 0 },
      pressed: () => false,
    };
    context.player = {
      pos: new THREE.Vector3(),
      eye: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      forward: new THREE.Vector3(0, 0, -1),
      alive: true,
      onGround: true,
      sprinting: false,
      crouching: false,
      speed: 0,
      ads: 0,
      addRecoil: (p, y) => view.onRecoil(p, y),
      addShake: (amount) =>
        (view.visualShake = Math.min(0.6, view.visualShake + amount)),
    };
    context.combat = {
      playerShot: () =>
        view.localShot
          ? { point: new THREE.Vector3(...view.localShot.to) }
          : null,
    };
    progress("正在加载原版枪械、手部和动画…");
    context.weapon = await createWeapon(context);
    context.weapon.debug.noFire = true;
    context.weapon.setVisible(false);
    view.characters = new CharacterFactory(context.mats);
    progress("正在编译原版场景着色器…");
    await context.render.onLevelReady();
    return view;
  }
  setQuality(name: string) {
    if (!["low", "medium", "high", "ultra"].includes(name)) return;
    localStorage.setItem("arena-quality", name);
    this.context.quality = selectQuality(name);
    this.context.render.setQuality(this.context.quality);
  }
  setCombatState(player: Player | undefined) {
    if (player && player.reloadAt !== this.local?.reloadAt && player.reloadAt)
      this.reloadStartedAt = player.reloadAt - RULES.reload;
    if (!player || (!player.reloadAt && this.local?.reloadAt))
      this.context.weapon.reset();
    this.local = player;
  }
  sync(players: Player[], self: string) {
    for (const player of players) {
      if (player.id === self) continue;
      let actor = this.actors.get(player.id);
      if (!actor) {
        actor = this.characters.create(player.color);
        actor.position.set(player.x, player.y, player.z);
        this.actors.set(player.id, actor);
        this.scene.add(actor);
      }
      actor.visible = player.health > 0;
      actor.userData.target = new THREE.Vector3(player.x, player.y, player.z);
      actor.userData.yaw = player.yaw;
      actor.userData.pitch = player.pitch;
      actor.userData.airborne = Math.abs(player.vy) > 0.1;
      actor.userData.reloading = player.reloadAt > 0;
      actor.userData.protection.visible = player.protectedUntil > Date.now();
    }
    for (const [id, actor] of this.actors)
      if (!players.some((p) => p.id === id)) {
        this.scene.remove(actor);
        this.characters.release(actor);
        this.actors.delete(id);
      }
  }
  shot(shot: Shot, self: string) {
    const ctx = this.context,
      from = new THREE.Vector3(...shot.from),
      to = new THREE.Vector3(...shot.to);
    if (shot.shooter === self) {
      this.localShot = shot;
      ctx.weapon.playShot();
      this.localShot = null;
    } else {
      ctx.fx.tracer(from, to);
      ctx.render.lightPool.flash(from, 0xffc480, 28, 8, 0.045);
    }
    if (!shot.hit) {
      const dir = to.clone().sub(from).normalize(),
        hit = ctx.physics.raycast(from, dir, RULES.range);
      if (hit && hit.point.distanceTo(to) < 0.15)
        ctx.fx.impact(hit.point, hit.normal, hit.surface);
    }
  }
  frame(
    dt: number,
    time: number,
    body: Body | null,
    yaw: number,
    pitch: number,
    ads: boolean,
    moving: boolean,
  ) {
    const ctx = this.context;
    ctx.time.dt = dt;
    ctx.time.t = time;
    ctx.time.real = performance.now() / 1000;
    ctx.time.frame++;
    if (body) {
      const targetPosition = new THREE.Vector3(body.x, body.y, body.z);
      if (
        !this.wasPlaying ||
        this.renderPosition.distanceTo(targetPosition) > 3
      )
        this.renderPosition.copy(targetPosition);
      else this.renderPosition.lerp(targetPosition, 1 - Math.exp(-dt * 40));
      this.wasPlaying = true;
      this.camera.position.copy(this.renderPosition);
      this.camera.position.y += RULES.eye;
      this.camera.rotation.set(pitch, yaw, 0, "YXZ");
      ctx.player.pos.copy(this.renderPosition);
      ctx.player.eye.copy(this.camera.position);
      ctx.player.forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
      const distance = ctx.player.pos.distanceTo(this.previousPosition);
      ctx.player.speed = THREE.MathUtils.lerp(
        ctx.player.speed,
        moving && distance < 2
          ? Math.min(RULES.sprintSpeed, distance / Math.max(0.001, dt))
          : 0,
        1 - Math.exp(-dt * 14),
      );
      ctx.player.vel
        .copy(ctx.player.pos)
        .sub(this.previousPosition)
        .divideScalar(Math.max(0.001, dt));
      ctx.player.vel.y = body.vy;
      ctx.player.onGround =
        body.y <= groundAt(body.x, body.z, body.y + 0.05) + 0.04;
      ctx.player.sprinting =
        moving && ctx.player.speed > RULES.speed + 0.5 && !ads;
      this.previousPosition.copy(ctx.player.pos);
      ctx.input.ads = ads;
      ctx.input.look.dx = yaw - this.lastYaw;
      ctx.input.look.dy = pitch - this.lastPitch;
      const reloadAt = this.local?.reloadAt ?? 0;
      ctx.weapon.debug.reloadT = reloadAt
        ? Math.min(
            2.09,
            Math.max(
              0,
              ((Date.now() - this.reloadStartedAt) / RULES.reload) * 2.1,
            ),
          )
        : null;
      ctx.weapon.debug.empty = false;
      ctx.weapon.ammo = this.local?.ammo ?? RULES.magazine;
      ctx.weapon.reserve = 999;
      ctx.weapon.setVisible(true);
      ctx.weapon.update(dt);
      ctx.weapon.setWetness(ctx.ground.wetnessAt(body.x, body.z));
      this.camera.fov = THREE.MathUtils.lerp(
        this.camera.fov,
        ads ? 52 : 74,
        1 - Math.exp(-dt * 14),
      );
      ctx.render.post.ads = ctx.weapon.ads;
      ctx.render.post.lowHealth = this.local
        ? Math.max(0, 1 - this.local.health / 40)
        : 0;
      this.visualShake *= Math.exp(-dt * 20);
      this.camera.rotation.z = Math.sin(time * 73) * this.visualShake * 0.008;
    } else {
      // Keep the original ground-level cinematic framing, instead of a bird's-eye orbit.
      this.wasPlaying = false;
      const path = ctx.level.cinematicPath,
        cursor = (time * 0.035) % (path.length - 1),
        index = Math.floor(cursor),
        t = cursor - index;
      const a = path[index],
        b = path[index + 1];
      this.camera.position
        .fromArray(a.pos)
        .lerp(new THREE.Vector3().fromArray(b.pos), t);
      const target = new THREE.Vector3()
        .fromArray(a.look)
        .lerp(new THREE.Vector3().fromArray(b.look), t);
      this.camera.lookAt(target);
      this.camera.fov = 74;
      ctx.weapon.setVisible(false);
      ctx.render.post.ads = 0;
      ctx.render.post.lowHealth = 0;
    }
    this.lastYaw = yaw;
    this.lastPitch = pitch;
    this.camera.updateProjectionMatrix();
    for (const actor of this.actors.values()) {
      const target = actor.userData.target as THREE.Vector3;
      const previous = actor.position.clone();
      const distance = actor.position.distanceTo(target);
      if (distance > 6) actor.position.copy(target);
      else actor.position.lerp(target, 1 - Math.exp(-dt * 18));
      const diff = Math.atan2(
        Math.sin(actor.userData.yaw - actor.rotation.y),
        Math.cos(actor.userData.yaw - actor.rotation.y),
      );
      actor.rotation.y += diff * Math.min(1, dt * 18);
      const speed =
        distance > 6
          ? 0
          : Math.min(
              RULES.sprintSpeed,
              actor.position.distanceTo(previous) / Math.max(0.001, dt),
            );
      this.characters.update(
        actor,
        dt,
        speed,
        actor.userData.pitch,
        actor.userData.airborne,
        actor.userData.reloading,
      );
    }
    ctx.fx.update(dt);
    ctx.ground.update(dt);
    ctx.level.update(dt);
    ctx.backdrop.update(dt);
    ctx.mats.update(dt);
    ctx.render.frame(dt);
  }
}
