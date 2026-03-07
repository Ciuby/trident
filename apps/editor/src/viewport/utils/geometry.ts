import { vec3, type Transform, type Vec3 } from "@web-hammer/shared";
import { BufferGeometry, Float32BufferAttribute, Object3D } from "three";

export function createIndexedGeometry(positions: number[], indices?: number[]) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));

  if (indices) {
    geometry.setIndex(indices);
  }

  return geometry;
}

export function addFaceOffset(origin: Vec3, normal: Vec3, distance: number): Vec3 {
  return vec3(origin.x + normal.x * distance, origin.y + normal.y * distance, origin.z + normal.z * distance);
}

export function objectToTransform(object: Object3D): Transform {
  return {
    position: vec3(object.position.x, object.position.y, object.position.z),
    rotation: vec3(object.rotation.x, object.rotation.y, object.rotation.z),
    scale: vec3(object.scale.x, object.scale.y, object.scale.z)
  };
}
