import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Rigid skinning, as used by the original mechanical hound: each hard-surface
 * vertex follows one bone. Merge by material without losing the joint hierarchy. */
export function skinRigidHierarchy(source: THREE.Group): THREE.Group {
  source.updateMatrixWorld(true);
  const bones: THREE.Bone[] = [],
    indices = new Map<THREE.Object3D, number>();
  function build(node: THREE.Object3D, parent: THREE.Bone | null) {
    const bone = new THREE.Bone();
    bone.name = node.name;
    bone.position.copy(node.position);
    bone.quaternion.copy(node.quaternion);
    bone.scale.copy(node.scale);
    indices.set(node, bones.length);
    bones.push(bone);
    parent?.add(bone);
    for (const child of node.children)
      if (!(child instanceof THREE.Mesh)) build(child, bone);
  }
  build(source, null);
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>(),
    originals = new Set<THREE.BufferGeometry>();
  source.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || Array.isArray(node.material)) return;
    let parent = node.parent!;
    while (!indices.has(parent)) parent = parent.parent!;
    let geometry = node.geometry.clone();
    if (geometry.index) {
      const old = geometry;
      geometry = old.toNonIndexed();
      old.dispose();
    }
    geometry.applyMatrix4(node.matrixWorld);
    if (node.matrixWorld.determinant() < 0) {
      const count = geometry.attributes.position.count;
      geometry.setIndex(
        Array.from(
          { length: count },
          (_, i) => Math.floor(i / 3) * 3 + [0, 2, 1][i % 3],
        ),
      );
      const reflected = geometry.toNonIndexed();
      geometry.dispose();
      geometry = reflected;
    }
    if (!node.userData.preserveNormals || !geometry.getAttribute("normal"))
      geometry.computeVertexNormals();
    const count = geometry.attributes.position.count;
    const colors = new Float32Array(count * 3),
      joints = new Uint16Array(count * 4),
      weights = new Float32Array(count * 4);
    const originalColor = geometry.getAttribute("color"),
      normal = geometry.getAttribute("normal");
    for (let i = 0; i < count; i++) {
      const ao = 0.86 + 0.14 * (normal.getY(i) * 0.5 + 0.5);
      colors[i * 3] = (originalColor?.getX(i) ?? 1) * ao;
      colors[i * 3 + 1] = (originalColor?.getY(i) ?? 1) * ao;
      colors[i * 3 + 2] = (originalColor?.getZ(i) ?? 1) * ao;
      joints[i * 4] = indices.get(parent)!;
      weights[i * 4] = 1;
    }
    for (const name of Object.keys(geometry.attributes))
      if (!["position", "normal", "uv"].includes(name))
        geometry.deleteAttribute(name);
    if (!geometry.getAttribute("uv"))
      geometry.setAttribute(
        "uv",
        new THREE.BufferAttribute(new Float32Array(count * 2), 2),
      );
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("skinIndex", new THREE.BufferAttribute(joints, 4));
    geometry.setAttribute("skinWeight", new THREE.BufferAttribute(weights, 4));
    const batch = batches.get(node.material) ?? [];
    batch.push(geometry);
    batches.set(node.material, batch);
    originals.add(node.geometry);
  });
  const materials = [...batches.keys()],
    groups = materials.map((m) => mergeGeometries(batches.get(m)!, false)!);
  const combined = mergeGeometries(groups, true)!;
  for (const geometries of batches.values())
    for (const geometry of geometries) geometry.dispose();
  groups.forEach((g) => g.dispose());
  originals.forEach((g) => g.dispose());
  combined.computeBoundingBox();
  combined.computeBoundingSphere();
  const mesh = new THREE.SkinnedMesh(combined, materials);
  mesh.name = "operator-shell";
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.add(bones[0]);
  const result = new THREE.Group();
  result.name = "operator";
  result.add(mesh);
  result.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  // Procedural stride, aim and reload can extend beyond the rest-pose bounds.
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.55);
  mesh.boundingBox = new THREE.Box3(
    new THREE.Vector3(-1, -0.4, -1),
    new THREE.Vector3(1, 2.3, 1),
  );
  return result;
}

/** Two-link leg IK in the sagittal plane; forward is local -Z. */
export function solveLeg(
  forward: number,
  down: number,
  thigh = 0.375,
  shin = 0.37,
) {
  const distance = THREE.MathUtils.clamp(
    Math.hypot(forward, down),
    Math.abs(thigh - shin) + 0.001,
    thigh + shin,
  );
  const cosine = THREE.MathUtils.clamp(
    (thigh * thigh + distance * distance - shin * shin) /
      (2 * thigh * distance),
    -1,
    1,
  );
  const kneeCosine = THREE.MathUtils.clamp(
    (distance * distance - thigh * thigh - shin * shin) / (2 * thigh * shin),
    -1,
    1,
  );
  const hip = Math.atan2(forward, down) + Math.acos(cosine),
    knee = -Math.acos(kneeCosine);
  return { hip, knee, ankle: -hip - knee };
}
