import * as THREE from "three";
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
  private rifleTemplate!: THREE.Group;
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
    view.rifleTemplate = context.weapon.root.clone(true);
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
  private createActor(color: string) {
    const ctx = this.context,
      actor = new THREE.Group();
    const cloth = ctx.mats.get("glove_fabric", { triplanar: true });
    const armor = ctx.mats.get("polymer_black", { triplanar: true });
    const metal = ctx.mats.get("anodized_black", { triplanar: true });
    const mark = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.5,
      emissive: color,
      emissiveIntensity: 0.1,
    });
    const part = (
      geometry: THREE.BufferGeometry,
      mat: THREE.Material,
      x: number,
      y: number,
      z: number,
      parent: THREE.Object3D = actor,
    ) => {
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    part(new THREE.CapsuleGeometry(0.235, 0.43, 6, 12), cloth, 0, 1.09, 0);
    part(new THREE.BoxGeometry(0.43, 0.38, 0.13), armor, 0, 1.15, -0.18);
    part(new THREE.BoxGeometry(0.38, 0.4, 0.14), armor, 0, 1.14, 0.18);
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.14, 0.72, 0);
      actor.add(leg);
      part(
        new THREE.CapsuleGeometry(0.105, 0.43, 5, 10),
        cloth,
        0,
        -0.27,
        0,
        leg,
      );
      part(new THREE.BoxGeometry(0.15, 0.17, 0.09), armor, 0, -0.33, -0.1, leg);
      part(
        new THREE.BoxGeometry(0.17, 0.17, 0.29),
        armor,
        0,
        -0.65,
        -0.04,
        leg,
      );
      part(
        new THREE.CapsuleGeometry(0.1, 0.19, 5, 10),
        cloth,
        side * 0.29,
        1.24,
        0,
      );
      part(
        new THREE.CapsuleGeometry(0.11, 0.07, 4, 10),
        armor,
        side * 0.28,
        1.37,
        0,
      );
      part(
        new THREE.BoxGeometry(0.11, 0.07, 0.16),
        mark,
        side * 0.31,
        1.27,
        -0.01,
      );
      actor.userData[side === -1 ? "leftLeg" : "rightLeg"] = leg;
    }
    part(new THREE.SphereGeometry(0.18, 16, 12), armor, 0, 1.66, 0);
    part(new THREE.CapsuleGeometry(0.12, 0.1, 5, 12), cloth, 0, 1.48, -0.01);
    part(new THREE.BoxGeometry(0.27, 0.095, 0.06), metal, 0, 1.65, -0.16);
    part(new THREE.BoxGeometry(0.19, 0.04, 0.015), mark, 0, 1.65, -0.195);
    for (let i = -1; i <= 1; i++)
      part(
        new THREE.BoxGeometry(0.095, 0.15, 0.06),
        armor,
        i * 0.115,
        1.05,
        -0.265,
      );
    const rifle = this.rifleTemplate.clone(true);
    rifle.position.set(0.13, 1.31, -0.035);
    rifle.rotation.set(0, 0, 0);
    rifle.visible = true;
    rifle.traverse((object) => {
      object.layers.set(0);
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
        const material = object.material as THREE.ShaderMaterial;
        if (material.isShaderMaterial && material.uniforms.uInt)
          object.visible = false;
      }
    });
    actor.add(rifle);
    const protection = part(
      new THREE.TorusGeometry(0.54, 0.018, 6, 40),
      mark,
      0,
      0.025,
      0,
    );
    protection.rotation.x = Math.PI / 2;
    actor.userData.protection = protection;
    actor.userData.phase = Math.random() * Math.PI * 2;
    return actor;
  }
  sync(players: Player[], self: string) {
    for (const player of players) {
      if (player.id === self) continue;
      let actor = this.actors.get(player.id);
      if (!actor) {
        actor = this.createActor(player.color);
        actor.position.set(player.x, player.y, player.z);
        this.actors.set(player.id, actor);
        this.scene.add(actor);
      }
      actor.visible = player.health > 0;
      actor.userData.target = new THREE.Vector3(player.x, player.y, player.z);
      actor.userData.yaw = player.yaw;
      actor.userData.protection.visible = player.protectedUntil > Date.now();
    }
    for (const [id, actor] of this.actors)
      if (!players.some((p) => p.id === id)) {
        this.scene.remove(actor);
        // Rifle geometry/materials are shared with the original viewmodel.
        const owned = actor.children.filter(
          (child) =>
            child !== actor.children.find((c) => c.name === "viewmodel-pac9"),
        );
        for (const child of owned)
          child.traverse((object) => {
            if (object instanceof THREE.Mesh) object.geometry.dispose();
          });
        const protection = actor.userData.protection as THREE.Mesh;
        (protection.material as THREE.Material).dispose();
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
      const distance = actor.position.distanceTo(target);
      if (distance > 6) actor.position.copy(target);
      else actor.position.lerp(target, 1 - Math.exp(-dt * 18));
      const diff = Math.atan2(
        Math.sin(actor.userData.yaw - actor.rotation.y),
        Math.cos(actor.userData.yaw - actor.rotation.y),
      );
      actor.rotation.y += diff * Math.min(1, dt * 18);
      actor.userData.phase += dt * (distance > 0.03 ? 11 : 0);
      const swing = distance > 0.03 ? Math.sin(actor.userData.phase) * 0.35 : 0;
      actor.userData.leftLeg.rotation.x = swing;
      actor.userData.rightLeg.rotation.x = -swing;
    }
    ctx.fx.update(dt);
    ctx.ground.update(dt);
    ctx.level.update(dt);
    ctx.backdrop.update(dt);
    ctx.mats.update(dt);
    ctx.render.frame(dt);
  }
}
