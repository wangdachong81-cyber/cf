import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { skinRigidHierarchy, solveLeg } from "../src/client/rig";

test("leg IK reaches its target and keeps a planted sole level", () => {
  for (const [forward, down] of [
    [0, 0.745],
    [0.2, 0.65],
    [-0.18, 0.68],
    [0.1, 0.5],
  ]) {
    const pose = solveLeg(forward, down),
      shinAngle = pose.hip + pose.knee;
    const actualForward =
      0.375 * Math.sin(pose.hip) + 0.37 * Math.sin(shinAngle);
    const actualDown = 0.375 * Math.cos(pose.hip) + 0.37 * Math.cos(shinAngle);
    assert.ok(Math.abs(actualForward - forward) < 1e-6);
    assert.ok(Math.abs(actualDown - down) < 1e-6);
    assert.ok(Math.abs(pose.hip + pose.knee + pose.ankle) < 1e-9);
  }
  for (const point of [
    [0, 0],
    [5, 5],
    [-5, 0.1],
  ])
    assert.ok(
      Object.values(solveLeg(point[0], point[1])).every(Number.isFinite),
    );
});
test("rigid skinning preserves joint motion and isolates each player skeleton", () => {
  const root = new THREE.Group(),
    joint = new THREE.Group();
  joint.name = "knee";
  joint.position.y = 1;
  root.add(joint);
  const material = new THREE.MeshStandardMaterial(),
    mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.2), material);
  mesh.position.y = -0.25;
  joint.add(mesh);
  const model = skinRigidHierarchy(root),
    a = clone(model),
    b = clone(model);
  const skinA = a.getObjectByName("operator-shell") as THREE.SkinnedMesh,
    skinB = b.getObjectByName("operator-shell") as THREE.SkinnedMesh;
  assert.equal(skinA.geometry, skinB.geometry);
  assert.notEqual(skinA.skeleton, skinB.skeleton);
  a.updateMatrixWorld(true);
  const before = skinA.getVertexPosition(0, new THREE.Vector3()).clone();
  a.getObjectByName("knee")!.rotation.x = 0.8;
  a.updateMatrixWorld(true);
  const after = skinA.getVertexPosition(0, new THREE.Vector3());
  assert.ok(before.distanceTo(after) > 0.05);
  assert.ok(Math.abs(b.getObjectByName("knee")!.rotation.x) < 1e-9);
  assert.ok(skinA.geometry.getAttribute("skinWeight").getX(0) === 1);
  skinA.skeleton.dispose();
  skinB.skeleton.dispose();
  material.dispose();
});

test("mirrored armor retains its exterior winding after geometry baking", () => {
  const source = new THREE.Group(),
    material = new THREE.MeshStandardMaterial(),
    plate = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  plate.scale.x = -1;
  source.add(plate);
  const model = skinRigidHierarchy(source),
    mesh = model.getObjectByName("operator-shell") as THREE.SkinnedMesh;
  const normals = mesh.geometry.getAttribute("normal");
  for (let i = 0; i < normals.count; i++) assert.ok(normals.getZ(i) > 0.99);
  mesh.skeleton.dispose();
  mesh.geometry.dispose();
  material.dispose();
});

test("reused glove surfaces retain smooth normals through transformed skin baking", () => {
  const source = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  const geometry = new THREE.SphereGeometry(1, 12, 8);
  const glove = new THREE.Mesh(geometry, material);
  glove.userData.preserveNormals = true;
  glove.rotation.set(0.3, -0.2, 0.7);
  glove.scale.set(0.2, 0.3, 0.1);
  source.add(glove);
  source.updateMatrixWorld(true);
  const expected = geometry.toNonIndexed();
  expected.applyMatrix4(glove.matrixWorld);
  const baked = skinRigidHierarchy(source);
  const mesh = baked.getObjectByName("operator-shell") as THREE.SkinnedMesh;
  const normals = mesh.geometry.getAttribute("normal");
  const original = expected.getAttribute("normal");
  for (let i = 0; i < normals.count; i++) {
    assert.ok(
      new THREE.Vector3()
        .fromBufferAttribute(normals, i)
        .distanceTo(new THREE.Vector3().fromBufferAttribute(original, i)) <
        1e-6,
    );
  }
  expected.dispose();
  mesh.geometry.dispose();
  mesh.skeleton.dispose();
  material.dispose();
});
