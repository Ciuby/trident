import { describe, expect, test } from "bun:test";
import { loadWebHammerEngineScene } from "./loader";
import type { WebHammerEngineScene } from "./types";
import { makeTransform, vec3 } from "@web-hammer/shared";
import { LOD, Vector3 } from "three";

describe("loadWebHammerEngineScene", () => {
  test("rebuilds grouped runtime hierarchies and resolves entity world transforms", async () => {
    const scene: WebHammerEngineScene = {
      assets: [],
      entities: [
        {
          id: "entity:spawn",
          name: "Spawn",
          parentId: "node:group",
          properties: {},
          transform: makeTransform(vec3(0, 0, 3)),
          type: "player-spawn"
        }
      ],
      layers: [],
      materials: [],
      metadata: {
        exportedAt: new Date("2026-03-12T10:00:00.000Z").toISOString(),
        format: "web-hammer-engine",
        version: 4
      },
      nodes: [
        {
          data: {},
          hooks: [
            {
              config: {
                tags: ["train"]
              },
              id: "hook:tags:test",
              type: "tags"
            }
          ],
          id: "node:group",
          kind: "group",
          name: "Group",
          transform: {
            position: vec3(5, 0, 1),
            rotation: vec3(0, Math.PI / 2, 0),
            scale: vec3(2, 2, 2)
          }
        },
        {
          data: {
            castShadow: false,
            color: "#ffffff",
            enabled: true,
            intensity: 2,
            type: "point"
          },
          id: "node:light",
          kind: "light",
          name: "Light",
          parentId: "node:group",
          transform: makeTransform(vec3(1, 0, 0))
        }
      ],
      settings: {
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
        ambientIntensity: 0,
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
      }
    };

    const loaded = await loadWebHammerEngineScene(scene);
    const groupObject = loaded.nodes.get("node:group");
    const lightObject = loaded.nodes.get("node:light");
    const worldPosition = lightObject?.getWorldPosition(new Vector3());

    expect(groupObject).toBeDefined();
    expect(lightObject?.parent).toBe(groupObject);
    expect(groupObject?.userData.webHammer.hooks?.[0]?.type).toBe("tags");
    expect(worldPosition?.x).toBeCloseTo(5, 5);
    expect(worldPosition?.z).toBeCloseTo(-1, 5);
    expect(loaded.entities[0]?.transform.position.x).toBeCloseTo(11, 5);
    expect(loaded.entities[0]?.transform.position.z).toBeCloseTo(1, 5);
  });

  test("creates three lod objects when baked lod geometry and distances are provided", async () => {
    const scene: WebHammerEngineScene = {
      assets: [],
      entities: [],
      layers: [],
      materials: [],
      metadata: {
        exportedAt: new Date("2026-03-12T10:00:00.000Z").toISOString(),
        format: "web-hammer-engine",
        version: 5
      },
      nodes: [
        {
          data: {
            role: "prop",
            shape: "cube",
            size: vec3(2, 2, 2)
          },
          geometry: {
            primitives: [
              {
                indices: [0, 1, 2, 0, 2, 3],
                material: {
                  color: "#ffffff",
                  id: "material:test",
                  metallicFactor: 0,
                  name: "Test",
                  roughnessFactor: 1
                },
                normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
                positions: [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0],
                uvs: [0, 0, 1, 0, 1, 1, 0, 1]
              }
            ]
          },
          id: "node:lod-cube",
          kind: "primitive",
          lods: [
            {
              geometry: {
                primitives: [
                  {
                    indices: [0, 1, 2],
                    material: {
                      color: "#ffffff",
                      id: "material:test",
                      metallicFactor: 0,
                      name: "Test",
                      roughnessFactor: 1
                    },
                    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
                    positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
                    uvs: [0, 0, 1, 0, 0.5, 1]
                  }
                ]
              },
              level: "mid"
            },
            {
              geometry: {
                primitives: [
                  {
                    indices: [0, 1, 2],
                    material: {
                      color: "#ffffff",
                      id: "material:test",
                      metallicFactor: 0,
                      name: "Test",
                      roughnessFactor: 1
                    },
                    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
                    positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
                    uvs: [0, 0, 1, 0, 0.5, 1]
                  }
                ]
              },
              level: "low"
            }
          ],
          name: "LOD Cube",
          transform: makeTransform(vec3(0, 0, 0))
        }
      ],
      settings: {
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
          ambientIntensity: 0,
          fogColor: "#000000",
          fogFar: 50,
          fogNear: 10,
          gravity: vec3(0, -9.81, 0),
          lod: {
            bakedAt: "2026-03-15T12:00:00.000Z",
            enabled: true,
            lowDetailRatio: 0.2,
            midDetailRatio: 0.5
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
      }
    };

    const loaded = await loadWebHammerEngineScene(scene, {
      lod: {
        lowDistance: 30,
        midDistance: 10
      }
    });
    const lodNode = loaded.nodes.get("node:lod-cube");
    const lodObject = lodNode?.children[0]?.children[0];

    expect(lodObject).toBeInstanceOf(LOD);
    expect((lodObject as LOD | undefined)?.levels.map((level) => level.distance)).toEqual([0, 10, 30]);
  });

  test("creates model lod objects from referenced baked model assets", async () => {
    const scene: WebHammerEngineScene = {
      assets: [
        {
          id: "asset:model:high",
          metadata: {
            modelFormat: "glb",
            nativeCenterX: 0,
            nativeCenterY: 0,
            nativeCenterZ: 0,
            nativeSizeX: 2,
            nativeSizeY: 3,
            nativeSizeZ: 2
          },
          path: "missing-high.glb",
          type: "model"
        },
        {
          id: "asset:model:mid",
          metadata: {
            modelFormat: "glb",
            nativeCenterX: 0,
            nativeCenterY: 0,
            nativeCenterZ: 0,
            nativeSizeX: 2,
            nativeSizeY: 3,
            nativeSizeZ: 2
          },
          path: "missing-mid.glb",
          type: "model"
        },
        {
          id: "asset:model:low",
          metadata: {
            modelFormat: "glb",
            nativeCenterX: 0,
            nativeCenterY: 0,
            nativeCenterZ: 0,
            nativeSizeX: 2,
            nativeSizeY: 3,
            nativeSizeZ: 2
          },
          path: "missing-low.glb",
          type: "model"
        }
      ],
      entities: [],
      layers: [],
      materials: [],
      metadata: {
        exportedAt: new Date("2026-03-16T10:00:00.000Z").toISOString(),
        format: "web-hammer-engine",
        version: 5
      },
      nodes: [
        {
          data: {
            assetId: "asset:model:high",
            path: "missing-high.glb"
          },
          id: "node:lod-model",
          kind: "model",
          lods: [
            {
              assetId: "asset:model:mid",
              level: "mid"
            },
            {
              assetId: "asset:model:low",
              level: "low"
            }
          ],
          name: "LOD Model",
          transform: makeTransform(vec3(0, 0, 0))
        }
      ],
      settings: {
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
          ambientIntensity: 0,
          fogColor: "#000000",
          fogFar: 50,
          fogNear: 10,
          gravity: vec3(0, -9.81, 0),
          lod: {
            bakedAt: "2026-03-16T10:00:00.000Z",
            enabled: true,
            lowDetailRatio: 0.2,
            midDetailRatio: 0.5
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
      }
    };

    const loaded = await loadWebHammerEngineScene(scene, {
      lod: {
        lowDistance: 30,
        midDistance: 10
      }
    });
    const lodNode = loaded.nodes.get("node:lod-model");
    const lodObject = lodNode?.children[0]?.children[0];

    expect(lodObject).toBeInstanceOf(LOD);
    expect((lodObject as LOD | undefined)?.levels.map((level) => level.distance)).toEqual([0, 10, 30]);
  });
});
