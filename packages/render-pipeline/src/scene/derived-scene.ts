import type { Entity, GeometryNode, Vec3 } from "@web-hammer/shared";
import { vec3 } from "@web-hammer/shared";
import { createDerivedRenderMesh, type DerivedRenderMesh } from "../meshes/render-mesh";

export type DerivedEntityMarker = {
  entityId: Entity["id"];
  label: string;
  position: Vec3;
  color: string;
};

export type DerivedRenderScene = {
  meshes: DerivedRenderMesh[];
  entityMarkers: DerivedEntityMarker[];
  boundsCenter: Vec3;
};

export function deriveRenderScene(
  nodes: Iterable<GeometryNode>,
  entities: Iterable<Entity> = []
): DerivedRenderScene {
  const meshes = Array.from(nodes, (node) => createDerivedRenderMesh(node));
  const entityMarkers = Array.from(entities, (entity) => ({
    entityId: entity.id,
    label: entity.type,
    position: entity.transform.position,
    color: "#9db2c8"
  }));

  if (meshes.length === 0) {
    return {
      meshes,
      entityMarkers,
      boundsCenter: vec3(0, 0, 0)
    };
  }

  const center = meshes.reduce(
    (accumulator, mesh) => ({
      x: accumulator.x + mesh.position.x,
      y: accumulator.y + mesh.position.y,
      z: accumulator.z + mesh.position.z
    }),
    vec3(0, 0, 0)
  );

  return {
    meshes,
    entityMarkers,
    boundsCenter: vec3(center.x / meshes.length, center.y / meshes.length, center.z / meshes.length)
  };
}
