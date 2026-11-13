import * as THREE from "three";

export interface SharedHands {
  left: THREE.Group;
  right: THREE.Group;
  sourceMeshes: number;
}
/** Reuse the actual procedural glove/finger/cuff/sleeve meshes from the FPS rig.
 * Copy owned geometry before the full-body skin baker consumes it. */
export function copyViewmodelHands(viewmodel: THREE.Group): SharedHands {
  const groups = viewmodel.children.filter(
    (object): object is THREE.Group =>
      object instanceof THREE.Group &&
      object.children.some(
        (child) =>
          child instanceof THREE.Mesh &&
          !Array.isArray(child.material) &&
          child.material.name === "glove_fabric",
      ),
  );
  if (groups.length !== 2)
    throw new Error("原版手部结构发生变化：需要左右两组 glove_fabric 网格");
  const rightSource = groups.find((g) => g.children.length > 1) ?? groups[0],
    leftSource = groups.find((g) => g !== rightSource)!;
  let sourceMeshes = 0;
  const copy = (source: THREE.Group) => {
    const result = source.clone(true);
    result.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry = object.geometry.clone();
        object.userData.preserveNormals = true;
        object.layers.set(0);
        object.castShadow = object.receiveShadow = true;
        sourceMeshes++;
      }
    });
    return result;
  };
  const right = copy(rightSource),
    left = copy(leftSource);
  right.name = "right-hand";
  left.name = "left-hand";
  return { left, right, sourceMeshes };
}
