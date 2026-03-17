# Suggested Project Layout

This page suggests a practical file layout for a vanilla Three.js game using Web Hammer runtime packages.

Related guides:

- [Getting Started](./getting-started.md)
- [Build Pipeline](./build-pipeline.md)
- [World Streaming](./world-streaming.md)

## Recommended Source Layout

```text
/src
  /game
    app.ts
    loop.ts
    camera.ts
    input.ts
  /runtime
    build.ts
    load-scene.ts
    gameplay.ts
    physics.ts
    streaming.ts
  /content
    world-index.ts
```

Suggested responsibilities:

- `app.ts`: bootstraps Three, your scene, camera, and renderer
- `loop.ts`: owns update and render order
- `load-scene.ts`: wraps `createThreeRuntimeSceneInstance()`
- `gameplay.ts`: creates `@web-hammer/gameplay-runtime`
- `physics.ts`: owns Rapier lifecycle
- `streaming.ts`: owns `@web-hammer/runtime-streaming`

## Recommended Built Asset Layout

```text
/public
  /world
    /world-index.json
    /chunks
      /hub
        scene.runtime.json
        /assets
      /cave-a
        scene.runtime.json
        /assets
    /shared
      /textures
      /props
```

## Minimal Runtime Loader Module

```ts
import { createThreeRuntimeSceneInstance } from "@web-hammer/three-runtime";
import { parseRuntimeScene } from "@web-hammer/runtime-format";

export async function loadRuntimeScene(chunkBaseUrl: string) {
  const response = await fetch(`${chunkBaseUrl}/scene.runtime.json`);
  const manifest = parseRuntimeScene(await response.text());

  return createThreeRuntimeSceneInstance(manifest, {
    resolveAssetUrl: ({ path }) => `${chunkBaseUrl}/${path}`
  });
}
```

## Minimal Gameplay Module

```ts
import {
  createGameplayRuntime,
  createGameplayRuntimeSceneFromRuntimeScene
} from "@web-hammer/gameplay-runtime";

export function createChunkGameplay(instance: Awaited<ReturnType<typeof loadRuntimeScene>>) {
  return createGameplayRuntime({
    scene: createGameplayRuntimeSceneFromRuntimeScene(instance.scene),
    systems: []
  });
}
```

## Minimal Streaming Module

```ts
import { createRuntimeWorldManager } from "@web-hammer/runtime-streaming";

export function createWorldStreaming(worldIndex, threeScene) {
  return createRuntimeWorldManager({
    async loadChunk(chunk) {
      const instance = await loadRuntimeScene(`/world/chunks/${chunk.id}`);
      threeScene.add(instance.root);
      return instance;
    },
    async unloadChunk(_chunk, instance) {
      threeScene.remove(instance.root);
      instance.dispose();
    },
    worldIndex
  });
}
```

## Final Advice

Keep Web Hammer isolated behind a small runtime boundary in your app.

That makes it easy to:

- swap chunk policies
- change physics integration
- add custom gameplay systems
- keep the rest of your game framework-independent

Back to the [Vanilla Three.js Guide](./README.md).
