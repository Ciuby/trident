import type { Brush, Face, Plane, Vec3 } from "@web-hammer/shared";

export type BrushRebuildResult = {
  faces: Face[];
  valid: boolean;
};

export function reconstructBrushFaces(brush: Brush): BrushRebuildResult {
  return {
    faces: brush.faces,
    valid: brush.planes.length >= 4
  };
}

export function classifyPointAgainstPlane(point: Vec3, plane: Plane, epsilon = 0.0001): "inside" | "outside" {
  const signedDistance =
    plane.normal.x * point.x + plane.normal.y * point.y + plane.normal.z * point.z + plane.distance;

  return signedDistance > epsilon ? "outside" : "inside";
}
