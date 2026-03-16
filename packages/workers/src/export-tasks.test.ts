import { describe, expect, test } from "bun:test";
import { exportEngineBundle } from "./export-tasks";
import { makeTransform, vec3, type SceneSettings } from "@web-hammer/shared";
import type { SceneDocumentSnapshot } from "@web-hammer/editor-core";

const settings: SceneSettings = {
  player: {
    cameraMode: "fps",
    canCrouch: true,
    canJump: true,
    canRun: true,
    crouchHeight: 1.2,
    height: 1.8,
    jumpHeight: 1,
    movementSpeed: 4,
    runningSpeed: 6
  },
  world: {
    ambientColor: "#ffffff",
    ambientIntensity: 0.5,
    fogColor: "#000000",
    fogFar: 50,
    fogNear: 10,
    gravity: vec3(0, -9.81, 0),
    lod: {
      bakedAt: "",
      enabled: false,
      lowDetailRatio: 0.22,
      midDetailRatio: 0.52
    },
    physicsEnabled: true,
    skybox: {
      affectsLighting: false,
      blur: 0,
      enabled: false,
      format: "image",
      intensity: 1,
      lightingIntensity: 1,
      name: "",
      source: ""
    }
  }
};

describe("exportEngineBundle", () => {
  test("preserves parent ids for grouped runtime exports", async () => {
    const snapshot: SceneDocumentSnapshot = {
      assets: [],
      entities: [
        {
          hooks: [
            {
              config: {
                mode: "slide"
              },
              enabled: true,
              id: "hook:openable:test",
              type: "openable"
            }
          ],
          id: "entity:spawn",
          name: "Spawn",
          parentId: "node:group",
          properties: {},
          transform: makeTransform(vec3(0, 0, 2)),
          type: "player-spawn"
        }
      ],
      layers: [],
      materials: [],
      nodes: [
        {
          data: {},
          id: "node:group",
          kind: "group",
          name: "Group",
          transform: makeTransform(vec3(4, 0, 1))
        },
        {
          data: {
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
      ],
      settings,
      textures: []
    };

    const bundle = await exportEngineBundle(snapshot);
    const group = bundle.manifest.nodes.find((node) => node.id === "node:group");
    const cube = bundle.manifest.nodes.find((node) => node.id === "node:cube");

    expect(bundle.manifest.metadata.version).toBe(5);
    expect(group?.kind).toBe("group");
    expect(cube?.parentId).toBe("node:group");
    expect(bundle.manifest.entities[0]?.parentId).toBe("node:group");
    expect(bundle.manifest.entities[0]?.hooks?.[0]?.type).toBe("openable");
  });

  test("preserves custom gameplay events in exported settings", async () => {
    const snapshot: SceneDocumentSnapshot = {
      assets: [],
      entities: [],
      layers: [],
      materials: [],
      nodes: [],
      settings: {
        ...settings,
        events: [
          {
            category: "Mission",
            custom: true,
            description: "Raised when the mission objective is updated.",
            id: "event:mission:updated",
            name: "mission.updated",
            scope: "mission"
          }
        ]
      },
      textures: []
    };

    const bundle = await exportEngineBundle(snapshot);

    expect(bundle.manifest.settings.events?.[0]?.name).toBe("mission.updated");
  });

  test("bundles scene skyboxes into runtime exports", async () => {
    const snapshot: SceneDocumentSnapshot = {
      assets: [],
      entities: [],
      layers: [],
      materials: [],
      nodes: [],
      settings: {
        ...settings,
        world: {
          ...settings.world,
          skybox: {
            ...settings.world.skybox,
            enabled: true,
            format: "image",
            name: "sunset-sky.png",
            source: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sotW5kAAAAASUVORK5CYII="
          }
        }
      },
      textures: []
    };

    const bundle = await exportEngineBundle(snapshot);

    expect(bundle.manifest.settings.world.skybox.source).toBe("assets/skyboxes/sunset-sky-png.png");
    expect(bundle.files.some((file) => file.path === "assets/skyboxes/sunset-sky-png.png")).toBe(true);
  });

  test("preserves node hooks in exported manifests", async () => {
    const snapshot: SceneDocumentSnapshot = {
      assets: [],
      entities: [],
      layers: [],
      materials: [],
      nodes: [
        {
          data: {},
          hooks: [
            {
              config: {
                shape: "box",
                size: vec3(3, 1, 3)
              },
              enabled: true,
              id: "hook:trigger:platform",
              type: "trigger_volume"
            },
            {
              actions: [
                {
                  event: "path.start",
                  target: "node:platform",
                  type: "emit"
                }
              ],
              enabled: true,
              id: "hook:sequence:platform",
              trigger: {
                event: "trigger.enter",
                fromEntity: "node:platform"
              },
              type: "sequence"
            },
            {
              config: {
                active: false,
                pathId: "sample:platform-route",
                speed: 1.5
              },
              enabled: true,
              id: "hook:path:platform",
              type: "path_mover"
            }
          ],
          id: "node:platform",
          kind: "group",
          name: "Platform",
          transform: makeTransform(vec3(0, 0, 0))
        }
      ],
      settings,
      textures: []
    };

    const bundle = await exportEngineBundle(snapshot);
    const platform = bundle.manifest.nodes.find((node) => node.id === "node:platform");

    expect(platform?.hooks).toHaveLength(3);
    expect(platform?.hooks?.map((hook) => hook.type)).toEqual(["trigger_volume", "sequence", "path_mover"]);
  });

  test("bakes authored geometry lods into runtime manifests", async () => {
    const snapshot: SceneDocumentSnapshot = {
      assets: [],
      entities: [],
      layers: [],
      materials: [],
      nodes: [
        {
          data: {
            role: "prop",
            shape: "sphere",
            size: vec3(3, 3, 3)
          },
          id: "node:sphere",
          kind: "primitive",
          name: "Sphere",
          transform: makeTransform(vec3(0, 0, 0))
        }
      ],
      settings: {
        ...settings,
        world: {
          ...settings.world,
          lod: {
            bakedAt: "2026-03-15T12:00:00.000Z",
            enabled: true,
            lowDetailRatio: 0.18,
            midDetailRatio: 0.48
          }
        }
      },
      textures: []
    };

    const bundle = await exportEngineBundle(snapshot);
    const sphere = bundle.manifest.nodes.find((node) => node.id === "node:sphere" && node.kind === "primitive");

    expect(sphere && "lods" in sphere ? sphere.lods?.map((lod) => lod.level) : []).toEqual(["mid", "low"]);
    expect(sphere && "lods" in sphere ? sphere.lods?.[0]?.geometry.primitives[0]?.indices.length : 0).toBeGreaterThan(0);
  });
});
