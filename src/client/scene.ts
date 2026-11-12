import * as THREE from "three";
import { ARENA_SIZE, BLOCKS, RULES } from "../shared/config";
import type { Body, Player, Shot } from "../shared/protocol";
export class ArenaView {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, 1, 0.05, 240);
  actors = new Map<string, THREE.Group>();
  weapon = new THREE.Group();
  flash: THREE.Mesh;
  recoil = 0;
  tracers: { line: THREE.Line; life: number }[] = [];
  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.scene.background = new THREE.Color("#a8b6ad");
    this.scene.fog = new THREE.FogExp2("#a8b6ad", 0.009);
    this.scene.add(new THREE.HemisphereLight("#e0f0f0", "#4b473e", 2.3));
    const sun = new THREE.DirectionalLight("#ffe1ad", 3.2);
    sun.position.set(-30, 55, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -48,
      right: 48,
      top: 48,
      bottom: -48,
      near: 1,
      far: 150,
    });
    sun.shadow.normalBias = 0.035;
    this.scene.add(sun);
    this.box(0, -0.3, 0, 250, 0.5, 250, "#58615c", false);
    this.box(0, -0.02, 0, 64, 0.04, 64, "#727870", false);
    // Painted port markings.
    for (let x = -30; x <= 30; x += 6) {
      this.box(x, 0.015, -29, 2, 0.018, 0.12, "#c3b996", false);
      this.box(x, 0.015, 29, 2, 0.018, 0.12, "#c3b996", false);
    }
    for (let z = -26; z <= 26; z += 5)
      this.box(0, 0.01, z, 0.13, 0.025, 2, "#c4b68c", false);
    for (const [i, b] of BLOCKS.entries()) {
      this.box(b.x, b.h / 2, b.z, b.w, b.h, b.d, b.color);
      if (b.h > 2) {
        const alongX = b.w > b.d;
        for (
          let n = -((alongX ? b.w : b.d) / 2) + 0.25;
          n < (alongX ? b.w : b.d) / 2;
          n += 0.45
        ) {
          if (alongX) {
            for (const side of [-1, 1])
              this.box(
                b.x + n,
                b.h / 2,
                b.z + side * (b.d / 2 + 0.02),
                0.055,
                b.h - 0.2,
                0.055,
                b.color,
              );
          } else
            for (const side of [-1, 1])
              this.box(
                b.x + side * (b.w / 2 + 0.02),
                b.h / 2,
                b.z + n,
                0.055,
                b.h - 0.2,
                0.055,
                b.color,
              );
        }
        const label = document.createElement("canvas");
        label.width = 256;
        label.height = 64;
        const c = label.getContext("2d")!;
        c.fillStyle = "#e2ddc7";
        c.font = "bold 32px monospace";
        c.fillText(`JM / ${String(i + 1).padStart(2, "0")}`, 10, 44);
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(2, 0.5),
          new THREE.MeshBasicMaterial({
            map: new THREE.CanvasTexture(label),
            transparent: true,
            depthWrite: false,
          }),
        );
        sign.position.set(b.x, b.h * 0.65, b.z + b.d / 2 + 0.06);
        this.scene.add(sign);
      } else {
        for (const z of [-1, 1])
          this.box(
            b.x,
            b.h / 2,
            b.z + z * (b.d / 2 + 0.01),
            b.w + 0.05,
            0.12,
            0.06,
            "#514e41",
          );
      }
    }
    const wall = ARENA_SIZE / 2;
    for (const side of [-1, 1]) {
      this.box(side * (wall + 0.3), 1.4, 0, 0.6, 2.8, 65, "#656e67");
      this.box(0, 1.4, side * (wall + 0.3), 65, 2.8, 0.6, "#656e67");
      this.box(side * wall, 2.84, 0, 0.3, 0.12, 65, "#d6b479");
      this.box(0, 2.84, side * wall, 65, 0.12, 0.3, "#d6b479");
    }
    // Cranes and warehouse silhouettes beyond the play area.
    for (const x of [-46, 42]) {
      for (const z of [-27, -12]) this.box(x, 15, z, 0.9, 30, 0.9, "#536767");
      this.box(x, 29, -19, 1.4, 1.2, 54, "#536767");
      this.box(x, 26, -19, 0.7, 0.6, 46, "#536767");
      this.box(x, 25, -15, 3, 3, 4, "#897755");
      this.box(x, 17, 5, 0.08, 20, 0.08, "#4a5350");
    }
    for (let i = 0; i < 12; i++)
      this.box(-70 + i * 13, 4, -63, 10, 8 + Math.sin(i) * 3, 12, "#7c8780");
    this.scene.add(this.camera);
    this.camera.rotation.order = "YXZ";
    const steel = "#2b3334";
    this.weapon.add(
      this.part(0.2, -0.23, -0.53, 0.13, 0.14, 0.45, steel),
      this.part(0.2, -0.24, -0.9, 0.05, 0.055, 0.4, "#1b2224"),
      this.part(0.2, -0.37, -0.48, 0.09, 0.21, 0.13, "#242a29"),
      this.part(0.2, -0.17, -0.56, 0.07, 0.025, 0.3, "#485551"),
      this.part(0.2, -0.12, -0.58, 0.055, 0.08, 0.07, "#202a2a"),
      this.part(0.2, -0.26, -0.25, 0.15, 0.13, 0.18, "#80765d"),
    );
    this.flash = new THREE.Mesh(
      new THREE.ConeGeometry(0.065, 0.24, 5),
      new THREE.MeshBasicMaterial({ color: "#ffda83" }),
    );
    this.flash.rotation.x = -Math.PI / 2;
    this.flash.position.set(0.2, -0.24, -1.15);
    this.flash.visible = false;
    this.weapon.add(this.flash);
    this.camera.add(this.weapon);
    this.weapon.visible = false;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }
  part(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
  ) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
    );
    mesh.position.set(x, y, z);
    return mesh;
  }
  box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
    shadow = true,
  ) {
    const mesh = this.part(x, y, z, w, h, d, color);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }
  resize() {
    const w = innerWidth,
      h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  sync(players: Player[], self: string) {
    for (const p of players) {
      if (p.id === self) continue;
      let actor = this.actors.get(p.id);
      if (!actor) {
        actor = new THREE.Group();
        const torso = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.28, 0.65, 4, 8),
          new THREE.MeshStandardMaterial({ color: p.color }),
        );
        torso.position.y = 1;
        torso.castShadow = true;
        actor.add(torso);
        const head = new THREE.Mesh(
          new THREE.SphereGeometry(0.23, 12, 10),
          new THREE.MeshStandardMaterial({ color: "#c5b596" }),
        );
        head.position.y = 1.65;
        head.castShadow = true;
        actor.add(head);
        actor.add(this.part(0.27, 1.2, -0.35, 0.12, 0.12, 0.65, "#263132"));
        for (const side of [-1, 1])
          actor.add(this.part(side * 0.14, 0.3, 0, 0.19, 0.6, 0.22, "#3b4540"));
        actor.position.set(p.x, p.y, p.z);
        this.actors.set(p.id, actor);
        this.scene.add(actor);
      }
      actor.visible = p.health > 0;
      actor.userData.target = new THREE.Vector3(p.x, p.y, p.z);
      actor.userData.yaw = p.yaw;
      const material = (actor.children[0] as THREE.Mesh)
        .material as THREE.MeshStandardMaterial;
      material.emissive.set(
        p.protectedUntil > Date.now() ? "#716335" : "#000000",
      );
    }
    for (const [id, a] of this.actors)
      if (!players.some((p) => p.id === id)) {
        this.scene.remove(a);
        a.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            (o.material as THREE.Material).dispose();
          }
        });
        this.actors.delete(id);
      }
  }
  shot(shot: Shot, self: string) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...shot.from),
      new THREE.Vector3(...shot.to),
    ]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({
        color: shot.shooter === self ? "#ffe3a0" : "#ffba79",
        transparent: true,
        opacity: 0.8,
      }),
    );
    this.scene.add(line);
    this.tracers.push({ line, life: 0.085 });
    if (shot.shooter === self) {
      this.recoil = 1;
      this.flash.visible = true;
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
    if (body) {
      this.camera.position.set(body.x, body.y + RULES.eye, body.z);
      this.camera.rotation.set(pitch, yaw, 0, "YXZ");
      this.weapon.visible = true;
    } else {
      this.camera.position.set(
        Math.sin(time * 0.035) * 40,
        30,
        Math.cos(time * 0.035) * 40,
      );
      this.camera.lookAt(0, 0, 0);
      this.weapon.visible = false;
    }
    const fov = ads ? 53 : 75;
    this.camera.fov = THREE.MathUtils.lerp(
      this.camera.fov,
      fov,
      Math.min(1, dt * 14),
    );
    this.camera.updateProjectionMatrix();
    this.recoil = Math.max(0, this.recoil - dt * 9);
    this.flash.visible = this.recoil > 0.6;
    this.weapon.position.set(
      ads ? -0.16 : 0,
      (moving ? Math.sin(time * 12) * 0.008 : 0) - this.recoil * 0.025,
      ads ? 0.08 : 0,
    );
    this.weapon.rotation.x = this.recoil * 0.05;
    for (const actor of this.actors.values()) {
      const target = actor.userData.target as THREE.Vector3;
      if (actor.position.distanceTo(target) > 6) actor.position.copy(target);
      else actor.position.lerp(target, 1 - Math.exp(-dt * 18));
      const diff = Math.atan2(
        Math.sin(actor.userData.yaw - actor.rotation.y),
        Math.cos(actor.userData.yaw - actor.rotation.y),
      );
      actor.rotation.y += diff * Math.min(1, dt * 18);
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        (t.line.material as THREE.Material).dispose();
        this.tracers.splice(i, 1);
      }
    }
    this.renderer.render(this.scene, this.camera);
  }
}
