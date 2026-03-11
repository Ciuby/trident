import "./styles.css";

import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  CapsuleGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector3,
  WebGLRenderer
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  applyWebHammerWorldSettings,
  createWebHammerBundleAssetResolver,
  loadWebHammerEngineScene,
  parseWebHammerEngineBundleZip,
  parseWebHammerEngineScene,
  type WebHammerEngineScene
} from "@web-hammer/three-runtime";
import { createSampleScene, resolveSampleAssetPath } from "./sample-scene";
import type { Entity, SceneSettings } from "@web-hammer/shared";

const loadSampleButton = mustQuery<HTMLButtonElement>("#load-sample");
const toggleControllerButton = mustQuery<HTMLButtonElement>("#toggle-controller");
const fileInput = mustQuery<HTMLInputElement>("#scene-file");
const stage = mustQuery<HTMLElement>("#stage");
const status = mustQuery<HTMLElement>("#status");
const errorBanner = mustQuery<HTMLElement>("#error-banner");

const scene = new Scene();
scene.background = new Color("#12161a");

const camera = new PerspectiveCamera(60, 1, 0.1, 2000);
camera.position.set(16, 12, 16);

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.toneMapping = ACESFilmicToneMapping;
stage.append(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 2, 0);

const grid = new GridHelper(400, 200, "#5f7380", "#2a3138");
grid.position.y = 0.001;
scene.add(grid);

const fillAmbient = new AmbientLight("#b7c6d1", 0.42);
const fillSun = new DirectionalLight("#f4f1df", 1.6);
fillSun.position.set(10, 18, 12);
fillSun.castShadow = true;
scene.add(fillAmbient);
scene.add(fillSun);

const controllerRig = new Group();
const controllerYaw = new Group();
const controllerPitch = new Group();
const controllerCapsule = new Mesh(
  new CapsuleGeometry(0.34, 1.1, 8, 16),
  new MeshStandardMaterial({
    color: "#7dd3fc",
    emissive: "#0b3b53",
    emissiveIntensity: 0.22,
    roughness: 0.48,
    metalness: 0.08
  })
);
controllerCapsule.castShadow = true;
controllerCapsule.receiveShadow = true;
controllerCapsule.position.y = 0.9;
controllerYaw.add(controllerCapsule);
controllerPitch.position.y = 1.55;
controllerYaw.add(controllerPitch);
controllerRig.visible = false;
scene.add(controllerRig);

let loadedRoot: Group | undefined;
let activeBundleResolver: ReturnType<typeof createWebHammerBundleAssetResolver> | undefined;
let activeSceneSettings: SceneSettings = createSampleScene().settings;
let activeSceneEntities: Entity[] = [];
let controllerActive = false;

const controllerVelocity = new Vector3();
const controllerDirection = new Vector3();
const controllerForward = new Vector3();
const controllerRight = new Vector3();
const controllerCameraTarget = new Vector3();
const controllerCameraPosition = new Vector3();
const controllerRayOrigin = new Vector3();
const controllerGroundHit = new Vector3();
const controllerSpawnPosition = new Vector3(0, 2, 0);
const raycaster = new Raycaster();
const pressedKeys = new Set<string>();
let jumpQueued = false;
let yaw = 0;
let pitch = -0.22;

const DEFAULT_PLAYER_SETTINGS: SceneSettings["player"] = {
  cameraMode: "third-person",
  canCrouch: true,
  canJump: true,
  canRun: true,
  crouchHeight: 1.2,
  height: 1.8,
  jumpHeight: 1.1,
  movementSpeed: 4.5,
  runningSpeed: 7
};

function resize() {
  const { clientWidth, clientHeight } = stage;
  camera.aspect = Math.max(clientWidth, 1) / Math.max(clientHeight, 1);
  camera.updateProjectionMatrix();
  renderer.setSize(Math.max(clientWidth, 1), Math.max(clientHeight, 1), false);
}

window.addEventListener("resize", resize);
resize();

renderer.setAnimationLoop(() => {
  if (controllerActive) {
    updateController(1 / 60);
  } else {
    controls.update();
  }
  renderer.render(scene, camera);
});

loadSampleButton.addEventListener("click", () => {
  void importScene(createSampleScene(), {
    label: "Sample scene",
    resolveAssetPath: (path) => resolveSampleAssetPath(path)
  });
});

toggleControllerButton.addEventListener("click", () => {
  setControllerActive(!controllerActive);
});

window.addEventListener("keydown", (event) => {
  if (isTypingTarget(event.target)) {
    return;
  }

  pressedKeys.add(event.code);

  if (event.code === "Space") {
    jumpQueued = true;
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  pressedKeys.delete(event.code);
});

window.addEventListener("blur", () => {
  pressedKeys.clear();
  jumpQueued = false;
});

renderer.domElement.addEventListener("click", () => {
  if (!controllerActive || document.pointerLockElement === renderer.domElement) {
    return;
  }

  void renderer.domElement.requestPointerLock();
});

window.addEventListener("mousemove", (event) => {
  if (!controllerActive || document.pointerLockElement !== renderer.domElement) {
    return;
  }

  yaw -= event.movementX * 0.0024;
  pitch = MathUtils.clamp(pitch - event.movementY * 0.0018, -1.2, 0.45);
});

document.addEventListener("pointerlockchange", () => {
  if (!controllerActive || document.pointerLockElement === renderer.domElement) {
    return;
  }

  setStatus("Controller paused");
});

fileInput.addEventListener("change", async (event) => {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];

  if (!file) {
    return;
  }

  try {
    if (file.name.toLowerCase().endsWith(".zip")) {
      const zipBytes = new Uint8Array(await file.arrayBuffer());
      const bundle = parseWebHammerEngineBundleZip(zipBytes);
      const bundleResolver = createWebHammerBundleAssetResolver(bundle);

      await importScene(bundle.manifest, {
        bundleResolver,
        label: file.name,
        resolveAssetPath: (path) => bundleResolver.resolve(path)
      });
    } else {
      const text = await file.text();
      const manifest = parseWebHammerEngineScene(text);
      await importScene(manifest, {
        label: file.name
      });
    }
  } catch (error) {
    showError(error instanceof Error ? error.message : "Failed to import runtime bundle.");
    setStatus("Import failed");
  } finally {
    input.value = "";
  }
});

void importScene(createSampleScene(), {
  label: "Sample scene",
  resolveAssetPath: (path) => resolveSampleAssetPath(path)
});

async function importScene(
  engineScene: WebHammerEngineScene,
  options: {
    bundleResolver?: ReturnType<typeof createWebHammerBundleAssetResolver>;
    label: string;
    resolveAssetPath?: (path: string) => Promise<string> | string;
  }
) {
  setStatus(`Loading ${options.label}`);
  hideError();

  if (loadedRoot) {
    scene.remove(loadedRoot);
    disposeObjectTree(loadedRoot);
    loadedRoot = undefined;
  }

  if (activeBundleResolver && activeBundleResolver !== options.bundleResolver) {
    activeBundleResolver.dispose();
  }
  activeBundleResolver = options.bundleResolver;
  activeSceneSettings = engineScene.settings;
  activeSceneEntities = engineScene.entities;

  applyWebHammerWorldSettings(scene, engineScene);

  const loaded = await loadWebHammerEngineScene(engineScene, {
    applyToScene: scene,
    resolveAssetUrl: async (context) => options.resolveAssetPath?.(context.path) ?? resolveSampleAssetPath(context.path)
  });

  loadedRoot = loaded.root;
  scene.add(loaded.root);
  fitCameraToObject(loaded.root);
  configureControllerForScene(loaded.root, loaded.entities, engineScene.settings);

  const meshCount = countRenderableMeshes(loaded.root);
  const lightCount = loaded.lights.length;
  setStatus(`${options.label}: ${meshCount} meshes, ${lightCount} lights, ${loaded.entities.length} entities`);

  if (meshCount === 0) {
    showError("Bundle loaded, but no renderable meshes were created. Check asset paths or exported geometry.");
  }
}

function fitCameraToObject(object: Group) {
  const bounds = new Box3().setFromObject(object);

  if (!Number.isFinite(bounds.min.x) || !Number.isFinite(bounds.max.x)) {
    controls.target.set(0, 1.5, 0);
    camera.position.set(14, 10, 14);
    controls.update();
    return;
  }

  const center = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());
  const radius = Math.max(size.length() * 0.5, 6);
  const offset = new Vector3(1, 0.72, 1).normalize().multiplyScalar(radius * 1.8);

  controls.target.copy(center);
  camera.near = Math.max(radius / 500, 0.05);
  camera.far = Math.max(radius * 30, 200);
  camera.updateProjectionMatrix();
  camera.position.copy(center.clone().add(offset));
  camera.lookAt(center);
  controls.update();
}

function countRenderableMeshes(root: Group) {
  let count = 0;

  root.traverse((child) => {
    if ("isMesh" in child && child.isMesh) {
      count += 1;
    }
  });

  return count;
}

function configureControllerForScene(root: Group, entities: Entity[], settings: SceneSettings) {
  activeSceneSettings = settings;
  activeSceneEntities = entities;

  const playerSpawn = entities.find((entity) => entity.type === "player-spawn");

  if (playerSpawn) {
    controllerSpawnPosition.set(
      playerSpawn.transform.position.x,
      playerSpawn.transform.position.y + Math.max(0.9, settings.player.height * 0.5),
      playerSpawn.transform.position.z
    );
    yaw = playerSpawn.transform.rotation.y;
  } else {
    const bounds = new Box3().setFromObject(root);
    const center = bounds.getCenter(new Vector3());
    controllerSpawnPosition.set(center.x, Math.max(bounds.max.y + settings.player.height * 0.5, 1.2), center.z);
    yaw = 0;
  }

  pitch = settings.player.cameraMode === "top-down" ? -0.9 : -0.22;
  controllerRig.position.copy(controllerSpawnPosition);
  controllerVelocity.set(0, 0, 0);
  controllerYaw.rotation.set(0, yaw, 0);
  controllerPitch.rotation.set(pitch, 0, 0);
}

function updateController(delta: number) {
  const player = activeSceneSettings.player ?? DEFAULT_PLAYER_SETTINGS;
  const height = Math.max(1.2, player.height);
  const radius = MathUtils.clamp(height * 0.18, 0.26, 0.42);
  const moveSpeed =
    player.canRun && (pressedKeys.has("ShiftLeft") || pressedKeys.has("ShiftRight"))
      ? player.runningSpeed
      : player.movementSpeed;

  controllerCapsule.scale.setScalar(radius / 0.34);
  controllerCapsule.scale.y = Math.max(0.65, height / 1.8);
  controllerCapsule.position.y = height * 0.5;

  controllerForward.set(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
  controllerRight.set(-controllerForward.z, 0, controllerForward.x).normalize();
  controllerDirection.set(0, 0, 0);
  controllerDirection.addScaledVector(controllerForward, (pressedKeys.has("KeyW") ? 1 : 0) - (pressedKeys.has("KeyS") ? 1 : 0));
  controllerDirection.addScaledVector(controllerRight, (pressedKeys.has("KeyD") ? 1 : 0) - (pressedKeys.has("KeyA") ? 1 : 0));

  if (controllerDirection.lengthSq() > 0) {
    controllerDirection.normalize().multiplyScalar(moveSpeed);
  }

  const gravity = Math.abs(activeSceneSettings.world.gravity.y || -9.81);
  const grounded = snapControllerToGround(height);

  if (grounded) {
    controllerVelocity.y = Math.max(controllerVelocity.y, 0);

    if (jumpQueued && player.canJump) {
      controllerVelocity.y = Math.sqrt(2 * gravity * player.jumpHeight);
    }
  } else {
    controllerVelocity.y -= gravity * delta;
  }

  jumpQueued = false;

  controllerRig.position.x += controllerDirection.x * delta;
  controllerRig.position.z += controllerDirection.z * delta;
  controllerRig.position.y += controllerVelocity.y * delta;

  snapControllerToGround(height);

  controllerYaw.rotation.y = yaw;
  controllerPitch.rotation.x = pitch;

  const eyeHeight = Math.max(radius * 2.2, height * 0.9);
  controllerCameraTarget.copy(controllerRig.position).add(new Vector3(0, eyeHeight, 0));
  const viewDirection = new Vector3(
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch)
  ).normalize();
  const followDistance = player.cameraMode === "top-down" ? Math.max(10, height * 5.5) : Math.max(4.2, height * 2.9);

  if (player.cameraMode === "top-down") {
    controllerCameraPosition.copy(controllerCameraTarget).addScaledVector(viewDirection, -followDistance);
    controllerCameraPosition.y += height * 1.8;
  } else if (player.cameraMode === "fps") {
    controllerCameraPosition.copy(controllerCameraTarget);
  } else {
    controllerCameraPosition.copy(controllerCameraTarget).addScaledVector(viewDirection, -followDistance);
    controllerCameraPosition.y += height * 0.22;
  }

  camera.position.lerp(controllerCameraPosition, 1 - Math.exp(-delta * 10));
  camera.lookAt(controllerCameraTarget);
}

function snapControllerToGround(height: number) {
  if (!loadedRoot) {
    return false;
  }

  controllerRayOrigin.copy(controllerRig.position);
  controllerRayOrigin.y += 0.25;
  raycaster.set(controllerRayOrigin, new Vector3(0, -1, 0));
  raycaster.far = Math.max(height + 1.5, 4);

  const intersections = raycaster.intersectObject(loadedRoot, true);
  const hit = intersections.find((entry) => entry.object instanceof Mesh);

  if (!hit) {
    if (controllerRig.position.y <= height * 0.5) {
      controllerRig.position.y = height * 0.5;
      controllerVelocity.y = 0;
      return true;
    }

    return false;
  }

  controllerGroundHit.copy(hit.point);
  const targetY = controllerGroundHit.y + height * 0.5;
  const distanceToGround = controllerRig.position.y - targetY;

  if (distanceToGround <= 0.08 && controllerVelocity.y <= 0) {
    controllerRig.position.y = targetY;
    controllerVelocity.y = 0;
    return true;
  }

  return false;
}

function setControllerActive(next: boolean) {
  controllerActive = next;
  controllerRig.visible = next;
  controls.enabled = !next;
  toggleControllerButton.classList.toggle("active", next);
  toggleControllerButton.textContent = next ? "Stop" : "Play";

  if (!next && document.pointerLockElement === renderer.domElement) {
    document.exitPointerLock();
  }

  if (next) {
    controllerRig.position.copy(controllerSpawnPosition);
    controllerVelocity.set(0, 0, 0);
    setStatus("Controller active");
  } else {
    setStatus("Orbit camera active");
  }
}

function disposeObjectTree(root: Group) {
  root.traverse((child) => {
    if ("geometry" in child) {
      (child.geometry as { dispose?: () => void } | undefined)?.dispose?.();
    }

    if ("material" in child) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        (material as { dispose?: () => void } | undefined)?.dispose?.();
      });
    }
  });
}

function setStatus(message: string) {
  status.textContent = message;
}

function showError(message: string) {
  errorBanner.textContent = message;
  errorBanner.classList.remove("hidden");
}

function hideError() {
  errorBanner.textContent = "";
  errorBanner.classList.add("hidden");
}

function mustQuery<T extends Element>(selector: string) {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }

  return element;
}

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}
