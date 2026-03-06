import {
  reconstructBrushFaces,
  triangulateEditableMesh
} from "@web-hammer/geometry-kernel";
import type { SceneDocumentSnapshot } from "@web-hammer/editor-core";
import { isBrushNode, isMeshNode, isModelNode, vec3 } from "@web-hammer/shared";

export type WorkerExportKind = "whmap-load" | "whmap-save" | "engine-export" | "gltf-export";

export type WorkerRequest =
  | {
      id: string;
      kind: "whmap-save";
      snapshot: SceneDocumentSnapshot;
    }
  | {
      id: string;
      kind: "whmap-load";
      text: string;
    }
  | {
      id: string;
      kind: "engine-export" | "gltf-export";
      snapshot: SceneDocumentSnapshot;
    };

export type WorkerResponse =
  | {
      id: string;
      kind: WorkerExportKind;
      ok: true;
      payload: string | SceneDocumentSnapshot;
    }
  | {
      id: string;
      kind: WorkerExportKind;
      ok: false;
      error: string;
    };

export function executeWorkerRequest(request: WorkerRequest): WorkerResponse {
  try {
    if (request.kind === "whmap-save") {
      return {
        id: request.id,
        kind: request.kind,
        ok: true,
        payload: serializeWhmap(request.snapshot)
      };
    }

    if (request.kind === "whmap-load") {
      return {
        id: request.id,
        kind: request.kind,
        ok: true,
        payload: parseWhmap(request.text)
      };
    }

    if (request.kind === "engine-export") {
      return {
        id: request.id,
        kind: request.kind,
        ok: true,
        payload: serializeEngineScene(request.snapshot)
      };
    }

    return {
      id: request.id,
      kind: request.kind,
      ok: true,
      payload: serializeGltfScene(request.snapshot)
    };
  } catch (error) {
    return {
      id: request.id,
      kind: request.kind,
      ok: false,
      error: error instanceof Error ? error.message : "Unknown worker error."
    };
  }
}

export function serializeWhmap(snapshot: SceneDocumentSnapshot): string {
  return JSON.stringify(
    {
      format: "whmap",
      version: 1,
      scene: snapshot
    },
    null,
    2
  );
}

export function parseWhmap(text: string): SceneDocumentSnapshot {
  const parsed = JSON.parse(text) as {
    format?: string;
    scene?: SceneDocumentSnapshot;
    version?: number;
  };

  if (parsed.format !== "whmap" || !parsed.scene) {
    throw new Error("Invalid .whmap file.");
  }

  return parsed.scene;
}

export function serializeEngineScene(snapshot: SceneDocumentSnapshot): string {
  return JSON.stringify(
    {
      assets: snapshot.assets,
      entities: snapshot.entities,
      layers: snapshot.layers,
      materials: snapshot.materials,
      metadata: {
        exportedAt: new Date().toISOString(),
        format: "web-hammer-engine",
        version: 1
      },
      nodes: snapshot.nodes.map((node) => ({
        id: node.id,
        kind: node.kind,
        name: node.name,
        transform: node.transform
      }))
    },
    null,
    2
  );
}

export function serializeGltfScene(snapshot: SceneDocumentSnapshot): string {
  const meshes: Array<{
    color: string;
    indices: number[];
    positions: number[];
    name: string;
    translation: [number, number, number];
    scale: [number, number, number];
  }> = [];
  const materialsById = new Map(snapshot.materials.map((material) => [material.id, material]));
  const assetsById = new Map(snapshot.assets.map((asset) => [asset.id, asset]));

  snapshot.nodes.forEach((node) => {
    if (isBrushNode(node)) {
      const rebuilt = reconstructBrushFaces(node.data);

      if (!rebuilt.valid || rebuilt.faces.length === 0) {
        return;
      }

      const positions: number[] = [];
      const indices: number[] = [];
      let offset = 0;
      rebuilt.faces.forEach((face) => {
        face.vertices.forEach((vertex) => {
          positions.push(vertex.position.x, vertex.position.y, vertex.position.z);
        });
        face.triangleIndices.forEach((index) => {
          indices.push(index + offset);
        });
        offset += face.vertices.length;
      });

      const materialColor = rebuilt.faces[0]?.materialId
        ? materialsById.get(rebuilt.faces[0].materialId)?.color ?? "#f69036"
        : "#f69036";

      meshes.push({
        color: materialColor,
        indices,
        name: node.name,
        positions,
        scale: [node.transform.scale.x, node.transform.scale.y, node.transform.scale.z],
        translation: [node.transform.position.x, node.transform.position.y, node.transform.position.z]
      });
      return;
    }

    if (isMeshNode(node)) {
      const triangulated = triangulateEditableMesh(node.data);

      if (!triangulated.valid) {
        return;
      }

      meshes.push({
        color: "#6ed5c0",
        indices: triangulated.indices,
        name: node.name,
        positions: triangulated.positions,
        scale: [node.transform.scale.x, node.transform.scale.y, node.transform.scale.z],
        translation: [node.transform.position.x, node.transform.position.y, node.transform.position.z]
      });
      return;
    }

    if (isModelNode(node)) {
      const previewColor = assetsById.get(node.data.assetId)?.metadata.previewColor;
      const primitive = createCylinderPrimitive();
      meshes.push({
        color: typeof previewColor === "string" ? previewColor : "#7f8ea3",
        indices: primitive.indices,
        name: node.name,
        positions: primitive.positions,
        scale: [node.transform.scale.x, node.transform.scale.y, node.transform.scale.z],
        translation: [node.transform.position.x, node.transform.position.y, node.transform.position.z]
      });
    }
  });

  return buildGltfDocument(meshes);
}

function buildGltfDocument(
  meshes: Array<{
    color: string;
    indices: number[];
    positions: number[];
    name: string;
    translation: [number, number, number];
    scale: [number, number, number];
  }>
): string {
  const nodes: Array<Record<string, unknown>> = [];
  const gltfMeshes: Array<Record<string, unknown>> = [];
  const materials: Array<Record<string, unknown>> = [];
  const accessors: Array<Record<string, unknown>> = [];
  const bufferViews: Array<Record<string, unknown>> = [];
  const chunks: Uint8Array[] = [];

  const pushBuffer = (bytes: Uint8Array, target?: number) => {
    const padding = (4 - (bytes.byteLength % 4)) % 4;
    const padded = new Uint8Array(bytes.byteLength + padding);
    padded.set(bytes);
    const byteOffset = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    chunks.push(padded);
    bufferViews.push({
      buffer: 0,
      byteLength: bytes.byteLength,
      byteOffset,
      ...(target ? { target } : {})
    });
    return bufferViews.length - 1;
  };

  meshes.forEach((mesh, meshIndex) => {
    const positions = new Float32Array(mesh.positions);
    const indices = new Uint32Array(mesh.indices);
    const positionView = pushBuffer(new Uint8Array(positions.buffer.slice(0)), 34962);
    const indexView = pushBuffer(new Uint8Array(indices.buffer.slice(0)), 34963);

    const bounds = computePositionBounds(mesh.positions);
    accessors.push({
      bufferView: positionView,
      componentType: 5126,
      count: positions.length / 3,
      max: bounds.max,
      min: bounds.min,
      type: "VEC3"
    });
    const positionAccessor = accessors.length - 1;

    accessors.push({
      bufferView: indexView,
      componentType: 5125,
      count: indices.length,
      type: "SCALAR"
    });
    const indexAccessor = accessors.length - 1;

    materials.push({
      name: `${mesh.name} Material`,
      pbrMetallicRoughness: {
        baseColorFactor: hexToRgba(mesh.color),
        metallicFactor: 0.1,
        roughnessFactor: 0.8
      }
    });

    gltfMeshes.push({
      name: mesh.name,
      primitives: [
        {
          attributes: { POSITION: positionAccessor },
          indices: indexAccessor,
          material: materials.length - 1
        }
      ]
    });

    nodes.push({
      mesh: meshIndex,
      name: mesh.name,
      scale: mesh.scale,
      translation: mesh.translation
    });
  });

  const totalByteLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const merged = new Uint8Array(totalByteLength);
  let cursor = 0;
  chunks.forEach((chunk) => {
    merged.set(chunk, cursor);
    cursor += chunk.byteLength;
  });

  const gltf = {
    accessors,
    asset: {
      generator: "web-hammer",
      version: "2.0"
    },
    bufferViews,
    buffers: [
      {
        byteLength: merged.byteLength,
        uri: `data:application/octet-stream;base64,${toBase64(merged)}`
      }
    ],
    materials,
    meshes: gltfMeshes,
    nodes,
    scene: 0,
    scenes: [
      {
        nodes: nodes.map((_, index) => index)
      }
    ]
  };

  return JSON.stringify(gltf, null, 2);
}

function createCylinderPrimitive() {
  const radius = 0.65;
  const halfHeight = 1.1;
  const segments = 12;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    positions.push(x, -halfHeight, z, x, halfHeight, z);
  }

  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    const bottom = index * 2;
    const top = bottom + 1;
    const nextBottom = next * 2;
    const nextTop = nextBottom + 1;

    indices.push(bottom, nextBottom, top, top, nextBottom, nextTop);
  }

  return { indices, positions };
}

function computePositionBounds(positions: number[]) {
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];

  for (let index = 0; index < positions.length; index += 3) {
    min[0] = Math.min(min[0], positions[index]);
    min[1] = Math.min(min[1], positions[index + 1]);
    min[2] = Math.min(min[2], positions[index + 2]);
    max[0] = Math.max(max[0], positions[index]);
    max[1] = Math.max(max[1], positions[index + 1]);
    max[2] = Math.max(max[2], positions[index + 2]);
  }

  return { max, min };
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function hexToRgba(hex: string): [number, number, number, number] {
  const normalized = hex.replace("#", "");
  const parsed = Number.parseInt(normalized, 16);
  return [((parsed >> 16) & 255) / 255, ((parsed >> 8) & 255) / 255, (parsed & 255) / 255, 1];
}
