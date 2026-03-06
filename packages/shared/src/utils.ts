import type { BrushNode, GeometryNode, MeshNode, ModelNode, Transform, Vec3 } from "./types";

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

export function toTuple(vector: Vec3): [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

export function makeTransform(position = vec3(0, 0, 0)): Transform {
  return {
    position,
    rotation: vec3(0, 0, 0),
    scale: vec3(1, 1, 1)
  };
}

export function isBrushNode(node: GeometryNode): node is BrushNode {
  return node.kind === "brush";
}

export function isMeshNode(node: GeometryNode): node is MeshNode {
  return node.kind === "mesh";
}

export function isModelNode(node: GeometryNode): node is ModelNode {
  return node.kind === "model";
}
