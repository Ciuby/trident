import type {
  Asset,
  BrushNode,
  Entity,
  GroupNode,
  Layer,
  LightNode,
  MaterialRenderSide,
  MeshNode,
  PrimitiveNode,
  ModelNode,
  SceneSettings
} from "@web-hammer/shared";

export type WebHammerExportMaterial = {
  baseColorTexture?: string;
  color: string;
  id: string;
  metallicFactor: number;
  metallicRoughnessTexture?: string;
  name: string;
  normalTexture?: string;
  roughnessFactor: number;
  side?: MaterialRenderSide;
};

export type WebHammerExportPrimitive = {
  indices: number[];
  material: WebHammerExportMaterial;
  normals: number[];
  positions: number[];
  uvs: number[];
};

export type WebHammerExportGeometry = {
  primitives: WebHammerExportPrimitive[];
};

export type WebHammerEngineGeometryNode =
  | (BrushNode & { geometry: WebHammerExportGeometry })
  | (MeshNode & { geometry: WebHammerExportGeometry })
  | (PrimitiveNode & { geometry: WebHammerExportGeometry });

export type WebHammerEngineNode = GroupNode | WebHammerEngineGeometryNode | ModelNode | LightNode;

export type WebHammerEngineSceneMetadata = {
  exportedAt: string;
  format: "web-hammer-engine";
  version: number;
};

export type WebHammerEngineScene = {
  assets: Asset[];
  entities: Entity[];
  layers: Layer[];
  materials: WebHammerExportMaterial[];
  metadata: WebHammerEngineSceneMetadata;
  nodes: WebHammerEngineNode[];
  settings: SceneSettings;
};

export type WebHammerEngineBundleFile = {
  bytes: Uint8Array;
  mimeType: string;
  path: string;
};

export type WebHammerEngineBundle = {
  files: WebHammerEngineBundleFile[];
  manifest: WebHammerEngineScene;
};
