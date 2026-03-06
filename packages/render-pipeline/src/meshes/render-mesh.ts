import type { GeometryNode, NodeID, Vec3 } from "@web-hammer/shared";
import { isBrushNode, isMeshNode, isModelNode } from "@web-hammer/shared";

export type RenderPrimitive =
  | {
      kind: "box";
      size: Vec3;
    }
  | {
      kind: "icosahedron";
      radius: number;
      detail: number;
    }
  | {
      kind: "cylinder";
      radiusTop: number;
      radiusBottom: number;
      height: number;
      radialSegments: number;
    };

export type RenderMaterial = {
  color: string;
  wireframe: boolean;
};

export type DerivedRenderMesh = {
  nodeId: NodeID;
  sourceKind: GeometryNode["kind"];
  dirty: boolean;
  bvhEnabled: boolean;
  label: string;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  primitive: RenderPrimitive;
  material: RenderMaterial;
};

export function createDerivedRenderMesh(node: GeometryNode): DerivedRenderMesh {
  const appearance = getRenderAppearance(node);

  return {
    nodeId: node.id,
    sourceKind: node.kind,
    dirty: false,
    bvhEnabled: true,
    label: `${node.name} (${appearance.primitiveLabel})`,
    position: node.transform.position,
    rotation: node.transform.rotation,
    scale: node.transform.scale,
    primitive: isBrushNode(node)
      ? {
          kind: "box",
          size: node.data.previewSize
        }
      : isMeshNode(node)
        ? {
            kind: "icosahedron",
            radius: 1.25,
            detail: 0
          }
        : {
            kind: "cylinder",
            radiusTop: 0.65,
            radiusBottom: 0.65,
            height: 2.2,
            radialSegments: 12
          },
    material: {
      color: appearance.color,
      wireframe: appearance.wireframe
    }
  };
}

function getRenderAppearance(node: GeometryNode): {
  color: string;
  wireframe: boolean;
  primitiveLabel: string;
} {
  if (isBrushNode(node)) {
    return {
      color: "#f69036",
      wireframe: false,
      primitiveLabel: "box"
    };
  }

  if (isMeshNode(node)) {
    return {
      color: "#6ed5c0",
      wireframe: true,
      primitiveLabel: "poly"
    };
  }

  if (isModelNode(node)) {
    return {
      color: "#7f8ea3",
      wireframe: false,
      primitiveLabel: "model"
    };
  }

  return {
    color: "#ffffff",
    wireframe: false,
    primitiveLabel: "mesh"
  };
}
