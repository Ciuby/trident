import type { Asset, AssetID, Entity, GeometryNode, LightNodeData, Material, MaterialID, NodeID, Transform, Vec3 } from "@web-hammer/shared";
import { isLightNode, vec3 } from "@web-hammer/shared";
import { createDerivedRenderMesh, type DerivedRenderMesh } from "../meshes/render-mesh";

export type DerivedEntityMarker = {
  entityId: Entity["id"];
  entityType: Entity["type"];
  label: string;
  position: Vec3;
  scale: Transform["scale"];
  rotation: Vec3;
  color: string;
};

export type DerivedLight = {
  color: string;
  data: LightNodeData;
  nodeId: string;
  position: Vec3;
  rotation: Vec3;
};

export type DerivedRenderScene = {
  lights: DerivedLight[];
  meshes: DerivedRenderMesh[];
  entityMarkers: DerivedEntityMarker[];
  boundsCenter: Vec3;
};

type CachedDerivedRenderMeshEntry = {
  mesh: DerivedRenderMesh;
  sourceKind: GeometryNode["kind"];
  name: string;
  transform: GeometryNode["transform"];
  position: GeometryNode["transform"]["position"];
  rotation: GeometryNode["transform"]["rotation"];
  scale: GeometryNode["transform"]["scale"];
  pivot?: GeometryNode["transform"]["pivot"];
  data: GeometryNode["data"];
  faces?: unknown;
  halfEdges?: unknown;
  physics?: unknown;
  planes?: unknown;
  previewSize?: unknown;
  vertices?: unknown;
};

export type DerivedRenderSceneCache = {
  assetRefs: Map<AssetID, Asset>;
  materialRefs: Map<MaterialID, Material>;
  meshEntries: Map<NodeID, CachedDerivedRenderMeshEntry>;
};

export function createDerivedRenderSceneCache(): DerivedRenderSceneCache {
  return {
    assetRefs: new Map(),
    materialRefs: new Map(),
    meshEntries: new Map()
  };
}

export function deriveRenderScene(
  nodes: Iterable<GeometryNode>,
  entities: Iterable<Entity> = [],
  materials: Iterable<Material> = [],
  assets: Iterable<Asset> = []
): DerivedRenderScene {
  return deriveRenderSceneCached(nodes, entities, materials, assets, createDerivedRenderSceneCache());
}

export function deriveRenderSceneCached(
  nodes: Iterable<GeometryNode>,
  entities: Iterable<Entity> = [],
  materials: Iterable<Material> = [],
  assets: Iterable<Asset> = [],
  cache: DerivedRenderSceneCache
): DerivedRenderScene {
  const materialList = Array.from(materials);
  const assetList = Array.from(assets);
  const sourceNodes = Array.from(nodes);
  const materialsById = new Map(materialList.map((material) => [material.id, material] as const));
  const assetsById = new Map(assetList.map((asset) => [asset.id, asset] as const));
  const materialsChanged = haveReferencedValuesChanged(materialList, cache.materialRefs);
  const assetsChanged = haveReferencedValuesChanged(assetList, cache.assetRefs);
  const shouldRebuildAllMeshes = materialsChanged || assetsChanged;
  const meshes: DerivedRenderMesh[] = [];
  const lights: DerivedLight[] = [];
  const activeMeshIds = new Set<NodeID>();

  sourceNodes.forEach((node) => {
    if (isLightNode(node)) {
      lights.push({
        color: node.data.color,
        data: node.data,
        nodeId: node.id,
        position: node.transform.position,
        rotation: node.transform.rotation
      });
      return;
    }

    activeMeshIds.add(node.id);

    const cached = cache.meshEntries.get(node.id);
    const mesh =
      shouldRebuildAllMeshes || !cached || isCachedMeshEntryStale(node, cached)
        ? createCachedMeshEntry(node, materialsById, assetsById)
        : cached;

    cache.meshEntries.set(node.id, mesh);
    meshes.push(mesh.mesh);
  });

  Array.from(cache.meshEntries.keys()).forEach((nodeId) => {
    if (!activeMeshIds.has(nodeId)) {
      cache.meshEntries.delete(nodeId);
    }
  });

  replaceReferenceMap(cache.materialRefs, materialList);
  replaceReferenceMap(cache.assetRefs, assetList);

  const entityMarkers = Array.from(entities, (entity) => ({
    entityId: entity.id,
    entityType: entity.type,
    label: entity.name,
    position: entity.transform.position,
    scale: entity.transform.scale,
    rotation: entity.transform.rotation,
    color:
      entity.type === "player-spawn"
        ? "#7dd3fc"
        : entity.type === "npc-spawn"
          ? "#fbbf24"
          : "#c084fc"
  }));

  if (meshes.length === 0) {
    return {
      lights,
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
    lights,
    meshes,
    entityMarkers,
    boundsCenter: vec3(center.x / meshes.length, center.y / meshes.length, center.z / meshes.length)
  };
}

function createCachedMeshEntry(
  node: Exclude<GeometryNode, { kind: "light" }>,
  materialsById: Map<MaterialID, Material>,
  assetsById: Map<AssetID, Asset>
): CachedDerivedRenderMeshEntry {
  return {
    mesh: createDerivedRenderMesh(node, materialsById, assetsById),
    sourceKind: node.kind,
    name: node.name,
    transform: node.transform,
    position: node.transform.position,
    rotation: node.transform.rotation,
    scale: node.transform.scale,
    pivot: node.transform.pivot,
    data: node.data,
    faces: "faces" in node.data ? node.data.faces : undefined,
    halfEdges: "halfEdges" in node.data ? node.data.halfEdges : undefined,
    physics: "physics" in node.data ? node.data.physics : undefined,
    planes: "planes" in node.data ? node.data.planes : undefined,
    previewSize: "previewSize" in node.data ? node.data.previewSize : undefined,
    vertices: "vertices" in node.data ? node.data.vertices : undefined
  };
}

function isCachedMeshEntryStale(
  node: Exclude<GeometryNode, { kind: "light" }>,
  cached: CachedDerivedRenderMeshEntry
) {
  return (
    cached.sourceKind !== node.kind ||
    cached.name !== node.name ||
    cached.transform !== node.transform ||
    cached.position !== node.transform.position ||
    cached.rotation !== node.transform.rotation ||
    cached.scale !== node.transform.scale ||
    cached.pivot !== node.transform.pivot ||
    cached.data !== node.data ||
    cached.faces !== ("faces" in node.data ? node.data.faces : undefined) ||
    cached.halfEdges !== ("halfEdges" in node.data ? node.data.halfEdges : undefined) ||
    cached.physics !== ("physics" in node.data ? node.data.physics : undefined) ||
    cached.planes !== ("planes" in node.data ? node.data.planes : undefined) ||
    cached.previewSize !== ("previewSize" in node.data ? node.data.previewSize : undefined) ||
    cached.vertices !== ("vertices" in node.data ? node.data.vertices : undefined) ||
    hasTransformValuesChanged(node.transform, cached)
  );
}

function hasTransformValuesChanged(
  transform: GeometryNode["transform"],
  cached: Pick<CachedDerivedRenderMeshEntry, "pivot" | "position" | "rotation" | "scale">
) {
  return (
    transform.position.x !== cached.position.x ||
    transform.position.y !== cached.position.y ||
    transform.position.z !== cached.position.z ||
    transform.rotation.x !== cached.rotation.x ||
    transform.rotation.y !== cached.rotation.y ||
    transform.rotation.z !== cached.rotation.z ||
    transform.scale.x !== cached.scale.x ||
    transform.scale.y !== cached.scale.y ||
    transform.scale.z !== cached.scale.z ||
    (transform.pivot?.x ?? 0) !== (cached.pivot?.x ?? 0) ||
    (transform.pivot?.y ?? 0) !== (cached.pivot?.y ?? 0) ||
    (transform.pivot?.z ?? 0) !== (cached.pivot?.z ?? 0) ||
    Boolean(transform.pivot) !== Boolean(cached.pivot)
  );
}

function haveReferencedValuesChanged<T extends { id: string }>(
  nextValues: T[],
  previousRefs: Map<string, T>
) {
  if (nextValues.length !== previousRefs.size) {
    return true;
  }

  return nextValues.some((value) => previousRefs.get(value.id) !== value);
}

function replaceReferenceMap<T extends { id: string }>(target: Map<string, T>, values: T[]) {
  target.clear();

  values.forEach((value) => {
    target.set(value.id, value);
  });
}
