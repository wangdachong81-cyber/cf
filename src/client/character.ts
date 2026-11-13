import * as THREE from "three";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { skinRigidHierarchy, solveLeg } from "./rig";
import type { OriginalMaterials } from "./original/engine.js";
import { createRifleGeometry } from "./original/engine.js";

// Authored geometry with a joint hierarchy. All actors share geometry/textures;
// only their identity patches and animation transforms are per player.
//
// Proportions target RULES.eye = 1.68: hip 0.87, shoulder line 1.33, helmet top
// ~1.78. Forward is local -Z. Joint names and leg segment lengths are load
// bearing: rig.solveLeg uses thigh 0.375 / shin 0.37 and the animator drives
// "upper", "left/right-leg", "-knee", "-foot", "left-arm" and "rifle" by name.
export class CharacterFactory {
  private template = new THREE.Group();
  private rigs = new WeakMap<
    THREE.Group,
    {
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
    ) => mesh(new THREE.SphereGeometry(r, 14, 10), m, p, parent);
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
        new THREE.CylinderGeometry(radius, radius, v.length(), 12),
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
          20,
          r,
          8,
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
    // Torso: a continuous undersuit lathe under an angular three-piece chest.
    const torso = mesh(
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(0.135, -0.15),
          new THREE.Vector2(0.155, -0.06),
          new THREE.Vector2(0.165, 0.1),
          new THREE.Vector2(0.215, 0.27),
          new THREE.Vector2(0.205, 0.36),
          new THREE.Vector2(0.085, 0.43),
        ],
        24,
      ),
      fabric,
      [0, 0, 0],
    );
    torso.scale.z = 0.72;
    // Articulated abdominal ribs over the suit, front and back.
    for (let i = 0; i < 5; i++) {
      const w = 0.26 - i * 0.008;
      panel(w, 0.02, 0.024, rubber, [0, -0.09 + i * 0.042, -0.128]);
      panel(w * 0.9, 0.018, 0.02, rubber, [0, -0.085 + i * 0.042, 0.122]);
    }
    for (const side of [-1, 1]) {
      // Pectoral shells with a recessed inset and an identity light bar.
      const chest = plate(
        [
          [-0.015, 0.13],
          [0.15, 0.115],
          [0.2, 0.04],
          [0.175, -0.07],
          [0.03, -0.135],
          [-0.015, -0.05],
        ],
        0.075,
        shell,
        [side * 0.035, 0.26, -0.15],
      );
      chest.scale.x = side;
      const inset = plate(
        [
          [0, 0.085],
          [0.11, 0.075],
          [0.135, 0.02],
          [0.115, -0.02],
          [0.015, -0.065],
        ],
        0.02,
        dark,
        [side * 0.062, 0.268, -0.2],
      );
      inset.scale.x = side;
      rod(
        [side * 0.045, 0.345, -0.224],
        [side * 0.135, 0.328, -0.224],
        0.007,
        accent,
      );
      for (const [x, y] of [
        [0.04, 0.36],
        [0.18, 0.29],
        [0.155, 0.175],
      ])
        bolt(side * x, y, -0.2);
      // Side rib armour with cooling slats.
      panel(0.04, 0.26, 0.06, dark, [side * 0.2, 0.16, 0.015]);
      for (let i = 0; i < 4; i++)
        panel(0.042, 0.013, 0.085, trim, [side * 0.215, 0.09 + i * 0.04, 0.028]);
      // Clavicle guard bridging chest and pauldron.
      const clav = plate(
        [
          [-0.07, 0.028],
          [0.055, 0.045],
          [0.075, 0.005],
          [0.05, -0.03],
          [-0.06, -0.028],
        ],
        0.05,
        trim,
        [side * 0.155, 0.385, -0.09],
      );
      clav.scale.x = side;
      clav.rotation.z = -side * 0.18;
    }
    // Sternum plate with a central identity marker.
    plate(
      [
        [-0.055, 0.075],
        [0.055, 0.075],
        [0.075, -0.015],
        [0, -0.085],
        [-0.075, -0.015],
      ],
      0.05,
      dark,
      [0, 0.115, -0.175],
    );
    panel(0.042, 0.011, 0.01, accent, [0, 0.11, -0.208]);
    plate(
      [
        [-0.032, 0.115],
        [0.032, 0.115],
        [0.042, -0.065],
        [0, -0.095],
        [-0.042, -0.065],
      ],
      0.03,
      shell,
      [0, 0.27, -0.182],
    );
    // Lower abdomen lames and utility belt.
    for (let i = 0; i < 3; i++)
      panel(0.2 - i * 0.014, 0.023, 0.026, shell, [
        0,
        -0.055 + i * 0.037,
        -0.14,
      ]);
    panel(0.3, 0.045, 0.05, dark, [0, -0.135, -0.112]);
    panel(0.062, 0.034, 0.018, trim, [0, -0.135, -0.148]);
    panel(0.02, 0.012, 0.006, accent, [0, -0.135, -0.158]);
    for (const side of [-1, 1]) {
      // Belt pouches with lid seams.
      panel(0.07, 0.1, 0.05, dark, [side * 0.125, -0.1, -0.155]);
      panel(0.074, 0.02, 0.054, trim, [side * 0.125, -0.058, -0.155]);
      panel(0.06, 0.008, 0.012, trim, [side * 0.125, -0.105, -0.184]);
    }
    // Hip guards on the pelvis, plus mag pouches at the front.
    for (const side of [-1, 1]) {
      plate(
        [
          [-0.055, 0.075],
          [0.065, 0.06],
          [0.06, -0.09],
          [-0.045, -0.13],
          [-0.07, -0.03],
        ],
        0.045,
        shell,
        [side * 0.105, 0.845, -0.1],
        root,
      );
      panel(0.075, 0.105, 0.045, dark, [side * 0.135, 0.03, -0.158]);
      for (let i = 0; i < 3; i++)
        panel(0.064, 0.008, 0.014, trim, [
          side * 0.135,
          0.002 + i * 0.026,
          -0.186,
        ]);
    }
    const pelvis = mesh(
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(0.155, -0.085),
          new THREE.Vector2(0.175, -0.025),
          new THREE.Vector2(0.155, 0.065),
        ],
        20,
      ),
      rubber,
      [0, 0.86, 0],
      root,
    );
    pelvis.scale.z = 0.72;
    // Codpiece and rear pelvis plate.
    plate(
      [
        [-0.05, 0.055],
        [0.05, 0.055],
        [0.062, -0.02],
        [0, -0.085],
        [-0.062, -0.02],
      ],
      0.04,
      dark,
      [0, 0.8, -0.115],
      root,
    );
    plate(
      [
        [-0.09, 0.06],
        [0.09, 0.06],
        [0.11, -0.01],
        [0.07, -0.075],
        [-0.07, -0.075],
        [-0.11, -0.01],
      ],
      0.045,
      shell,
      [0, 0.83, 0.115],
      root,
    );
    // Helmet: lofted rings with a chin taper, brow ridge and layered face mask.
    const head = new THREE.Group();
    head.name = "head";
    head.position.set(0, 0.6, -0.005);
    upper.add(head);
    const rings = [
      [-0.125, 0.062, 0.068],
      [-0.095, 0.096, 0.098],
      [-0.02, 0.117, 0.115],
      [0.05, 0.121, 0.117],
      [0.105, 0.098, 0.094],
      [0.14, 0.052, 0.056],
    ];
    const vertices: number[] = [],
      indices: number[] = [];
    for (const [y, w, d] of rings)
      for (let n = 0; n < 10; n++) {
        const a = (n * Math.PI) / 5;
        vertices.push(Math.sin(a) * w, y, Math.cos(a) * d);
      }
    for (let r = 0; r < rings.length - 1; r++)
      for (let n = 0; n < 10; n++) {
        const a = r * 10 + n,
          b = r * 10 + ((n + 1) % 10),
          c = a + 10,
          d = b + 10;
        indices.push(a, b, c, b, d, c);
      }
    const topCenter = vertices.length / 3;
    vertices.push(0, 0.152, 0.004);
    for (let n = 0; n < 10; n++)
      indices.push(topCenter, 50 + n, 50 + ((n + 1) % 10));
    const helmet = new THREE.BufferGeometry();
    helmet.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    helmet.setIndex(indices);
    helmet.computeVertexNormals();
    mesh(helmet, shell, [0, 0, 0], head);
    // Brow ridge over the visor slit.
    const brow = plate(
      [
        [-0.105, 0.012],
        [-0.075, 0.03],
        [0.075, 0.03],
        [0.105, 0.012],
        [0.08, -0.006],
        [-0.08, -0.006],
      ],
      0.03,
      shell,
      [0, 0.052, -0.104],
      head,
      0.004,
    );
    brow.rotation.x = 0.12;
    const visor = plate(
      [
        [-0.098, 0.024],
        [-0.068, 0.042],
        [0.068, 0.042],
        [0.098, 0.024],
        [0.086, -0.026],
        [-0.086, -0.026],
      ],
      0.016,
      dark,
      [0, 0.006, -0.108],
      head,
      0.003,
    );
    plate(
      [
        [-0.084, 0.016],
        [-0.058, 0.028],
        [0.058, 0.028],
        [0.084, 0.016],
        [0.071, -0.011],
        [-0.071, -0.011],
      ],
      0.005,
      lens,
      [0, 0.008, -0.119],
      head,
      0.002,
    );
    panel(0.104, 0.004, 0.004, accent, [0, 0.016, -0.126], head);
    // Respirator chin with intake grille.
    plate(
      [
        [-0.07, 0.032],
        [0.07, 0.032],
        [0.052, -0.034],
        [0, -0.05],
        [-0.052, -0.034],
      ],
      0.028,
      dark,
      [0, -0.066, -0.094],
      head,
      0.004,
    );
    for (let i = -2; i <= 2; i++)
      panel(0.008, 0.028, 0.006, trim, [i * 0.017, -0.06, -0.113], head);
    for (const side of [-1, 1]) {
      const filter = mesh(
        new THREE.CylinderGeometry(0.021, 0.024, 0.02, 12),
        trim,
        [side * 0.062, -0.078, -0.088],
        head,
      );
      filter.rotation.x = Math.PI / 2 - 0.35;
      filter.rotation.z = -side * 0.3;
      const cheek = panel(
        0.034,
        0.062,
        0.082,
        shell,
        [side * 0.09, -0.045, -0.038],
        head,
      );
      cheek.rotation.y = side * 0.22;
      const ear = mesh(
        new THREE.CylinderGeometry(0.031, 0.031, 0.024, 16),
        dark,
        [side * 0.117, -0.002, 0.012],
        head,
      );
      ear.rotation.z = Math.PI / 2;
      const cap = mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.028, 12),
        trim,
        [side * 0.118, -0.002, 0.012],
        head,
      );
      cap.rotation.z = Math.PI / 2;
      panel(0.01, 0.01, 0.006, accent, [side * 0.132, -0.002, 0.012], head);
      bolt(side * 0.072, 0.075, -0.076, head);
      // Rear occipital vents.
      panel(0.028, 0.05, 0.02, dark, [side * 0.055, -0.01, 0.104], head);
    }
    // Crown rail with identity stripe and a short comms antenna.
    panel(0.032, 0.024, 0.125, dark, [0, 0.128, 0.008], head);
    panel(0.018, 0.012, 0.05, accent, [0, 0.14, -0.012], head);
    rod([0.095, 0.02, 0.075], [0.108, 0.155, 0.095], 0.004, dark, head);
    ball(0.007, accent, [0.108, 0.158, 0.096], head);
    // Neck: ribbed gasket between collar and helmet.
    rod([0, 0.4, 0], [0, 0.55, 0], 0.056, rubber);
    for (let i = 0; i < 5; i++) {
      const ring = mesh(new THREE.TorusGeometry(0.064, 0.008, 6, 20), rubber, [
        0,
        0.435 + i * 0.02,
        0,
      ]);
      ring.rotation.x = Math.PI / 2;
    }
    const collar = mesh(new THREE.TorusGeometry(0.095, 0.02, 8, 22), dark, [
      0,
      0.415,
      0,
    ]);
    collar.rotation.x = Math.PI / 2;
    collar.scale.z = 0.8;
    // Back: power module, heat-sink fins, twin canisters and conduits.
    plate(
      [
        [-0.145, 0.17],
        [0.145, 0.17],
        [0.165, 0.1],
        [0.125, -0.15],
        [-0.125, -0.15],
        [-0.165, 0.1],
      ],
      0.09,
      shell,
      [0, 0.235, 0.14],
    );
    panel(0.145, 0.22, 0.065, dark, [0, 0.25, 0.208]);
    for (let i = 0; i < 9; i++)
      panel(0.13, 0.007, 0.034, trim, [0, 0.155 + i * 0.022, 0.25]);
    panel(0.1, 0.012, 0.01, accent, [0, 0.392, 0.196]);
    for (const side of [-1, 1]) {
      const canister = mesh(
        new THREE.CylinderGeometry(0.026, 0.026, 0.24, 14),
        trim,
        [side * 0.108, 0.225, 0.218],
      );
      for (const y of [0.115, 0.335])
        mesh(new THREE.TorusGeometry(0.027, 0.006, 6, 14), dark, [
          side * 0.108,
          y,
          0.218,
        ]).rotation.x = Math.PI / 2;
      tube(
        [
          [side * 0.185, 0.33, 0.145],
          [side * 0.225, 0.235, 0.185],
          [side * 0.185, 0.05, 0.185],
          [side * 0.095, -0.065, 0.115],
        ],
        0.011,
        rubber,
      );
      for (const y of [0.105, 0.36]) bolt(side * 0.13, y, 0.198);
    }
    // Pauldrons: layered shell over a ball joint with a recessed socket.
    for (const side of [-1, 1]) {
      ball(0.082, dark, [side * 0.235, 0.29, 0]);
      const shoulder = plate(
        [
          [-0.085, 0.035],
          [0.04, 0.095],
          [0.11, 0.06],
          [0.09, -0.075],
          [-0.075, -0.06],
        ],
        0.17,
        shell,
        [side * 0.262, 0.315, 0],
      );
      shoulder.scale.x = side;
      shoulder.rotation.z = -side * 0.15;
      const lip = plate(
        [
          [-0.075, 0.02],
          [0.05, 0.045],
          [0.095, 0.015],
          [0.08, -0.03],
          [-0.07, -0.025],
        ],
        0.175,
        trim,
        [side * 0.27, 0.245, 0],
      );
      lip.scale.x = side;
      lip.rotation.z = -side * 0.15;
      panel(0.05, 0.024, 0.008, accent, [side * 0.278, 0.318, -0.096]);
      bolt(side * 0.243, 0.35, -0.094);
      bolt(side * 0.3, 0.305, -0.094);
    }
    // Arms are posed to actually hold the rifle: right hand wraps the pistol
    // grip, left hand supports the handguard. Rifle profile coordinates map
    // directly to world axes (muzzle already at local -Z), so no flip.
    const grip = [0.085, 0.17, -0.073];
    const fore = [0.085, 0.212, -0.39];
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.name = side < 0 ? "left-arm" : "right-arm";
      upper.add(arm);
      const shoulder = [side * 0.25, 0.275, 0],
        elbow = side < 0 ? [-0.27, 0.055, -0.17] : [0.285, 0.03, 0.02],
        hand = side < 0 ? fore : grip;
      rod(shoulder, elbow, 0.06, fabric, arm);
      // Upper-arm shell along the limb axis.
      const bicep = panel(
        0.085,
        0.15,
        0.075,
        shell,
        new THREE.Vector3(...shoulder)
          .lerp(new THREE.Vector3(...elbow), 0.5)
          .toArray(),
        arm,
      );
      bicep.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(...elbow).sub(new THREE.Vector3(...shoulder)).normalize(),
      );
      ball(0.052, dark, elbow, arm);
      const cap = mesh(
        new THREE.CylinderGeometry(0.044, 0.044, 0.034, 14),
        trim,
        elbow,
        arm,
      );
      cap.rotation.z = Math.PI / 2;
      rod(elbow, hand, 0.042, rubber, arm);
      const armor = panel(
        0.088,
        0.16,
        0.07,
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
      panel(
        0.02,
        0.09,
        0.01,
        accent,
        new THREE.Vector3(...elbow)
          .lerp(new THREE.Vector3(...hand), 0.55)
          .add(new THREE.Vector3(side * 0.048, 0, 0))
          .toArray(),
        arm,
      );
      const pistonFrom = new THREE.Vector3(...elbow).add(
        new THREE.Vector3(side * 0.048, 0.01, 0),
      );
      const pistonTo = new THREE.Vector3(...hand).add(
        new THREE.Vector3(side * 0.032, 0, 0),
      );
      rod(pistonFrom.toArray(), pistonTo.toArray(), 0.008, trim, arm);
      // Glove: palm block plus curled fingers wrapping toward the weapon.
      const palm = panel(0.06, 0.058, 0.05, rubber, hand, arm);
      palm.rotation.x = side < 0 ? 0.5 : 0.25;
      panel(0.062, 0.02, 0.052, shell, [hand[0], hand[1] + 0.032, hand[2]], arm);
      for (let finger = 0; finger < 4; finger++) {
        const fx = hand[0] - 0.021 + finger * 0.014;
        rod(
          [fx, hand[1] - 0.012, hand[2] - 0.02],
          [fx, hand[1] - 0.036, hand[2] - 0.028],
          0.008,
          dark,
          arm,
        );
        panel(
          0.011,
          0.011,
          0.014,
          shell,
          [fx, hand[1] - 0.018, hand[2] - 0.032],
          arm,
        );
      }
      rod(
        [hand[0] + side * 0.03, hand[1] + 0.005, hand[2] - 0.005],
        [hand[0] + side * 0.038, hand[1] - 0.018, hand[2] - 0.022],
        0.009,
        dark,
        arm,
      );
    }
    // Legs: tapered suit limbs, front thigh plate, exposed knee axle with a
    // floating cap, split shin shells, calf pistons and layered boot soles.
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.name = side < 0 ? "left-leg" : "right-leg";
      leg.position.set(side * 0.125, 0.87, 0);
      root.add(leg);
      ball(0.07, dark, [0, -0.015, 0], leg);
      mesh(this.limb(0.32, 0.088, 0.062), fabric, [0, -0.185, 0], leg);
      plate(
        [
          [-0.062, 0.125],
          [0.062, 0.125],
          [0.072, 0.045],
          [0.045, -0.15],
          [-0.045, -0.15],
          [-0.072, 0.045],
        ],
        0.042,
        shell,
        [0, -0.18, -0.062],
        leg,
      );
      panel(0.024, 0.19, 0.009, dark, [0, -0.18, -0.089], leg);
      panel(0.014, 0.06, 0.006, accent, [0, -0.12, -0.095], leg);
      for (const y of [-0.075, -0.285]) bolt(side * 0.042, y, -0.084, leg);
      // Outer thigh plate and actuator.
      panel(0.036, 0.15, 0.09, dark, [side * 0.088, -0.165, 0.008], leg);
      rod(
        [side * 0.078, -0.075, 0.042],
        [side * 0.064, -0.325, 0.034],
        0.012,
        trim,
        leg,
      );
      const knee = new THREE.Group();
      knee.name = side < 0 ? "left-knee" : "right-knee";
      knee.position.set(0, -0.375, 0);
      leg.add(knee);
      const axle = mesh(
        new THREE.CylinderGeometry(0.048, 0.048, 0.145, 16),
        dark,
        [0, 0, 0],
        knee,
      );
      axle.rotation.z = Math.PI / 2;
      for (const sign of [-1, 1]) {
        const hub = mesh(
          new THREE.CylinderGeometry(0.03, 0.03, 0.012, 12),
          trim,
          [sign * 0.078, 0, 0],
          knee,
        );
        hub.rotation.z = Math.PI / 2;
      }
      plate(
        [
          [-0.055, 0.048],
          [0.055, 0.048],
          [0.068, 0],
          [0.034, -0.056],
          [-0.034, -0.056],
          [-0.068, 0],
        ],
        0.036,
        shell,
        [0, 0.002, -0.064],
        knee,
      );
      panel(0.03, 0.011, 0.005, accent, [0, 0.007, -0.088], knee);
      mesh(this.limb(0.28, 0.056, 0.037), rubber, [0, -0.19, 0.014], knee);
      for (const sign of [-1, 1]) {
        const shin = plate(
          [
            [-0.026, 0.105],
            [0.026, 0.105],
            [0.031, -0.09],
            [0.018, -0.145],
            [-0.018, -0.145],
          ],
          0.046,
          shell,
          [sign * 0.033, -0.185, -0.04],
          knee,
        );
        shin.rotation.y = sign * 0.18;
        rod(
          [sign * 0.054, -0.085, 0.042],
          [sign * 0.037, -0.325, 0.024],
          0.009,
          trim,
          knee,
        );
      }
      panel(0.022, 0.2, 0.012, dark, [0, -0.185, -0.073], knee);
      // Calf shell.
      plate(
        [
          [-0.04, 0.09],
          [0.04, 0.09],
          [0.05, 0.02],
          [0.03, -0.1],
          [-0.03, -0.1],
          [-0.05, 0.02],
        ],
        0.04,
        shell,
        [0, -0.16, 0.062],
        knee,
      );
      const ankle = new THREE.Group();
      ankle.name = side < 0 ? "left-foot" : "right-foot";
      ankle.position.set(0, -0.37, 0);
      knee.add(ankle);
      ball(0.042, dark, [0, -0.01, 0], ankle);
      // Boot: rubber body, armoured toe cap, heel block and treaded sole.
      panel(0.14, 0.07, 0.23, rubber, [0, -0.058, -0.03], ankle);
      plate(
        [
          [-0.066, 0.026],
          [0.066, 0.026],
          [0.058, -0.026],
          [-0.058, -0.026],
        ],
        0.125,
        shell,
        [0, -0.048, -0.1],
        ankle,
      );
      panel(0.1, 0.055, 0.06, shell, [0, -0.05, 0.075], ankle);
      panel(0.15, 0.02, 0.25, dark, [0, -0.098, -0.03], ankle);
      for (let i = 0; i < 5; i++)
        panel(0.13, 0.008, 0.014, rubber, [0, -0.108, -0.125 + i * 0.045], ankle);
      panel(0.05, 0.014, 0.01, accent, [0, -0.032, -0.163], ankle);
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
    // Counter-stride leg sway keeps the silhouette alive while walking.
    const sway = Math.sin(rig.phase) * amplitude * 0.12;
    rig.left.rotation.z = airborne ? 0 : sway;
    rig.right.rotation.z = airborne ? 0 : -sway;
    rig.upper.rotation.x = THREE.MathUtils.lerp(
      rig.upper.rotation.x,
      THREE.MathUtils.clamp(pitch, -0.9, 0.9) * 0.75,
      1 - Math.exp(-dt * 14),
    );
    rig.upper.rotation.y = THREE.MathUtils.lerp(
      rig.upper.rotation.y,
      airborne ? 0 : -sway * 0.6,
      1 - Math.exp(-dt * 10),
    );
    rig.upper.position.y =
      1.04 + Math.abs(Math.sin(rig.phase)) * amplitude * 0.025;
    // Head stabilises against the torso pitch and scans slightly at idle.
    rig.head.rotation.x = THREE.MathUtils.lerp(
      rig.head.rotation.x,
      -rig.upper.rotation.x * 0.45,
      1 - Math.exp(-dt * 8),
    );
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
    rig.gun.position.y = THREE.MathUtils.lerp(
      rig.gun.position.y,
      0.27 + (reloading ? -0.03 : Math.abs(Math.sin(rig.phase)) * amplitude * 0.02),
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