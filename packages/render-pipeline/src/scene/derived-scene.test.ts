import { describe, expect, test } from "bun:test";
import { deriveRenderScene } from "./derived-scene";
import { makeTransform, vec3, type Entity, type GeometryNode, type Material } from "@web-hammer/shared";

describe("deriveRenderScene", () => {
  test("applies parent transforms to child meshes, groups, and entities", () => {
    const material: Material = {
      color: "#ffffff",
      id: "material:test",
      name: "Test"
    };
    const nodes: GeometryNode[] = [
      {
        data: {},
        id: "node:group",
        kind: "group",
        name: "Group",
        transform: {
          position: vec3(4, 0, 2),
          rotation: vec3(0, Math.PI / 2, 0),
          scale: vec3(2, 2, 2)
        }
      },
      {
        data: {
          materialId: material.id,
          role: "prop",
          shape: "cube",
          size: vec3(1, 1, 1)
        },
        id: "node:cube",
        kind: "primitive",
        name: "Cube",
        parentId: "node:group",
        transform: makeTransform(vec3(1, 0, 0))
      }
    ];
    const entities: Entity[] = [
      {
        id: "entity:spawn",
        name: "Spawn",
        parentId: "node:group",
        properties: {},
        transform: makeTransform(vec3(0, 0, 3)),
        type: "player-spawn"
      }
    ];

    const scene = deriveRenderScene(nodes, entities, [material]);
    const mesh = scene.meshes[0]!;
    const group = scene.groups[0]!;
    const entity = scene.entityMarkers[0]!;

    expect(group.position.x).toBeCloseTo(4, 5);
    expect(group.position.z).toBeCloseTo(2, 5);
    expect(mesh.position.x).toBeCloseTo(4, 5);
    expect(mesh.position.z).toBeCloseTo(0, 5);
    expect(entity.position.x).toBeCloseTo(10, 5);
    expect(entity.position.z).toBeCloseTo(2, 5);
    expect(scene.nodeTransforms.get("node:cube")?.position.z).toBeCloseTo(0, 5);
  });
});
