import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { copyViewmodelHands } from "../src/client/viewmodel-hands";

test("full-body hand baking owns geometry without damaging the FPS hands", () => {
  const viewmodel = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ name: "glove_fabric" });
  const geometry = new THREE.SphereGeometry(0.1, 12, 8);
  const left = new THREE.Group(),
    right = new THREE.Group();
  left.position.set(-0.2, -0.1, -0.3);
  right.rotation.z = -Math.PI / 2;
  for (const group of [left, right]) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.layers.set(1);
    group.add(mesh);
    viewmodel.add(group);
  }
  right.add(new THREE.Mesh(geometry, material)); // Trigger finger is separate.
  const originalPositions = Array.from(geometry.attributes.position.array);
  let sourceDisposed = false;
  geometry.addEventListener("dispose", () => {
    sourceDisposed = true;
  });

  const hands = copyViewmodelHands(viewmodel);
  assert.equal(hands.sourceMeshes, 3);
  assert.ok(hands.left.position.equals(left.position));
  assert.ok(hands.right.quaternion.equals(right.quaternion));
  for (const group of [hands.left, hands.right]) {
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      assert.equal(object.material, material);
      assert.notEqual(object.geometry, geometry);
      assert.equal(object.userData.preserveNormals, true);
      assert.equal(object.layers.mask, 1);
      object.geometry.translate(1, 2, 3);
      object.geometry.dispose();
    });
  }
  assert.equal(sourceDisposed, false);
  assert.deepEqual(
    Array.from(geometry.attributes.position.array),
    originalPositions,
  );
  assert.equal(left.children[0].layers.mask, 2);
  geometry.dispose();
  material.dispose();
});

test("changed viewmodel structure fails explicitly instead of omitting hands", () => {
  assert.throws(
    () => copyViewmodelHands(new THREE.Group()),
    /原版手部结构发生变化/,
  );
});
