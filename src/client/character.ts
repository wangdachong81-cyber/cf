import * as THREE from "three";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { skinRigidHierarchy, solveLeg } from "./rig";
import type { OriginalMaterials } from "./original/engine.js";
import { createRifleGeometry } from "./original/engine.js";

// Authored geometry with a joint hierarchy. All actors share geometry/textures;
// only their identity patches and animation transforms are per player.
export class CharacterFactory {
  private template = new THREE.Group();
  private rigs = new WeakMap<
    THREE.Group,
    {
      upper: THREE.Object3D;
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
      patch: THREE.MeshStandardMaterial;
    }
  >();
  constructor(surfaces: OriginalMaterials) {
    const material = (
      name: string,
      color: string,
      roughness: number,
      metalness: number,
    ) => {
      const m = surfaces.get(name, {
        vertexColors: true,
        triplanar: true,
        color,
      });
      m.roughness = roughness;
      m.metalness = metalness;
      m.envMapIntensity = 1.25;
      m.emissive.set(color);
      m.emissiveIntensity = 0.035;
      return m;
    };
    const shell = material("armor_white", "#aab3af", 0.5, 0.3);
    const dark = material("gunmetal", "#3c484b", 0.5, 0.7);
    const trim = material("steel_worn", "#98a5a4", 0.37, 0.8);
    const rubber = material("rubber", "#282f31", 0.85, 0);
    const fabric = material("glove_fabric", "#485655", 0.95, 0);
    const brass = material("brass", "#a78d58", 0.4, 0.7);
    const accent = new THREE.MeshStandardMaterial({
      name: "identity",
      color: "#99cccc",
      roughness: 0.4,
      emissive: "#99cccc",
      emissiveIntensity: 0.18,
      vertexColors: true,
    });
    const lens = new THREE.MeshStandardMaterial({
      color: "#283e43",
      metalness: 0.55,
      roughness: 0.13,
      emissive: "#315b60",
      emissiveIntensity: 0.12,
      vertexColors: true,
    });
    const root = this.template;
    root.name = "root";
    const upper = new THREE.Group();
    upper.name = "upper";
    upper.position.y = 1.04;
    root.add(upper);
    const mesh = (
      g: THREE.BufferGeometry,
      m: THREE.Material,
      p: number[],
      parent: THREE.Object3D = upper,
    ) => {
      const o = new THREE.Mesh(g, m);
      o.position.fromArray(p);
      parent.add(o);
      return o;
    };
    const plate = (
      points: number[][],
      depth: number,
      m: THREE.Material,
      p: number[],
      parent: THREE.Object3D = upper,
      bevel = 0.008,
    ) => {
      const shape = new THREE.Shape(
        points.map((v) => new THREE.Vector2(v[0], v[1])),
      );
      return mesh(
        new THREE.ExtrudeGeometry(shape, {
          depth,
          bevelEnabled: true,
          bevelThickness: bevel,
          bevelSize: bevel,
          bevelSegments: 2,
          curveSegments: 3,
          steps: 1,
        }).translate(0, 0, -depth / 2),
        m,
        p,
        parent,
      );
    };
    const panel = (
      w: number,
      h: number,
      d: number,
      m: THREE.Material,
      p: number[],
      parent: THREE.Object3D = upper,
    ) => mesh(this.panel(w, h, d), m, p, parent);
    const ball = (
      r: number,
      m: THREE.Material,
      p: number[],
      parent: THREE.Object3D = upper,
    ) => mesh(new THREE.SphereGeometry(r, 12, 8), m, p, parent);
    const rod = (
      a: number[],
      b: number[],
      radius: number,
      m: THREE.Material,
      parent: THREE.Object3D = upper,
    ) => {
      const from = new THREE.Vector3(...a),
        to = new THREE.Vector3(...b),
        v = to.clone().sub(from);
      const o = mesh(
        new THREE.CylinderGeometry(radius, radius, v.length(), 10),
        m,
        from.clone().add(to).multiplyScalar(0.5).toArray(),
        parent,
      );
      o.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        v.normalize(),
      );
      return o;
    };
    const tube = (
      points: number[][],
      r: number,
      m: THREE.Material,
      parent: THREE.Object3D = upper,
    ) =>
      mesh(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(
            points.map((p) => new THREE.Vector3(...p)),
          ),
          18,
          r,
          6,
          false,
        ),
        m,
        [0, 0, 0],
        parent,
      );
    const bolt = (
      x: number,
      y: number,
      z: number,
      parent: THREE.Object3D = upper,
    ) => {
      const o = mesh(
        new THREE.CylinderGeometry(0.008, 0.008, 0.005, 6),
        trim,
        [x, y, z],
        parent,
      );
      o.rotation.x = Math.PI / 2;
      panel(0.006, 0.0015, 0.002, rubber, [x, y, z - 0.004], parent);
    };
    // Continuous waist with articulated ribs under the angular chest shell.
    const torso = mesh(
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(0.14, -0.13),
          new THREE.Vector2(0.16, -0.05),
          new THREE.Vector2(0.17, 0.12),
          new THREE.Vector2(0.23, 0.29),
          new THREE.Vector2(0.21, 0.37),
          new THREE.Vector2(0.085, 0.43),
        ],
        24,
      ),
      fabric,
      [0, 0, 0],
    );
    torso.scale.z = 0.7;
    for (let i = 0; i < 5; i++)
      panel(0.28 - i * 0.007, 0.022, 0.025, rubber, [
        0,
        -0.08 + i * 0.04,
        -0.125,
      ]);
    for (const side of [-1, 1]) {
      const chest = plate(
        [
          [-0.015, 0.12],
          [0.16, 0.1],
          [0.2, 0.03],
          [0.17, -0.09],
          [0.02, -0.14],
          [-0.015, -0.06],
        ],
        0.07,
        shell,
        [side * 0.035, 0.26, -0.155],
      );
      chest.scale.x = side;
      const inset = plate(
        [
          [0, 0.08],
          [0.115, 0.07],
          [0.14, 0.015],
          [0.12, -0.025],
          [0.015, -0.07],
        ],
        0.018,
        dark,
        [side * 0.06, 0.265, -0.203],
      );
      inset.scale.x = side;
      rod(
        [side * 0.04, 0.34, -0.228],
        [side * 0.14, 0.32, -0.228],
        0.008,
        accent,
      );
      for (const [x, y] of [
        [0.04, 0.35],
        [0.18, 0.28],
        [0.15, 0.17],
      ])
        bolt(side * x, y, -0.204);
      panel(0.04, 0.27, 0.05, dark, [side * 0.21, 0.17, 0.01]);
      for (let i = 0; i < 4; i++)
        panel(0.04, 0.014, 0.08, trim, [side * 0.225, 0.1 + i * 0.039, 0.025]);
    }
    plate(
      [
        [-0.06, 0.07],
        [0.06, 0.07],
        [0.08, -0.02],
        [0, -0.085],
        [-0.08, -0.02],
      ],
      0.045,
      dark,
      [0, 0.1, -0.18],
    );
    panel(0.045, 0.012, 0.01, accent, [0, 0.095, -0.211]);
    panel(0.31, 0.045, 0.05, dark, [0, -0.13, -0.11]);
    panel(0.065, 0.035, 0.018, trim, [0, -0.13, -0.147]);
    for (const side of [-1, 1]) {
      plate(
        [
          [-0.055, 0.07],
          [0.065, 0.06],
          [0.06, -0.09],
          [-0.045, -0.13],
          [-0.07, -0.03],
        ],
        0.045,
        shell,
        [side * 0.1, 0.83, -0.105],
        root,
      );
      panel(0.075, 0.11, 0.045, dark, [side * 0.13, 0.025, -0.16]);
      for (let i = 0; i < 3; i++)
        panel(0.065, 0.008, 0.015, trim, [
          side * 0.13,
          -0.005 + i * 0.026,
          -0.189,
        ]);
    }
    plate(
      [
        [-0.035, 0.12],
        [0.035, 0.12],
        [0.045, -0.07],
        [0, -0.1],
        [-0.045, -0.07],
      ],
      0.03,
      shell,
      [0, 0.25, -0.18],
    );
    for (let i = 0; i < 3; i++)
      panel(0.21 - i * 0.015, 0.024, 0.026, shell, [
        0,
        -0.06 + i * 0.038,
        -0.137,
      ]);
    const pelvis = mesh(
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(0.16, -0.08),
          new THREE.Vector2(0.18, -0.025),
          new THREE.Vector2(0.16, 0.065),
        ],
        20,
      ),
      rubber,
      [0, 0.855, 0],
      root,
    );
    pelvis.scale.z = 0.7;
    // A shaped eight-section helmet replaces the oversized spherical face.
    const head = new THREE.Group();
    head.name = "head";
    head.position.set(0, 0.63, -0.005);
    upper.add(head);
    const rings = [
      [-0.115, 0.07, 0.075],
      [-0.08, 0.105, 0.105],
      [0.015, 0.119, 0.112],
      [0.09, 0.095, 0.09],
      [0.125, 0.05, 0.055],
    ];
    const vertices: number[] = [],
      indices: number[] = [];
    for (const [y, w, d] of rings)
      for (let n = 0; n < 8; n++) {
        const a = (n * Math.PI) / 4;
        vertices.push(Math.sin(a) * w, y, Math.cos(a) * d);
      }
    for (let r = 0; r < rings.length - 1; r++)
      for (let n = 0; n < 8; n++) {
        const a = r * 8 + n,
          b = r * 8 + ((n + 1) % 8),
          c = a + 8,
          d = b + 8;
        indices.push(a, b, c, b, d, c);
      }
    for (let n = 1; n < 7; n++) indices.push(32, 32 + n, 33 + n);
    const helmet = new THREE.BufferGeometry();
    helmet.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    helmet.setIndex(indices);
    helmet.computeVertexNormals();
    mesh(helmet, shell, [0, 0, 0], head);
    const visor = plate(
      [
        [-0.102, 0.028],
        [-0.07, 0.05],
        [0.07, 0.05],
        [0.102, 0.028],
        [0.09, -0.03],
        [-0.09, -0.03],
      ],
      0.017,
      dark,
      [0, 0.012, -0.105],
      head,
      0.003,
    );
    plate(
      [
        [-0.087, 0.019],
        [-0.06, 0.033],
        [0.06, 0.033],
        [0.087, 0.019],
        [0.074, -0.013],
        [-0.074, -0.013],
      ],
      0.005,
      lens,
      [0, 0.014, -0.117],
      head,
      0.002,
    );
    panel(0.11, 0.005, 0.004, accent, [0, 0.022, -0.124], head);
    plate(
      [
        [-0.072, 0.035],
        [0.072, 0.035],
        [0.053, -0.035],
        [0, -0.052],
        [-0.053, -0.035],
      ],
      0.025,
      dark,
      [0, -0.067, -0.095],
      head,
      0.004,
    );
    for (let i = -2; i <= 2; i++)
      panel(0.009, 0.029, 0.006, trim, [i * 0.018, -0.061, -0.114], head);
    for (const side of [-1, 1]) {
      const cheek = panel(
        0.036,
        0.065,
        0.085,
        shell,
        [side * 0.092, -0.047, -0.04],
        head,
      );
      cheek.rotation.y = side * 0.2;
      const ear = mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.025, 14),
        dark,
        [side * 0.119, -0.005, 0.01],
        head,
      );
      ear.rotation.z = Math.PI / 2;
      const cap = mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.029, 12),
        trim,
        [side * 0.12, -0.005, 0.01],
        head,
      );
      cap.rotation.z = Math.PI / 2;
      bolt(side * 0.075, 0.072, -0.078, head);
    }
    panel(0.034, 0.027, 0.13, dark, [0, 0.109, 0.005], head);
    panel(0.02, 0.014, 0.055, accent, [0, 0.121, -0.01], head);
    rod([0, 0.4, 0], [0, 0.56, 0], 0.058, rubber);
    for (let i = 0; i < 6; i++) {
      const ring = mesh(new THREE.TorusGeometry(0.067, 0.008, 6, 20), rubber, [
        0,
        0.43 + i * 0.018,
        0,
      ]);
      ring.rotation.x = Math.PI / 2;
    }
    // Back power module, heat-sink fins, conduit and maintenance plates.
    plate(
      [
        [-0.15, 0.17],
        [0.15, 0.17],
        [0.17, 0.1],
        [0.13, -0.15],
        [-0.13, -0.15],
        [-0.17, 0.1],
      ],
      0.09,
      shell,
      [0, 0.23, 0.14],
    );
    panel(0.15, 0.23, 0.07, dark, [0, 0.25, 0.21]);
    for (let i = 0; i < 9; i++)
      panel(0.135, 0.008, 0.035, trim, [0, 0.15 + i * 0.022, 0.255]);
    for (const side of [-1, 1]) {
      rod([side * 0.112, 0.1, 0.215], [side * 0.112, 0.35, 0.215], 0.018, dark);
      tube(
        [
          [side * 0.19, 0.33, 0.15],
          [side * 0.23, 0.24, 0.19],
          [side * 0.19, 0.05, 0.19],
          [side * 0.1, -0.06, 0.12],
        ],
        0.011,
        rubber,
      );
      for (const y of [0.1, 0.36]) bolt(side * 0.135, y, 0.199);
    }
    panel(0.11, 0.013, 0.01, accent, [0, 0.39, 0.197]);
    // Shoulder pauldrons have a layered lip and recessed pivot socket.
    for (const side of [-1, 1]) {
      ball(0.085, dark, [side * 0.24, 0.29, 0]);
      const shoulder = plate(
        [
          [-0.085, 0.04],
          [0.045, 0.09],
          [0.105, 0.055],
          [0.085, -0.07],
          [-0.075, -0.06],
        ],
        0.16,
        shell,
        [side * 0.265, 0.315, 0],
      );
      shoulder.rotation.z = -side * 0.14;
      const seam = panel(0.105, 0.018, 0.17, dark, [
        side * 0.28,
        0.325,
        -0.005,
      ]);
      seam.rotation.z = -side * 0.14;
      panel(0.055, 0.028, 0.008, accent, [side * 0.28, 0.31, -0.091]);
      bolt(side * 0.245, 0.347, -0.09);
      bolt(side * 0.305, 0.305, -0.09);
    }
    // Legs: exposed knee axles, calf split shells, pistons and toe caps.
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.name = side < 0 ? "left-leg" : "right-leg";
      leg.position.set(side * 0.125, 0.87, 0);
      root.add(leg);
      const thigh = mesh(
        this.limb(0.31, 0.085, 0.065),
        fabric,
        [0, -0.18, 0],
        leg,
      );
      plate(
        [
          [-0.065, 0.12],
          [0.065, 0.12],
          [0.074, 0.04],
          [0.045, -0.15],
          [-0.045, -0.15],
          [-0.074, 0.04],
        ],
        0.04,
        shell,
        [0, -0.18, -0.063],
        leg,
      );
      panel(0.025, 0.19, 0.009, dark, [0, -0.18, -0.09], leg);
      for (const y of [-0.08, -0.28]) bolt(side * 0.04, y, -0.085, leg);
      panel(0.037, 0.14, 0.09, dark, [side * 0.087, -0.16, 0.01], leg);
      rod(
        [side * 0.078, -0.08, 0.04],
        [side * 0.065, -0.32, 0.035],
        0.012,
        trim,
        leg,
      );
      const knee = new THREE.Group();
      knee.name = side < 0 ? "left-knee" : "right-knee";
      knee.position.set(0, -0.375, 0);
      leg.add(knee);
      const axle = mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.15, 16),
        dark,
        [0, 0, 0],
        knee,
      );
      axle.rotation.z = Math.PI / 2;
      plate(
        [
          [-0.058, 0.045],
          [0.058, 0.045],
          [0.07, 0],
          [0.035, -0.055],
          [-0.035, -0.055],
          [-0.07, 0],
        ],
        0.035,
        shell,
        [0, 0, -0.065],
        knee,
      );
      panel(0.032, 0.012, 0.005, accent, [0, 0.005, -0.089], knee);
      mesh(this.limb(0.28, 0.055, 0.038), rubber, [0, -0.19, 0.015], knee);
      for (const sign of [-1, 1]) {
        const shin = plate(
          [
            [-0.025, 0.1],
            [0.025, 0.1],
            [0.03, -0.09],
            [0.018, -0.14],
            [-0.018, -0.14],
          ],
          0.045,
          shell,
          [sign * 0.032, -0.185, -0.04],
          knee,
        );
        shin.rotation.y = sign * 0.18;
        rod(
          [sign * 0.055, -0.09, 0.04],
          [sign * 0.038, -0.32, 0.025],
          0.009,
          trim,
          knee,
        );
      }
      panel(0.023, 0.21, 0.012, dark, [0, -0.185, -0.072], knee);
      const ankle = new THREE.Group();
      ankle.name = side < 0 ? "left-foot" : "right-foot";
      ankle.position.set(0, -0.37, 0);
      knee.add(ankle);
      panel(0.145, 0.073, 0.24, rubber, [0, -0.055, -0.035], ankle);
      plate(
        [
          [-0.067, 0.025],
          [0.067, 0.025],
          [0.06, -0.025],
          [-0.06, -0.025],
        ],
        0.13,
        shell,
        [0, -0.044, -0.103],
        ankle,
      );
      for (let i = 0; i < 4; i++)
        panel(0.12, 0.007, 0.013, dark, [0, -0.075, -0.115 + i * 0.042], ankle);
    }
    const gun = new THREE.Group();
    gun.name = "rifle";
    gun.position.set(0.085, 0.27, -0.16);
    upper.add(gun);
    const gunMaterials = {
      ano: dark,
      gun: trim,
      poly: rubber,
      plain: shell,
      bolt: trim,
      mag: dark,
      round: brass,
    };
    for (const [key, geometry] of Object.entries(createRifleGeometry()))
      mesh(
        geometry,
        gunMaterials[key as keyof typeof gunMaterials],
        [0, 0, 0],
        gun,
      );
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.name = side < 0 ? "left-arm" : "right-arm";
      upper.add(arm);
      const shoulder = [side * 0.255, 0.27, 0],
        elbow = side < 0 ? [-0.29, 0.04, -0.16] : [0.29, 0.025, 0.015],
        hand = side < 0 ? [0.075, 0.27, -0.41] : [0.085, 0.17, -0.087];
      rod(shoulder, elbow, 0.064, fabric, arm);
      ball(0.055, dark, elbow, arm);
      const cap = mesh(
        new THREE.CylinderGeometry(0.046, 0.046, 0.035, 14),
        trim,
        elbow,
        arm,
      );
      cap.rotation.z = Math.PI / 2;
      rod(elbow, hand, 0.043, rubber, arm);
      const armor = panel(
        0.09,
        0.17,
        0.072,
        shell,
        new THREE.Vector3(...elbow)
          .lerp(new THREE.Vector3(...hand), 0.55)
          .toArray(),
        arm,
      );
      armor.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(...hand).sub(new THREE.Vector3(...elbow)).normalize(),
      );
      const pistonFrom = new THREE.Vector3(...elbow).add(
        new THREE.Vector3(side * 0.05, 0.01, 0),
      );
      const pistonTo = new THREE.Vector3(...hand).add(
        new THREE.Vector3(side * 0.035, 0, 0),
      );
      rod(pistonFrom.toArray(), pistonTo.toArray(), 0.008, trim, arm);
      const palm = panel(0.065, 0.065, 0.035, rubber, hand, arm);
      for (let finger = 0; finger < 4; finger++) {
        rod(
          [hand[0] - 0.023 + finger * 0.015, hand[1] - 0.02, hand[2]],
          [hand[0] - 0.023 + finger * 0.015, hand[1] - 0.045, hand[2] - 0.01],
          0.009,
          dark,
          arm,
        );
        panel(
          0.011,
          0.012,
          0.015,
          shell,
          [hand[0] - 0.023 + finger * 0.015, hand[1] - 0.025, hand[2] - 0.014],
          arm,
        );
      }
    }
    this.template = skinRigidHierarchy(root);
    const protection = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.016, 6, 40),
      accent,
    );
    protection.name = "spawn-protection";
    protection.position.y = 0.025;
    protection.rotation.x = Math.PI / 2;
    this.template.add(protection);
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
    const actor = cloneSkeleton(this.template) as THREE.Group,
      patch = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.65,
        emissive: color,
        emissiveIntensity: 0.13,
      });
    patch.vertexColors = true;
    actor.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        if (Array.isArray(object.material))
          object.material = object.material.map((m) =>
            m.name === "identity" ? patch : m,
          );
        else if (object.name === "spawn-protection") object.material = patch;
      }
    });
    const get = (name: string) => actor.getObjectByName(name)!;
    actor.userData.protection = get("spawn-protection");
    this.rigs.set(actor, {
      upper: get("upper"),
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
    const amplitude = Math.min(0.3, rig.speed * 0.05);
    const pose = (offset: number) => {
      const cycle = (((rig.phase / (Math.PI * 2) + offset) % 1) + 1) % 1;
      let forward: number,
        lift = 0;
      if (cycle < 0.62)
        forward = THREE.MathUtils.lerp(amplitude, -amplitude, cycle / 0.62);
      else {
        const swing = (cycle - 0.62) / 0.38;
        const smooth = swing * swing * (3 - 2 * swing);
        forward = THREE.MathUtils.lerp(-amplitude, amplitude, smooth);
        lift = Math.sin(swing * Math.PI) * amplitude * 0.45;
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
      THREE.MathUtils.clamp(pitch, -0.9, 0.9) * 0.75,
      1 - Math.exp(-dt * 14),
    );
    rig.upper.position.y =
      1.04 + Math.abs(Math.sin(rig.phase)) * amplitude * 0.025;
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
    actor.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
    });
    this.rigs.get(actor)?.patch.dispose();
    this.rigs.delete(actor);
  }
}
