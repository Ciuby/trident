import type { Asset, MaterialRenderSide, PropPhysics, SceneSkyboxSettings, Transform, Vec3 } from "@web-hammer/shared";
import { resolveSceneGraph } from "@web-hammer/shared";
import {
  AmbientLight,
  BackSide,
  Box3,
  BoxGeometry,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  EquirectangularReflectionMapping,
  Fog,
  Float32BufferAttribute,
  FrontSide,
  Group,
  HemisphereLight,
  LOD,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  SRGBColorSpace,
  Scene,
  SpotLight,
  Texture,
  TextureLoader,
  RepeatWrapping,
  Vector3
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import type {
  WebHammerEngineBundle,
  WebHammerEngineModelNode,
  WebHammerEngineGeometryNode,
  WebHammerEngineNode,
  WebHammerEngineScene,
  WebHammerExportGeometry,
  WebHammerExportGeometryLod,
  WebHammerExportMaterial
} from "./types";

type TextureSlot = "baseColorTexture" | "metallicRoughnessTexture" | "normalTexture";

export type WebHammerAssetResolverContext =
  | {
      kind: "model";
      node: Extract<WebHammerEngineNode, { kind: "model" }>;
      asset?: Asset;
      path: string;
      format: "gltf" | "obj";
    }
  | {
      kind: "texture";
      material: WebHammerExportMaterial;
      path: string;
      slot: TextureSlot;
    }
  | {
      kind: "skybox";
      path: string;
      skybox: SceneSkyboxSettings;
    };

export type WebHammerSceneLoaderOptions = {
  applyToScene?: Scene;
  castShadow?: boolean;
  lod?: WebHammerSceneLodOptions;
  receiveShadow?: boolean;
  resolveAssetUrl?: (context: WebHammerAssetResolverContext) => Promise<string> | string;
};

export type WebHammerSceneLodOptions = {
  lowDistance: number;
  midDistance: number;
};

export type WebHammerLoadedScene = {
  entities: WebHammerEngineScene["entities"];
  lights: Object3D[];
  nodes: Map<string, Object3D>;
  physicsNodes: Array<{
    nodeId: string;
    object: Object3D;
    physics: PropPhysics;
  }>;
  root: Group;
  scene: WebHammerEngineScene;
};

const textureLoader = new TextureLoader();
const gltfLoader = new GLTFLoader();
const hdrLoader = new HDRLoader();
const mtlLoader = new MTLLoader();

export function isWebHammerEngineScene(value: unknown): value is WebHammerEngineScene {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<WebHammerEngineScene>;
  return (
    candidate.metadata?.format === "web-hammer-engine" &&
    Array.isArray(candidate.nodes) &&
    Array.isArray(candidate.assets) &&
    Array.isArray(candidate.materials) &&
    typeof candidate.settings === "object"
  );
}

export function isWebHammerEngineBundle(value: unknown): value is WebHammerEngineBundle {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<WebHammerEngineBundle>;
  return Array.isArray(candidate.files) && isWebHammerEngineScene(candidate.manifest);
}

export function parseWebHammerEngineScene(text: string): WebHammerEngineScene {
  const parsed = JSON.parse(text) as unknown;

  if (!isWebHammerEngineScene(parsed)) {
    throw new Error("Invalid Web Hammer engine scene JSON.");
  }

  return parsed;
}

export async function fetchWebHammerEngineScene(url: string, init?: RequestInit): Promise<WebHammerEngineScene> {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`Failed to fetch engine scene: ${response.status} ${response.statusText}`);
  }

  return parseWebHammerEngineScene(await response.text());
}

export async function loadWebHammerEngineScene(
  input: WebHammerEngineScene | string,
  options: WebHammerSceneLoaderOptions = {}
): Promise<WebHammerLoadedScene> {
  const engineScene = typeof input === "string" ? parseWebHammerEngineScene(input) : input;
  const root = new Group();
  const assetsById = new Map(engineScene.assets.map((asset) => [asset.id, asset]));
  const nodes = new Map<string, Object3D>();
  const lights: Object3D[] = [];
  const physicsNodes: WebHammerLoadedScene["physicsNodes"] = [];
  const materialCache = new Map<string, MeshStandardMaterial>();
  const textureCache = new Map<string, Promise<Texture>>();
  const nodesById = new Map(engineScene.nodes.map((node) => [node.id, node]));
  const createdObjects = await Promise.all(
    engineScene.nodes.map(async (node) => [node.id, await createObjectForNode(node, assetsById, materialCache, textureCache, options)] as const)
  );
  const attachedNodeIds = new Set<string>();
  const attachStack = new Set<string>();

  root.name = "Web Hammer Scene";
  root.userData.webHammer = {
    metadata: engineScene.metadata,
    settings: engineScene.settings
  };

  if (options.applyToScene) {
    await applyWebHammerWorldSettings(options.applyToScene, engineScene, options);
  }

  const worldAmbient = createWorldAmbientLight(engineScene);

  if (worldAmbient) {
    root.add(worldAmbient);
    lights.push(worldAmbient);
  }

  createdObjects.forEach(([nodeId, object]) => {
    nodes.set(nodeId, object);
  });

  const attachNode = (nodeId: string) => {
    if (attachedNodeIds.has(nodeId)) {
      return;
    }

    const node = nodesById.get(nodeId);
    const object = nodes.get(nodeId);

    if (!node || !object) {
      return;
    }

    if (attachStack.has(nodeId)) {
      root.add(object);
      attachedNodeIds.add(nodeId);
      return;
    }

    attachStack.add(nodeId);

    const parentObject =
      node.parentId && node.parentId !== node.id
        ? nodes.get(node.parentId)
        : undefined;

    if (parentObject && !attachStack.has(node.parentId!)) {
      attachNode(node.parentId!);
      parentObject.add(object);
    } else {
      root.add(object);
    }

    attachStack.delete(nodeId);
    attachedNodeIds.add(nodeId);
  };

  for (const node of engineScene.nodes) {
    attachNode(node.id);
  }

  for (const node of engineScene.nodes) {
    const object = nodes.get(node.id);

    if (!object) {
      continue;
    }

    const light = findPrimaryLight(object);

    if (light) {
      lights.push(light);
    }

    const physics = extractPhysics(node);

    if (physics?.enabled) {
      physicsNodes.push({
        nodeId: node.id,
        object,
        physics
      });
    }
  }

  const sceneGraph = resolveSceneGraph(engineScene.nodes, engineScene.entities);

  return {
    entities: engineScene.entities.map((entity) => ({
      ...entity,
      transform: sceneGraph.entityWorldTransforms.get(entity.id) ?? entity.transform
    })),
    lights,
    nodes,
    physicsNodes,
    root,
    scene: engineScene
  };
}

export async function loadWebHammerEngineSceneFromUrl(
  url: string,
  options: WebHammerSceneLoaderOptions = {}
): Promise<WebHammerLoadedScene> {
  const scene = await fetchWebHammerEngineScene(url);
  return loadWebHammerEngineScene(scene, options);
}

type AppliedWorldSettingsState = {
  requestId: number;
  skyboxTexture?: Texture;
};

const APPLIED_WORLD_SETTINGS_KEY = "__webHammerWorldSettings";

export async function applyWebHammerWorldSettings(
  target: Scene,
  engineScene: Pick<WebHammerEngineScene, "settings">,
  options: Pick<WebHammerSceneLoaderOptions, "resolveAssetUrl"> = {}
) {
  const state = getAppliedWorldSettingsState(target);
  state.requestId += 1;
  disposeAppliedSkybox(target, state);

  const { fogColor, fogFar, fogNear } = engineScene.settings.world;
  target.fog = fogFar > fogNear ? new Fog(new Color(fogColor), fogNear, fogFar) : null;

  const skybox = engineScene.settings.world.skybox;

  if (!skybox.enabled || !skybox.source) {
    return;
  }

  const requestId = state.requestId;

  try {
    const resolvedPath = options.resolveAssetUrl
      ? await options.resolveAssetUrl({
          kind: "skybox",
          path: skybox.source,
          skybox
        })
      : skybox.source;
    const texture = await loadSkyboxTexture(resolvedPath, skybox);

    if (getAppliedWorldSettingsState(target).requestId !== requestId) {
      texture.dispose();
      return;
    }

    target.background = texture;
    target.backgroundBlurriness = skybox.blur;
    target.backgroundIntensity = skybox.intensity;
    target.environment = skybox.affectsLighting ? texture : null;
    target.environmentIntensity = skybox.affectsLighting ? skybox.lightingIntensity : 1;
    state.skyboxTexture = texture;
  } catch {
    if (getAppliedWorldSettingsState(target).requestId === requestId) {
      disposeAppliedSkybox(target, state);
    }
  }
}

export function clearWebHammerWorldSettings(target: Scene) {
  const state = getAppliedWorldSettingsState(target);
  state.requestId += 1;
  disposeAppliedSkybox(target, state);
  target.fog = null;
}

function createWorldAmbientLight(engineScene: WebHammerEngineScene) {
  const { ambientColor, ambientIntensity } = engineScene.settings.world;

  if (ambientIntensity <= 0) {
    return undefined;
  }

  const light = new AmbientLight(ambientColor, ambientIntensity);
  light.name = "World Ambient";
  light.userData.webHammer = {
    source: "world-settings"
  };

  return light;
}

function getAppliedWorldSettingsState(target: Scene): AppliedWorldSettingsState {
  const userData = target.userData as Record<string, AppliedWorldSettingsState | undefined>;
  const existing = userData[APPLIED_WORLD_SETTINGS_KEY];

  if (existing) {
    return existing;
  }

  const created: AppliedWorldSettingsState = {
    requestId: 0
  };
  userData[APPLIED_WORLD_SETTINGS_KEY] = created;
  return created;
}

function disposeAppliedSkybox(target: Scene, state: AppliedWorldSettingsState) {
  if (state.skyboxTexture) {
    if (target.background === state.skyboxTexture) {
      target.background = null;
    }

    if (target.environment === state.skyboxTexture) {
      target.environment = null;
    }

    state.skyboxTexture.dispose();
    state.skyboxTexture = undefined;
  }

  target.backgroundBlurriness = 0;
  target.backgroundIntensity = 1;
  target.environmentIntensity = 1;
}

async function loadSkyboxTexture(path: string, skybox: SceneSkyboxSettings) {
  const texture = skybox.format === "hdr"
    ? await hdrLoader.loadAsync(path)
    : await textureLoader.loadAsync(path);

  texture.mapping = EquirectangularReflectionMapping;

  if (skybox.format === "image") {
    texture.colorSpace = SRGBColorSpace;
  }

  return texture;
}

async function createObjectForNode(
  node: WebHammerEngineNode,
  assetsById: Map<string, Asset>,
  materialCache: Map<string, MeshStandardMaterial>,
  textureCache: Map<string, Promise<Texture>>,
  options: WebHammerSceneLoaderOptions
) {
  const anchor = new Group();
  const content = new Group();
  const pivot = node.transform.pivot;

  anchor.name = node.name;
  applyTransform(anchor, node.transform);
  anchor.userData.webHammer = {
    data: node.data,
    hooks: node.hooks,
    id: node.id,
    kind: node.kind,
    metadata: node.metadata,
    tags: node.tags
  };

  if (pivot) {
    content.position.set(-pivot.x, -pivot.y, -pivot.z);
  }

  anchor.add(content);

  if (node.kind === "light") {
    const light = createThreeLight(node);

    if (light) {
      content.add(light);
    }

    return anchor;
  }

  if (node.kind === "model") {
    const modelObject = await createModelObject(node, assetsById.get(node.data.assetId), options);
    const lodObject = await createLodObjectForModelNode(node, modelObject, materialCache, textureCache, options);
    content.add(lodObject ?? modelObject);
    return anchor;
  }

  if (node.kind === "group") {
    return anchor;
  }

  const lodObject = await createLodObjectForGeometryNode(node, materialCache, textureCache, options);

  if (lodObject) {
    content.add(lodObject);
  }

  return anchor;
}

async function createLodObjectForGeometryNode(
  node: WebHammerEngineGeometryNode,
  materialCache: Map<string, MeshStandardMaterial>,
  textureCache: Map<string, Promise<Texture>>,
  options: WebHammerSceneLoaderOptions
) {
  const baseGroup = await createGeometryObject(node.geometry, node, materialCache, textureCache, options);
  const lodOptions = resolveSceneLodOptions(options.lod);

  if (!lodOptions || !node.lods?.length) {
    return baseGroup;
  }

  const lod = new LOD();
  lod.name = `${node.name}:LOD`;
  lod.autoUpdate = true;
  lod.addLevel(baseGroup, 0);

  for (const level of node.lods) {
    const levelGroup = await createGeometryObject(level.geometry, node, materialCache, textureCache, options, level);
    const distance = level.level === "mid" ? lodOptions.midDistance : lodOptions.lowDistance;
    lod.addLevel(levelGroup, distance);
  }

  lod.userData.webHammer = {
    levelOrder: ["high", ...(node.lods ?? []).map((level) => level.level)],
    nodeId: node.id
  };
  return lod;
}

async function createLodObjectForModelNode(
  node: WebHammerEngineModelNode,
  baseModel: Object3D,
  materialCache: Map<string, MeshStandardMaterial>,
  textureCache: Map<string, Promise<Texture>>,
  options: WebHammerSceneLoaderOptions
) {
  const lodOptions = resolveSceneLodOptions(options.lod);

  if (!lodOptions || !node.lods?.length) {
    return undefined;
  }

  const lod = new LOD();
  lod.name = `${node.name}:LOD`;
  lod.autoUpdate = true;
  lod.addLevel(baseModel, 0);

  for (const level of node.lods) {
    const levelGroup = await createGeometryObject(level.geometry, node, materialCache, textureCache, options, level);
    const distance = level.level === "mid" ? lodOptions.midDistance : lodOptions.lowDistance;
    lod.addLevel(levelGroup, distance);
  }

  lod.userData.webHammer = {
    levelOrder: ["high", ...(node.lods ?? []).map((level) => level.level)],
    nodeId: node.id
  };
  return lod;
}

async function createGeometryObject(
  geometry: WebHammerExportGeometry,
  node: Pick<WebHammerEngineNode, "id" | "name">,
  materialCache: Map<string, MeshStandardMaterial>,
  textureCache: Map<string, Promise<Texture>>,
  options: WebHammerSceneLoaderOptions,
  lodLevel?: WebHammerExportGeometryLod
) {
  const group = new Group();
  const meshes: Mesh[] = [];

  for (const primitive of geometry.primitives) {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(primitive.positions, 3));
    geometry.setAttribute("normal", new Float32BufferAttribute(primitive.normals, 3));

    if (primitive.uvs.length > 0) {
      geometry.setAttribute("uv", new Float32BufferAttribute(primitive.uvs, 2));
    }

    geometry.setIndex(primitive.indices);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const material = await createThreeMaterial(primitive.material, materialCache, textureCache, options);
    const mesh = new Mesh(geometry, material);

    mesh.castShadow = options.castShadow ?? true;
    mesh.receiveShadow = options.receiveShadow ?? true;
    mesh.name = `${node.name}:${lodLevel?.level ?? "high"}:${primitive.material.name}`;
    mesh.userData.webHammer = {
      lodLevel: lodLevel?.level ?? "high",
      materialId: primitive.material.id,
      nodeId: node.id
    };

    meshes.push(mesh);
  }

  meshes.forEach((mesh) => {
    group.add(mesh);
  });

  return group;
}

function resolveSceneLodOptions(lod?: WebHammerSceneLodOptions): WebHammerSceneLodOptions | undefined {
  if (!lod) {
    return undefined;
  }

  const midDistance = Math.max(0, lod.midDistance);
  const lowDistance = Math.max(midDistance + 0.01, lod.lowDistance);

  return {
    lowDistance,
    midDistance
  };
}

async function createThreeMaterial(
  materialSpec: WebHammerExportMaterial,
  materialCache: Map<string, MeshStandardMaterial>,
  textureCache: Map<string, Promise<Texture>>,
  options: WebHammerSceneLoaderOptions
) {
  const cached = materialCache.get(materialSpec.id);

  if (cached) {
    return cached;
  }

  const material = new MeshStandardMaterial({
    color: materialSpec.color,
    metalness: materialSpec.metallicFactor,
    roughness: materialSpec.roughnessFactor,
    side: resolveMaterialSide(materialSpec.side)
  });

  if (materialSpec.baseColorTexture) {
    const texture = await loadTexture(materialSpec.baseColorTexture, materialSpec, "baseColorTexture", textureCache, options);
    texture.colorSpace = SRGBColorSpace;
    material.map = texture;
  }

  if (materialSpec.normalTexture) {
    material.normalMap = await loadTexture(materialSpec.normalTexture, materialSpec, "normalTexture", textureCache, options);
  }

  if (materialSpec.metallicRoughnessTexture) {
    const ormTexture = await loadTexture(
      materialSpec.metallicRoughnessTexture,
      materialSpec,
      "metallicRoughnessTexture",
      textureCache,
      options
    );
    material.metalnessMap = ormTexture;
    material.roughnessMap = ormTexture;
  }

  material.name = materialSpec.name;
  material.needsUpdate = true;
  materialCache.set(materialSpec.id, material);

  return material;
}

async function loadTexture(
  path: string,
  material: WebHammerExportMaterial,
  slot: TextureSlot,
  textureCache: Map<string, Promise<Texture>>,
  options: WebHammerSceneLoaderOptions
) {
  const resolvedPath = options.resolveAssetUrl
    ? await options.resolveAssetUrl({
        kind: "texture",
        material,
        path,
        slot
      })
    : path;
  const cacheKey = `${slot}:${resolvedPath}`;
  const cached = textureCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const pendingTexture = textureLoader.loadAsync(resolvedPath);
  const configuredTexture = pendingTexture.then((texture) => {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    return texture;
  });
  textureCache.set(
    cacheKey,
    configuredTexture
  );
  return configuredTexture;
}

async function createModelObject(
  node: Extract<WebHammerEngineNode, { kind: "model" }>,
  asset: Asset | undefined,
  options: WebHammerSceneLoaderOptions
) {
  const fallback = createMissingModelFallback(asset);
  const modelPath = asset?.path ?? node.data.path;

  if (!modelPath) {
    return fallback;
  }

  const format = resolveModelFormat(asset?.metadata.modelFormat, modelPath);
  const resolvedPath = options.resolveAssetUrl
    ? await options.resolveAssetUrl({
        asset,
        format,
        kind: "model",
        node,
        path: modelPath
      })
    : modelPath;
  const texturePath = readAssetString(asset, "texturePath");
  const resolvedTexturePath =
    texturePath && options.resolveAssetUrl
      ? await options.resolveAssetUrl({
          kind: "texture",
          material: {
            color: "#ffffff",
            id: `material:model-texture:${node.id}`,
            metallicFactor: 0,
            name: `${node.name} Model Texture`,
            roughnessFactor: 1
          },
          path: texturePath,
          slot: "baseColorTexture"
        })
      : texturePath;

  try {
    if (format === "obj") {
      return await loadObjModel(asset, resolvedPath, resolvedTexturePath);
    }

    return await loadGltfModel(asset, resolvedPath);
  } catch {
    return fallback;
  }
}

async function loadObjModel(asset: Asset | undefined, resolvedPath: string, resolvedTexturePath?: string) {
  const objLoader = new OBJLoader();
  const mtlText = readAssetString(asset, "materialMtlText");

  if (mtlText) {
    const materialCreator = mtlLoader.parse(patchMtlTextureReferences(mtlText, resolvedTexturePath), "");
    materialCreator.preload();
    objLoader.setMaterials(materialCreator);
  }

  const object = await objLoader.loadAsync(resolvedPath);

  if (!mtlText && resolvedTexturePath) {
    const texture = await textureLoader.loadAsync(resolvedTexturePath);
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.colorSpace = SRGBColorSpace;

    object.traverse((child: Object3D) => {
      if (child instanceof Mesh) {
        child.material = new MeshStandardMaterial({
          map: texture,
          metalness: 0.12,
          roughness: 0.76
        });
      }
    });
  }

  centerObject(object, readAssetVec3(asset, "nativeCenter"));
  return object;
}

async function loadGltfModel(asset: Asset | undefined, resolvedPath: string) {
  const gltf = await gltfLoader.loadAsync(resolvedPath);
  const object = gltf.scene;
  centerObject(object, readAssetVec3(asset, "nativeCenter"));
  object.userData.webHammer = {
    ...(object.userData.webHammer ?? {}),
    animations: gltf.animations
  };
  return object;
}

function centerObject(object: Object3D, center: Vec3 | undefined) {
  const resolvedCenter = center ?? computeObjectCenter(object);
  object.position.set(-resolvedCenter.x, -resolvedCenter.y, -resolvedCenter.z);
}

function computeObjectCenter(object: Object3D) {
  const box = new Box3().setFromObject(object);
  const center = box.getCenter(new Vector3());

  return {
    x: center.x,
    y: center.y,
    z: center.z
  };
}

function createMissingModelFallback(asset: Asset | undefined) {
  const previewColor = readAssetString(asset, "previewColor") ?? "#7f8ea3";
  const size = readAssetVec3(asset, "nativeSize") ?? { x: 1.4, y: 1.4, z: 1.4 };
  const geometry = new BoxGeometry(size.x, size.y, size.z);
  const material = new MeshStandardMaterial({
    color: previewColor,
    metalness: 0.08,
    roughness: 0.72
  });
  const mesh = new Mesh(geometry, material);

  mesh.name = "Missing Model";
  return mesh;
}

function createThreeLight(node: Extract<WebHammerEngineNode, { kind: "light" }>) {
  if (!node.data.enabled) {
    return undefined;
  }

  switch (node.data.type) {
    case "ambient": {
      return new AmbientLight(node.data.color, node.data.intensity);
    }
    case "hemisphere": {
      const light = new HemisphereLight(node.data.color, node.data.groundColor ?? "#0f1721", node.data.intensity);
      return light;
    }
    case "point": {
      const light = new PointLight(node.data.color, node.data.intensity, node.data.distance ?? 0, node.data.decay ?? 2);
      light.castShadow = node.data.castShadow;
      return light;
    }
    case "directional": {
      const group = new Group();
      const light = new DirectionalLight(node.data.color, node.data.intensity);
      const target = new Object3D();

      light.castShadow = node.data.castShadow;
      target.position.set(0, 0, -6);
      group.add(light);
      group.add(target);
      light.target = target;
      return group;
    }
    case "spot": {
      const group = new Group();
      const light = new SpotLight(
        node.data.color,
        node.data.intensity,
        node.data.distance ?? 0,
        node.data.angle ?? Math.PI / 3,
        node.data.penumbra ?? 0,
        node.data.decay ?? 2
      );
      const target = new Object3D();

      light.castShadow = node.data.castShadow;
      target.position.set(0, 0, -6);
      group.add(light);
      group.add(target);
      light.target = target;
      return group;
    }
    default:
      return undefined;
  }
}

function applyTransform(object: Object3D, transform: Transform) {
  object.position.set(transform.position.x, transform.position.y, transform.position.z);
  object.rotation.set(transform.rotation.x, transform.rotation.y, transform.rotation.z, "XYZ");
  object.scale.set(transform.scale.x, transform.scale.y, transform.scale.z);
}

function extractPhysics(node: WebHammerEngineNode) {
  if (node.kind === "primitive") {
    return node.data.physics;
  }

  if (node.kind === "mesh") {
    return node.data.physics;
  }

  return undefined;
}

function findPrimaryLight(object: Object3D) {
  let resolved: Object3D | undefined;

  object.traverse((child: Object3D) => {
    if (!resolved && "isLight" in child && child.isLight) {
      resolved = child;
    }
  });

  return resolved;
}

function resolveModelFormat(format: unknown, path: string): "gltf" | "obj" {
  if (typeof format === "string" && format.toLowerCase() === "obj") {
    return "obj";
  }

  return path.toLowerCase().endsWith(".obj") ? "obj" : "gltf";
}

function readAssetString(asset: Asset | undefined, key: string) {
  const value = asset?.metadata[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readAssetVec3(asset: Asset | undefined, keyPrefix: "nativeCenter" | "nativeSize") {
  if (!asset) {
    return undefined;
  }

  const x = asset.metadata[`${keyPrefix}X`];
  const y = asset.metadata[`${keyPrefix}Y`];
  const z = asset.metadata[`${keyPrefix}Z`];

  if (typeof x !== "number" || typeof y !== "number" || typeof z !== "number") {
    return undefined;
  }

  return { x, y, z };
}

function resolveMaterialSide(side?: MaterialRenderSide) {
  switch (side) {
    case "back":
      return BackSide;
    case "double":
      return DoubleSide;
    default:
      return FrontSide;
  }
}

function patchMtlTextureReferences(mtlText: string, texturePath?: string) {
  if (!texturePath) {
    return mtlText;
  }

  const mapPattern = /^(map_Ka|map_Kd|map_d|map_Bump|bump)\s+.+$/gm;
  const hasDiffuseMap = /^map_Kd\s+.+$/m.test(mtlText);
  const normalized = mtlText.replace(mapPattern, (line) => {
    if (line.startsWith("map_Kd ")) {
      return `map_Kd ${texturePath}`;
    }

    return line;
  });

  return hasDiffuseMap ? normalized : `${normalized.trim()}\nmap_Kd ${texturePath}\n`;
}
