import * as THREE from "three";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { skinRigidHierarchy, solveLeg } from "./rig";
import { copyViewmodelHands } from "./viewmodel-hands";
import {
  createRifleGeometry,
  type OriginalMaterials,
} from "./original/engine.js";

type Rig = {
  upper: THREE.Object3D;
  head: THREE.Object3D;
  left: THREE.Object3D;
  right: THREE.Object3D;
  leftKnee: THREE.Object3D;
  rightKnee: THREE.Object3D;
  leftFoot: THREE.Object3D;
  rightFoot: THREE.Object3D;
  leftArm: THREE.Object3D;
  gun: THREE.Object3D;
  phase: number;
  speed: number;
  time: number;
  patch: THREE.Material;
};
/** Human-proportioned tactical operator, generated entirely in code. */
export class CharacterFactory {
  private template: THREE.Group;
  private rigs = new WeakMap<THREE.Group, Rig>();
  constructor(surfaces: OriginalMaterials, viewmodel: THREE.Group) {
    const material = (
      name: string,
      color: string,
      roughness = 0.9,
      metalness = 0,
    ) => {
      const m = surfaces.get(name, {
        triplanar: true,
        vertexColors: true,
        color,
      });
      m.roughness = roughness;
      m.metalness = metalness;
      m.envMapIntensity = 1.1;
      m.emissive.set(color);
      m.emissiveIntensity = 0.06;
      return m;
    };
    const cloth = material("glove_fabric", "#adb39a"),
      vest = material("glove_fabric", "#89907d"),
      webbing = material("glove_fabric", "#3e4942"),
      rubber = material("rubber", "#363d39"),
      helmet = material("polymer_tan", "#777e65", 0.75),
      metal = material("gunmetal", "#515a54", 0.5, 0.55),
      skin = material("polymer_tan", "#b08870", 0.95),
      mask = material("glove_fabric", "#70766c");
    const glass = new THREE.MeshStandardMaterial({
      name: "goggle-lens",
      color: "#353f37",
      roughness: 0.18,
      metalness: 0.35,
      emissive: "#45574c",
      emissiveIntensity: 0.05,
      vertexColors: true,
    });
    const identity = new THREE.MeshStandardMaterial({
      name: "identity",
      color: "#d2ca9f",
      roughness: 0.85,
      vertexColors: true,
    });
    const root = new THREE.Group();
    root.name = "root";
    const upper = new THREE.Group();
    upper.name = "upper";
    upper.position.y = 1.04;
    root.add(upper);
    const mesh = (
      geometry: THREE.BufferGeometry,
      mat: THREE.Material,
      p: number[],
      parent: THREE.Object3D = upper,
    ) => {
      const o = new THREE.Mesh(geometry, mat);
      o.position.fromArray(p);
      o.userData.preserveNormals = true;
      parent.add(o);
      return o;
    };
    const sphere = (
      scale: number[],
      mat: THREE.Material,
      p: number[],
      parent: THREE.Object3D = upper,
    ) => {
      const o = mesh(new THREE.SphereGeometry(1, 24, 16), mat, p, parent);
      o.scale.fromArray(scale);
      return o;
    };
    const panel = (
      w: number,
      h: number,
      d: number,
      mat: THREE.Material,
      p: number[],
      parent: THREE.Object3D = upper,
    ) => {
      const r = Math.min(w, h) * 0.14,
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
      return mesh(
        new THREE.ExtrudeGeometry(s, {
          depth: d,
          bevelEnabled: true,
          bevelSegments: 2,
          bevelSize: 0.003,
          bevelThickness: 0.003,
          curveSegments: 4,
          steps: 1,
        }).translate(0, 0, -d / 2),
        mat,
        p,
        parent,
      );
    };
    const tube = (
      points: number[][],
      radius: number,
      mat: THREE.Material,
      parent: THREE.Object3D = upper,
    ) =>
      mesh(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(
            points.map((p) => new THREE.Vector3(...p)),
          ),
          18,
          radius,
          7,
          false,
        ),
        mat,
        [0, 0, 0],
        parent,
      );
    const seam = (points: number[][], parent: THREE.Object3D = upper) =>
      tube(points, 0.0018, webbing, parent);
    const section = (
      rings: number[][],
      mat: THREE.Material,
      p: number[],
      parent: THREE.Object3D = upper,
      camo = true,
    ) => {
      const positions: number[] = [],
        uvs: number[] = [],
        colors: number[] = [],
        indices: number[] = [],
        segments = 40;
      for (let row = 0; row < rings.length; row++) {
        const [y, rx, rz, cx = 0, cz = 0] = rings[row];
        for (let col = 0; col <= segments; col++) {
          const a = (col / segments) * Math.PI * 2;
          const fold =
            1 +
            0.024 * Math.sin(a * 8 + y * 43) +
            0.019 * Math.sin(a * 5 - y * 31);
          const x = cx + Math.sin(a) * rx * fold,
            z = cz + Math.cos(a) * rz * fold;
          positions.push(x, y, z);
          uvs.push(col / segments, row / (rings.length - 1));
          const noise =
            Math.sin(x * 31 + y * 39 + Math.sin(z * 37) * 1.9) +
            Math.sin(z * 49 - y * 23 + Math.sin(x * 51));
          const color = camo
            ? noise > 0.7
              ? [0.72, 0.76, 0.61]
              : noise < -0.8
                ? [0.43, 0.51, 0.44]
                : [0.93, 0.91, 0.75]
            : [1, 1, 1];
          colors.push(...color);
          if (row < rings.length - 1 && col < segments) {
            const i = row * (segments + 1) + col;
            indices.push(
              i,
              i + 1,
              i + segments + 1,
              i + 1,
              i + segments + 2,
              i + segments + 1,
            );
          }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      g.setIndex(indices);
      g.computeVertexNormals();
      return mesh(g, mat, p, parent);
    };
    const limb = (
      a: number[],
      b: number[],
      r1: number,
      r2: number,
      parent: THREE.Object3D = upper,
    ) => {
      const from = new THREE.Vector3(...a),
        to = new THREE.Vector3(...b),
        length = from.distanceTo(to),
        rings = [];
      for (let n = 0; n <= 22; n++) {
        const t = n / 22,
          r =
            THREE.MathUtils.lerp(r1, r2, t) *
            (1 + 0.045 * Math.sin(t * 22) + 0.026 * Math.sin(t * 53));
        rings.push([-length / 2 + t * length, r, r * 0.9]);
      }
      const o = section(
        rings,
        cloth,
        from.clone().add(to).multiplyScalar(0.5).toArray(),
        parent,
      );
      o.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        to.sub(from).normalize(),
      );
      return o;
    };
    // Human chest/waist silhouette; cloth shell stays continuous under the vest.
    section(
      [
        [-0.14, 0.155, 0.108],
        [-0.08, 0.17, 0.115],
        [0.02, 0.17, 0.116],
        [0.16, 0.194, 0.126],
        [0.29, 0.212, 0.132],
        [0.36, 0.2, 0.115],
        [0.4, 0.13, 0.09],
        [0.43, 0.065, 0.06],
      ],
      cloth,
      [0, 0, 0],
    );
    sphere([0.18, 0.115, 0.12], cloth, [0, 0.86, 0], root);
    // Plate carrier is soft-covered equipment with visible MOLLE webbing.
    panel(0.365, 0.365, 0.045, vest, [0, 0.19, -0.128]);
    panel(0.34, 0.33, 0.052, vest, [0, 0.2, 0.125]);
    for (const side of [-1, 1]) {
      panel(0.05, 0.37, 0.025, webbing, [side * 0.14, 0.21, -0.162]);
      tube(
        [
          [side * 0.14, 0.31, -0.14],
          [side * 0.15, 0.39, -0.085],
          [side * 0.15, 0.395, 0.05],
          [side * 0.14, 0.33, 0.13],
        ],
        0.025,
        vest,
      );
      panel(0.035, 0.05, 0.018, rubber, [side * 0.14, 0.34, -0.184]);
      panel(0.04, 0.18, 0.15, vest, [side * 0.185, 0.12, 0]);
    }
    for (let row = 0; row < 4; row++)
      for (let col = -2; col <= 2; col++)
        panel(0.052, 0.014, 0.009, webbing, [
          col * 0.062,
          0.27 - row * 0.037,
          -0.157,
        ]);
    for (let col = -1; col <= 1; col++) {
      panel(0.087, 0.145, 0.05, vest, [col * 0.104, 0.028, -0.178]);
      panel(0.075, 0.03, 0.013, webbing, [col * 0.104, 0.08, -0.211]);
      seam([
        [col * 0.104 - 0.034, -0.03, -0.207],
        [col * 0.104 - 0.034, 0.083, -0.207],
        [col * 0.104 + 0.034, 0.083, -0.207],
        [col * 0.104 + 0.034, -0.03, -0.207],
      ]);
    }
    panel(0.09, 0.058, 0.036, rubber, [-0.12, 0.28, -0.18]);
    tube(
      [
        [-0.14, 0.315, -0.2],
        [-0.16, 0.42, -0.11],
        [-0.18, 0.41, 0.04],
      ],
      0.004,
      rubber,
    );
    panel(0.31, 0.045, 0.025, webbing, [0, -0.13, -0.105]);
    panel(0.052, 0.035, 0.014, metal, [0, -0.13, -0.125]);
    panel(0.24, 0.27, 0.08, vest, [0, 0.22, 0.19]);
    panel(0.21, 0.045, 0.02, webbing, [0, 0.32, 0.236]);
    seam([
      [-0.09, 0.09, 0.235],
      [-0.09, 0.32, 0.235],
      [0.09, 0.32, 0.235],
      [0.09, 0.09, 0.235],
    ]);
    // Head: skull/jaw, balaclava, recessed eye opening and ballistic helmet.
    const head = new THREE.Group();
    head.name = "head";
    head.position.set(0, 0.605, -0.005);
    upper.add(head);
    sphere([0.088, 0.127, 0.095], mask, [0, 0, 0], head);
    sphere([0.067, 0.063, 0.072], mask, [0, -0.065, -0.02], head);
    sphere([0.015, 0.024, 0.025], mask, [0, 0.002, -0.084], head);
    panel(0.15, 0.041, 0.014, skin, [0, 0.032, -0.09], head);
    for (const side of [-1, 1]) {
      sphere(
        [0.027, 0.011, 0.007],
        rubber,
        [side * 0.039, 0.034, -0.103],
        head,
      );
      sphere([0.008, 0.008, 0.005], skin, [side * 0.039, 0.034, -0.108], head);
    }
    // Goggles sit over the eye opening, with rounded individual lens contours.
    for (const side of [-1, 1]) {
      panel(0.07, 0.044, 0.018, rubber, [side * 0.04, 0.038, -0.105], head);
      panel(0.056, 0.03, 0.005, glass, [side * 0.04, 0.038, -0.117], head);
    }
    panel(0.023, 0.012, 0.016, rubber, [0, 0.034, -0.11], head);
    for (const side of [-1, 1])
      tube(
        [
          [side * 0.085, 0.037, -0.07],
          [side * 0.095, 0.04, 0],
          [side * 0.084, 0.044, 0.07],
        ],
        0.009,
        rubber,
        head,
      );
    const helmetShell = mesh(
      new THREE.SphereGeometry(1, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.57),
      helmet,
      [0, 0.049, 0.005],
      head,
    );
    helmetShell.scale.set(0.112, 0.105, 0.115);
    const rim = mesh(
      new THREE.TorusGeometry(0.108, 0.006, 8, 40),
      rubber,
      [0, 0.027, 0.005],
      head,
    );
    rim.rotation.x = Math.PI / 2;
    rim.scale.y = 1.04;
    for (const side of [-1, 1]) {
      panel(0.016, 0.026, 0.105, rubber, [side * 0.109, 0.059, 0.015], head);
      sphere(
        [0.014, 0.036, 0.025],
        rubber,
        [side * 0.103, -0.014, 0.015],
        head,
      );
      tube(
        [
          [side * 0.1, 0.01, 0.014],
          [side * 0.073, -0.078, -0.035],
          [side * 0.029, -0.105, -0.051],
        ],
        0.006,
        rubber,
        head,
      );
      panel(0.03, 0.015, 0.009, helmet, [side * 0.087, -0.078, -0.037], head);
    }
    panel(0.038, 0.029, 0.026, rubber, [0, 0.09, -0.095], head);
    panel(0.06, 0.018, 0.015, webbing, [0, 0.119, -0.04], head);
    seam(
      [
        [0, -0.1, -0.073],
        [0, -0.045, -0.098],
        [0, 0.003, -0.094],
      ],
      head,
    );
    limb([0, 0.4, 0], [0, 0.52, 0], 0.052, 0.054);
    // Sleeves and gloved fingers come from the original first-person model.
    const hands = copyViewmodelHands(viewmodel),
      gun = new THREE.Group();
    gun.name = "rifle";
    gun.position.set(0.085, 0.27, -0.16);
    upper.add(gun);
    const gunMats = {
      ano: metal,
      gun: metal,
      poly: rubber,
      plain: helmet,
      bolt: metal,
      mag: metal,
      round: material("brass", "#9b8455", 0.4, 0.7),
    };
    for (const [key, geometry] of Object.entries(createRifleGeometry()))
      mesh(geometry, gunMats[key as keyof typeof gunMats], [0, 0, 0], gun);
    for (const [side, hand] of [
      [-1, hands.left],
      [1, hands.right],
    ] as const) {
      const arm = new THREE.Group();
      arm.name = side < 0 ? "left-arm" : "right-arm";
      upper.add(arm);
      // Source transforms are in rifle space, including the baked finger curls.
      hand.position.add(gun.position);
      arm.add(hand);
      hand.updateMatrixWorld(true);
      // Find the sleeve's elbow cap by projection along its original forearm axis.
      const direction =
        side < 0
          ? new THREE.Vector3(-0.5, -0.35, 0.79).normalize()
          : new THREE.Vector3(0.27, -0.44, 0.86).normalize();
      const points: THREE.Vector3[] = [];
      hand.updateMatrix();
      for (const object of hand.children)
        if (object instanceof THREE.Mesh) {
          object.updateMatrix();
          const matrix = hand.matrix.clone().multiply(object.matrix),
            pos = object.geometry.getAttribute("position");
          for (let i = 0; i < pos.count; i++)
            points.push(
              new THREE.Vector3()
                .fromBufferAttribute(pos, i)
                .applyMatrix4(matrix),
            );
        }
      const max = points.reduce(
          (value, p) => Math.max(value, p.dot(direction)),
          -Infinity,
        ),
        cap = points.filter((p) => p.dot(direction) > max - 0.008);
      const elbow = cap
        .reduce((sum, p) => sum.add(p), new THREE.Vector3())
        .divideScalar(cap.length);
      const shoulder = new THREE.Vector3(side * 0.226, 0.37, 0);
      limb(shoulder.toArray(), elbow.toArray(), 0.074, 0.056, arm);
      sphere([0.078, 0.07, 0.075], cloth, shoulder.toArray(), arm);
      const badge = panel(
        0.048,
        0.054,
        0.01,
        identity,
        [side * 0.274, 0.33, -0.031],
        arm,
      );
      badge.rotation.y = side * 0.6;
      for (let i = 0; i < 3; i++)
        panel(
          0.032,
          0.003,
          0.005,
          webbing,
          [side * 0.274, 0.319 + i * 0.012, -0.038],
          arm,
        );
      for (const child of arm.children) child.position.sub(shoulder);
      arm.position.copy(shoulder);
    }
    // Cloth trousers use smooth tapered ring surfaces, shaped cargo pockets and
    // gaited knee/ankle bones, without exposed mechanical actuators.
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.name = side < 0 ? "left-leg" : "right-leg";
      leg.position.set(side * 0.12, 0.87, 0);
      root.add(leg);
      limb([0, 0, 0], [0, -0.375, 0.01], 0.105, 0.072, leg);
      panel(0.032, 0.145, 0.105, cloth, [side * 0.092, -0.18, 0.012], leg);
      panel(0.04, 0.035, 0.115, vest, [side * 0.095, -0.11, 0.012], leg);
      seam(
        [
          [side * 0.098, -0.11, -0.033],
          [side * 0.1, -0.25, -0.033],
          [side * 0.098, -0.25, 0.058],
        ],
        leg,
      );
      const knee = new THREE.Group();
      knee.name = side < 0 ? "left-knee" : "right-knee";
      knee.position.set(0, -0.375, 0);
      leg.add(knee);
      limb([0, 0.015, 0.008], [0, -0.37, 0], 0.073, 0.043, knee);
      sphere([0.055, 0.066, 0.021], rubber, [0, -0.006, -0.065], knee);
      panel(0.12, 0.023, 0.018, webbing, [0, -0.027, 0.052], knee);
      for (const y of [-0.1, -0.18, -0.24])
        seam(
          [
            [-0.045, y, 0.04],
            [0, y - 0.01, 0.05],
            [0.045, y, 0.04],
          ],
          knee,
        );
      const ankle = new THREE.Group();
      ankle.name = side < 0 ? "left-foot" : "right-foot";
      ankle.position.set(0, -0.37, 0);
      knee.add(ankle);
      sphere([0.061, 0.068, 0.105], rubber, [0, -0.025, -0.025], ankle);
      panel(0.13, 0.027, 0.22, rubber, [0, -0.078, -0.037], ankle);
      panel(0.09, 0.075, 0.025, webbing, [0, -0.011, -0.096], ankle);
      for (let row = 0; row < 5; row++) {
        const y = 0.018 - row * 0.014;
        seam(
          [
            [-0.034, y, -0.113],
            [0.034, y - 0.01, -0.113],
          ],
          ankle,
        );
        seam(
          [
            [0.034, y, -0.113],
            [-0.034, y - 0.01, -0.113],
          ],
          ankle,
        );
      }
      for (let i = 0; i < 5; i++)
        panel(0.11, 0.008, 0.015, vest, [0, -0.09, -0.12 + i * 0.035], ankle);
    }
    this.template = skinRigidHierarchy(root);
    this.template.userData.reusedFirstPersonHands = hands.sourceMeshes;
    const marker = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.016, 6, 40),
      identity,
    );
    marker.name = "spawn-protection";
    marker.rotation.x = Math.PI / 2;
    marker.position.y = 0.025;
    this.template.add(marker);
  }
  create(color: string) {
    const actor = cloneSkeleton(this.template) as THREE.Group,
      patch = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.8,
        emissive: color,
        emissiveIntensity: 0.035,
        vertexColors: true,
      });
    actor.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        if (Array.isArray(o.material))
          o.material = o.material.map((m) =>
            m.name === "identity" ? patch : m,
          );
        else if (o.name === "spawn-protection") o.material = patch;
      }
    });
    const get = (name: string) => actor.getObjectByName(name)!;
    actor.userData.protection = get("spawn-protection");
    this.rigs.set(actor, {
      upper: get("upper"),
      head: get("head"),
      left: get("left-leg"),
      right: get("right-leg"),
      leftKnee: get("left-knee"),
      rightKnee: get("right-knee"),
      leftFoot: get("left-foot"),
      rightFoot: get("right-foot"),
      leftArm: get("left-arm"),
      gun: get("rifle"),
      phase: 0,
      speed: 0,
      time: 0,
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
    rig.time += dt;
    rig.speed = THREE.MathUtils.lerp(rig.speed, speed, 1 - Math.exp(-dt * 12));
    rig.phase += dt * rig.speed * 2.5;
    const amplitude = Math.min(0.3, rig.speed * 0.05),
      pose = (offset: number) => {
        const cycle = (((rig.phase / (Math.PI * 2) + offset) % 1) + 1) % 1;
        let forward: number,
          lift = 0;
        if (cycle < 0.62)
          forward = THREE.MathUtils.lerp(amplitude, -amplitude, cycle / 0.62);
        else {
          const s = (cycle - 0.62) / 0.38;
          forward = THREE.MathUtils.lerp(
            -amplitude,
            amplitude,
            s * s * (3 - 2 * s),
          );
          lift = Math.sin(s * Math.PI) * amplitude * 0.45;
        }
        return solveLeg(forward, 0.745 - lift);
      };
    const left = pose(0),
      right = pose(0.5);
    rig.left.rotation.x = airborne ? -0.2 : left.hip;
    rig.right.rotation.x = airborne ? 0.3 : right.hip;
    rig.leftKnee.rotation.x = airborne ? -0.8 : left.knee;
    rig.rightKnee.rotation.x = airborne ? -0.6 : right.knee;
    rig.leftFoot.rotation.x = airborne ? 0.2 : left.ankle;
    rig.rightFoot.rotation.x = airborne ? -0.15 : right.ankle;
    rig.upper.rotation.x = THREE.MathUtils.lerp(
      rig.upper.rotation.x,
      THREE.MathUtils.clamp(pitch, -0.9, 0.9) * 0.7,
      1 - Math.exp(-dt * 14),
    );
    rig.head.rotation.x = -rig.upper.rotation.x * 0.35;
    rig.upper.position.y =
      1.04 +
      Math.sin(rig.time * 1.7) * 0.0015 +
      Math.abs(Math.sin(rig.phase)) * amplitude * 0.018;
    rig.leftArm.rotation.x = THREE.MathUtils.lerp(
      rig.leftArm.rotation.x,
      reloading ? -0.45 : 0,
      1 - Math.exp(-dt * 10),
    );
    rig.gun.rotation.z = THREE.MathUtils.lerp(
      rig.gun.rotation.z,
      reloading ? -0.3 : 0,
      1 - Math.exp(-dt * 10),
    );
  }
  release(actor: THREE.Group) {
    actor.traverse((o) => {
      if (o instanceof THREE.SkinnedMesh) o.skeleton.dispose();
    });
    this.rigs.get(actor)?.patch.dispose();
    this.rigs.delete(actor);
  }
}
