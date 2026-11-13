import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createRifleGeometry } from "./original/engine.js";

// Authored geometry with a joint hierarchy. All actors share geometry/textures;
// only their identity patches and animation transforms are per player.
export class CharacterFactory {
  private template = new THREE.Group();
  private materials: THREE.MeshStandardMaterial[] = [];
  private rigs = new WeakMap<
    THREE.Group,
    {
      upper: THREE.Object3D;
      left: THREE.Object3D;
      right: THREE.Object3D;
      leftKnee: THREE.Object3D;
      rightKnee: THREE.Object3D;
      leftArm: THREE.Object3D;
      gun: THREE.Object3D;
      phase: number;
      speed: number;
      patch: THREE.MeshStandardMaterial;
    }
  >();
  constructor() {
    const weave = this.fabric();
    const material = (
      color: string,
      roughness = 0.85,
      metalness = 0,
      map: THREE.Texture | null = null,
    ) => {
      const m = new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness,
        map,
        envMapIntensity: 1.2,
      });
      // Small diffuse bounce floor keeps clothing readable in the port's deep shadows.
      m.emissive.set(color);
      m.emissiveIntensity = 0.22;
      this.materials.push(m);
      return m;
    };
    const cloth = material("#829087", 0.95, 0, weave),
      armor = material("#b5aa8b", 0.7, 0, weave);
    const strap = material("#575e52", 0.95),
      rubber = material("#343c39", 0.85),
      skin = material("#c79c80", 0.9);
    const metal = material("#6f7776", 0.45, 0.55),
      lens = material("#3b6f77", 0.18, 0.5),
      eye = material("#d3c6ad", 0.6),
      pupil = material("#292d29", 0.7);
    const accent = material("#eeeecc");
    const root = this.template;
    root.name = "operator";
    const upper = new THREE.Group();
    upper.name = "upper";
    upper.position.y = 1.05;
    root.add(upper);
    const mesh = (
      g: THREE.BufferGeometry,
      m: THREE.Material,
      p: number[],
      parent: THREE.Object3D = upper,
      name = "",
    ) => {
      const o = new THREE.Mesh(g, m);
      o.position.fromArray(p);
      o.castShadow = true;
      o.receiveShadow = true;
      o.name = name;
      parent.add(o);
      return o;
    };
    const ellipsoid = (
      r: number,
      scale: number[],
      m: THREE.Material,
      p: number[],
      parent: THREE.Object3D = upper,
      name = "",
    ) => {
      const o = mesh(new THREE.SphereGeometry(r, 18, 12), m, p, parent, name);
      o.scale.fromArray(scale);
      return o;
    };
    const panel = (
      w: number,
      h: number,
      d: number,
      m: THREE.Material,
      p: number[],
      parent: THREE.Object3D = upper,
      name = "",
    ) => mesh(this.panel(w, h, d), m, p, parent, name);
    const link = (
      a: number[],
      b: number[],
      r1: number,
      r2: number,
      m: THREE.Material,
      parent: THREE.Object3D = upper,
    ) => {
      const from = new THREE.Vector3(...a),
        to = new THREE.Vector3(...b),
        delta = to.clone().sub(from);
      const o = mesh(
        this.limb(delta.length(), r1, r2),
        m,
        from.clone().add(to).multiplyScalar(0.5).toArray(),
        parent,
      );
      o.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        delta.normalize(),
      );
      return o;
    };
    // Anatomical taper through pelvis, waist, ribs and shoulders.
    mesh(
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(0.15, -0.13),
          new THREE.Vector2(0.2, -0.08),
          new THREE.Vector2(0.19, 0.05),
          new THREE.Vector2(0.22, 0.27),
          new THREE.Vector2(0.24, 0.34),
          new THREE.Vector2(0.16, 0.4),
          new THREE.Vector2(0.09, 0.44),
        ],
        24,
      ),
      cloth,
      [0, 0, 0],
    ).scale.z = 0.66;
    ellipsoid(0.18, [1.15, 0.7, 0.8], cloth, [0, 0.92, 0], root);
    const chest = panel(0.4, 0.38, 0.065, armor, [0, 0.22, -0.155]);
    chest.rotation.x = 0.06;
    panel(0.37, 0.36, 0.08, armor, [0, 0.22, 0.15]);
    panel(0.29, 0.33, 0.14, strap, [0, 0.25, 0.235]);
    panel(0.25, 0.12, 0.04, armor, [0, 0.44, 0.25]);
    for (const side of [-1, 1]) {
      panel(0.055, 0.46, 0.028, strap, [side * 0.16, 0.21, -0.2]);
      panel(0.065, 0.34, 0.035, armor, [side * 0.2, 0.16, 0.04]);
      link(
        [side * 0.16, 0.34, -0.17],
        [side * 0.16, 0.37, 0.16],
        0.036,
        0.036,
        armor,
      );
      // Shoulder seam and identification armband.
      ellipsoid(0.105, [1, 0.85, 1.1], cloth, [side * 0.255, 0.285, 0]);
      const band = panel(
        0.075,
        0.07,
        0.065,
        accent,
        [side * 0.3, 0.25, -0.025],
        upper,
        "identity-patch",
      );
      band.rotation.y = side * 0.65;
    }
    for (let row = 0; row < 3; row++)
      for (let col = -2; col <= 2; col++)
        panel(0.058, 0.016, 0.012, strap, [
          col * 0.065,
          0.25 - row * 0.045,
          -0.197,
        ]);
    for (let n = -1; n <= 1; n++) {
      panel(0.09, 0.14, 0.07, armor, [n * 0.112, 0.025, -0.21]);
      panel(0.072, 0.03, 0.02, strap, [n * 0.112, 0.08, -0.258]);
    }
    panel(0.32, 0.055, 0.035, strap, [0, -0.14, -0.13]);
    panel(0.055, 0.043, 0.015, metal, [0, -0.14, -0.155]);
    // Neck, jaw and face, with separate ears, nose, eyes and brows.
    link([0, 0.39, 0], [0, 0.49, 0], 0.065, 0.07, skin);
    ellipsoid(0.15, [0.82, 1.08, 0.84], skin, [0, 0.6, -0.01]);
    ellipsoid(0.095, [1, 0.56, 0.8], skin, [0, 0.515, -0.04]);
    for (const side of [-1, 1]) {
      ellipsoid(0.028, [0.4, 1, 0.7], skin, [side * 0.129, 0.595, 0]);
      ellipsoid(0.023, [1, 0.48, 0.28], eye, [side * 0.051, 0.625, -0.124]);
      ellipsoid(0.012, [0.65, 0.8, 0.35], pupil, [side * 0.049, 0.626, -0.131]);
      const brow = panel(0.045, 0.009, 0.009, strap, [
        side * 0.051,
        0.652,
        -0.122,
      ]);
      brow.rotation.z = side * 0.08;
    }
    ellipsoid(0.027, [0.5, 1.05, 0.85], skin, [0, 0.595, -0.132]);
    ellipsoid(0.028, [0.8, 0.35, 0.65], skin, [0, 0.574, -0.15]);
    panel(0.042, 0.006, 0.009, strap, [0, 0.542, -0.122]);
    // Helmet shell with edge trim, rails, pads, goggles and NVG mount.
    const shell = mesh(
      new THREE.SphereGeometry(
        0.159,
        24,
        14,
        0,
        Math.PI * 2,
        0,
        Math.PI * 0.59,
      ),
      armor,
      [0, 0.637, 0],
    );
    shell.scale.set(1.04, 1, 0.98);
    const rim = mesh(
      new THREE.TorusGeometry(0.15, 0.009, 6, 36),
      rubber,
      [0, 0.603, 0],
    );
    rim.rotation.x = Math.PI / 2;
    rim.scale.z = 0.94;
    panel(0.12, 0.055, 0.04, metal, [0, 0.725, -0.117]);
    panel(0.075, 0.035, 0.013, rubber, [0, 0.726, -0.145]);
    for (const side of [-1, 1]) {
      panel(0.024, 0.046, 0.115, strap, [side * 0.152, 0.66, 0.012]);
      ellipsoid(0.037, [0.3, 1, 0.8], rubber, [side * 0.147, 0.592, 0.015]);
      link(
        [side * 0.13, 0.61, -0.015],
        [side * 0.055, 0.49, -0.035],
        0.009,
        0.009,
        strap,
      );
    }
    panel(0.255, 0.065, 0.025, rubber, [0, 0.69, -0.125]);
    for (const side of [-1, 1])
      panel(0.09, 0.045, 0.013, lens, [side * 0.057, 0.69, -0.145]);
    // Articulated legs, knees, cargo pockets, boot lacing and soles.
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.name = side < 0 ? "left-leg" : "right-leg";
      leg.position.set(side * 0.12, 0.88, 0);
      root.add(leg);
      link([0, 0, 0], [0, -0.36, 0.005], 0.106, 0.075, cloth, leg);
      panel(0.09, 0.14, 0.05, armor, [side * 0.08, -0.2, 0.015], leg);
      const knee = new THREE.Group();
      knee.name = side < 0 ? "left-knee" : "right-knee";
      knee.position.set(0, -0.38, 0);
      leg.add(knee);
      ellipsoid(0.082, [0.85, 1.1, 0.58], armor, [0, 0.008, -0.065], knee);
      link([0, 0, 0.005], [0, -0.36, 0], 0.074, 0.05, cloth, knee);
      for (const y of [-0.11, -0.19])
        panel(0.13, 0.024, 0.025, strap, [0, y, 0.055], knee);
      ellipsoid(0.078, [0.85, 1.05, 1.4], rubber, [0, -0.385, -0.035], knee);
      panel(0.15, 0.035, 0.24, rubber, [0, -0.465, -0.035], knee);
      for (let y = 0; y < 4; y++)
        panel(0.052, 0.008, 0.012, armor, [0, -0.34 - y * 0.023, -0.113], knee);
    }
    // Third-person rifle uses the original gun geometry, without first-person hands.
    const gun = new THREE.Group();
    gun.name = "rifle";
    gun.position.set(0.085, 0.27, -0.16);
    upper.add(gun);
    const rifleMaterials = {
      ano: material("#394341", 0.42, 0.65),
      gun: material("#5a6561", 0.55, 0.7),
      poly: material("#7a7864", 0.75),
      plain: material("#9fa899", 0.65),
      bolt: metal,
      mag: material("#5b665d", 0.6, 0.3),
      round: metal,
    };
    for (const [key, geometry] of Object.entries(createRifleGeometry())) {
      const m = rifleMaterials[key as keyof typeof rifleMaterials];
      m.vertexColors = true;
      mesh(geometry, m, [0, 0, 0], gun);
    }
    // Arms bend around the trigger and foregrip rather than hanging beside the torso.
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.name = side < 0 ? "left-arm" : "right-arm";
      upper.add(arm);
      const shoulder = [side * 0.255, 0.27, 0],
        elbow = side < 0 ? [-0.29, 0.04, -0.16] : [0.29, 0.025, 0.015],
        hand = side < 0 ? [0.075, 0.27, -0.41] : [0.085, 0.17, -0.087];
      link(shoulder, elbow, 0.08, 0.065, cloth, arm);
      ellipsoid(0.068, [1, 0.9, 1], armor, elbow, arm);
      link(elbow, hand, 0.066, 0.043, cloth, arm);
      ellipsoid(0.05, [0.75, 1.05, 1], rubber, hand, arm);
      for (let finger = 0; finger < 4; finger++)
        ellipsoid(
          0.012,
          [0.9, 1.7, 1],
          rubber,
          [hand[0] - 0.025 + finger * 0.016, hand[1] - 0.027, hand[2] - 0.012],
          arm,
        );
    }
    const protection = mesh(
      new THREE.TorusGeometry(0.5, 0.016, 6, 40),
      accent,
      [0, 0.025, 0],
      root,
      "spawn-protection",
    );
    protection.rotation.x = Math.PI / 2;
    this.compact(root);
  }
  private compact(parent: THREE.Object3D) {
    for (const child of [...parent.children])
      if (!(child instanceof THREE.Mesh)) this.compact(child);
    const groups = new Map<string, THREE.Mesh[]>();
    for (const child of parent.children) {
      if (
        !(child instanceof THREE.Mesh) ||
        child.name ||
        Array.isArray(child.material)
      )
        continue;
      const key =
        child.material.uuid +
        Object.keys(child.geometry.attributes).sort().join(",") +
        Boolean(child.geometry.index);
      const group = groups.get(key) ?? [];
      group.push(child);
      groups.set(key, group);
    }
    for (const meshes of groups.values()) {
      if (meshes.length < 2) continue;
      const geometries = meshes.map((mesh) => {
        mesh.updateMatrix();
        return mesh.geometry.clone().applyMatrix4(mesh.matrix);
      });
      const merged = mergeGeometries(geometries, false);
      geometries.forEach((g) => g.dispose());
      if (!merged) continue;
      const batch = new THREE.Mesh(merged, meshes[0].material);
      batch.castShadow = batch.receiveShadow = true;
      parent.add(batch);
      for (const mesh of meshes) {
        parent.remove(mesh);
        mesh.geometry.dispose();
      }
    }
  }
  private fabric() {
    const data = new Uint8Array(64 * 64 * 4);
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const i = (y * 64 + x) * 4,
          v =
            205 +
            ((x * 17 + y * 31) % 19) +
            (x % 3 === 0 ? 18 : 0) -
            (y % 4 === 0 ? 13 : 0);
        data[i] = data[i + 1] = data[i + 2] = v;
        data[i + 3] = 255;
      }
    const texture = new THREE.DataTexture(data, 64, 64);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3, 3);
    texture.needsUpdate = true;
    return texture;
  }
  private panel(w: number, h: number, d: number) {
    const r = Math.min(w, h) * 0.17,
      s = new THREE.Shape();
    s.moveTo(-w / 2 + r, -h / 2);
    s.lineTo(w / 2 - r, -h / 2);
    s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    s.lineTo(w / 2, h / 2 - r);
    s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    s.lineTo(-w / 2 + r, h / 2);
    s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    s.lineTo(-w / 2, -h / 2 + r);
    s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    return new THREE.ExtrudeGeometry(s, {
      depth: d,
      bevelEnabled: true,
      bevelThickness: 0.004,
      bevelSize: 0.004,
      bevelSegments: 2,
      steps: 1,
      curveSegments: 4,
    }).translate(0, 0, -d / 2);
  }
  private limb(length: number, start: number, end: number) {
    const rings = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12,
        r =
          THREE.MathUtils.lerp(start, end, t) * (1 + 0.04 * Math.sin(i * 2.8));
      rings.push(new THREE.Vector2(r, -length / 2 + t * length));
    }
    return new THREE.LatheGeometry(rings, 16);
  }
  create(color: string) {
    const actor = this.template.clone(true),
      patch = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.65,
        emissive: color,
        emissiveIntensity: 0.13,
      });
    actor.traverse((object) => {
      if (
        object instanceof THREE.Mesh &&
        (object.name === "identity-patch" || object.name === "spawn-protection")
      )
        object.material = patch;
    });
    const get = (name: string) => actor.getObjectByName(name)!;
    actor.userData.protection = get("spawn-protection");
    this.rigs.set(actor, {
      upper: get("upper"),
      left: get("left-leg"),
      right: get("right-leg"),
      leftKnee: get("left-knee"),
      rightKnee: get("right-knee"),
      leftArm: get("left-arm"),
      gun: get("rifle"),
      phase: 0,
      speed: 0,
      patch,
    });
    return actor;
  }
  update(
    actor: THREE.Group,
    dt: number,
    speed: number,
    pitch: number,
    airborne: boolean,
    reloading: boolean,
  ) {
    const rig = this.rigs.get(actor)!;
    rig.speed = THREE.MathUtils.lerp(rig.speed, speed, 1 - Math.exp(-dt * 12));
    rig.phase += dt * rig.speed * 2.5;
    const amplitude = Math.min(0.6, rig.speed * 0.075),
      stride = Math.sin(rig.phase) * amplitude;
    rig.left.rotation.x = airborne ? -0.2 : stride;
    rig.right.rotation.x = airborne ? 0.3 : -stride;
    rig.leftKnee.rotation.x = airborne
      ? -0.8
      : -Math.max(0, -Math.sin(rig.phase)) * amplitude * 0.9;
    rig.rightKnee.rotation.x = airborne
      ? -0.6
      : -Math.max(0, Math.sin(rig.phase)) * amplitude * 0.9;
    rig.upper.rotation.x = THREE.MathUtils.lerp(
      rig.upper.rotation.x,
      THREE.MathUtils.clamp(pitch, -0.9, 0.9) * 0.75,
      1 - Math.exp(-dt * 14),
    );
    rig.upper.position.y =
      1.05 + Math.abs(Math.sin(rig.phase)) * amplitude * 0.025;
    rig.leftArm.rotation.x = THREE.MathUtils.lerp(
      rig.leftArm.rotation.x,
      reloading ? -0.6 : 0,
      1 - Math.exp(-dt * 10),
    );
    rig.gun.rotation.z = THREE.MathUtils.lerp(
      rig.gun.rotation.z,
      reloading ? -0.35 : 0,
      1 - Math.exp(-dt * 10),
    );
  }
  release(actor: THREE.Group) {
    this.rigs.get(actor)?.patch.dispose();
    this.rigs.delete(actor);
  }
}
