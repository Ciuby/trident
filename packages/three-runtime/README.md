# @web-hammer/three-runtime

Runtime loader and bundle helpers for consuming Web Hammer scene exports in plain Three.js apps.

## What To Export

- Use `.whmap` as the editor-native source file. It is for save/load and round-tripping back into the editor.
- Use `Export Runtime Bundle` when you want to ship a playable level into a game.
- Use glTF only when you want a static baked mesh export. It does not preserve world structure, lights, entities, or gameplay-facing physics metadata.

The runtime export format is a bundle:

- `scene.runtime.json`: compact scene manifest
- `assets/...`: textures and model files referenced by the manifest

That gives you a lean manifest plus normal external asset files instead of one huge JSON blob with embedded texture payloads.

## Editor Workflow

1. Build the level in the editor.
2. Place a `Player Spawn` entity if you want gameplay/playback spawn support.
3. Configure world and player settings in the inspector.
   World skyboxes accept standard images or `.hdr` panoramas.
   Leave `Affect Lighting` off when you only want a backdrop without image-based lighting.
4. Use `File -> Export Runtime Bundle`.
5. The editor downloads `scene.runtime.zip`.

Use the playground in `apps/three-runtime-playground` to validate the bundle outside the editor.

## Install

```bash
bun add @web-hammer/three-runtime three
```

## Consume A Runtime Bundle

```ts
import { Scene } from "three";
import {
  createWebHammerBundleAssetResolver,
  loadWebHammerEngineScene,
  parseWebHammerEngineBundleZip
} from "@web-hammer/three-runtime";

const response = await fetch("/levels/tutorial.runtime.zip");
const zipBytes = new Uint8Array(await response.arrayBuffer());
const bundle = parseWebHammerEngineBundleZip(zipBytes);
const assetResolver = createWebHammerBundleAssetResolver(bundle);

const threeScene = new Scene();
const loaded = await loadWebHammerEngineScene(bundle.manifest, {
  applyToScene: threeScene,
  resolveAssetUrl: (context) => assetResolver.resolve(context.path)
});

threeScene.add(loaded.root);
```

`loaded` includes:

- `root`: the Three.js object tree for the level
- `nodes`: a map of editor node IDs to spawned `Object3D`s
- `lights`: the created light objects
- `entities`: exported entity records
- `physicsNodes`: nodes that have exported physics metadata

When unloading a bundle, remove `loaded.root` from your scene and dispose the bundle resolver:

```ts
threeScene.remove(loaded.root);
assetResolver.dispose();
```

## Consume A Raw Manifest

If you already have `scene.runtime.json` plus externally hosted assets, load the manifest directly:

```ts
import { loadWebHammerEngineScene, parseWebHammerEngineScene } from "@web-hammer/three-runtime";

const response = await fetch("/levels/tutorial/scene.runtime.json");
const manifest = parseWebHammerEngineScene(await response.text());

const loaded = await loadWebHammerEngineScene(manifest, {
  resolveAssetUrl: (context) => {
    if (context.path.startsWith("assets/")) {
      return `/levels/tutorial/${context.path}`;
    }

    return context.path;
  }
});
```

## Streaming And Keeping Worlds Lean

Do not treat one runtime bundle as your whole open world. On the web, that leads the problem of massive up-front downloads and long parse times.

Current recommended strategy:

1. Split the world into multiple authored level chunks.
2. Export one runtime bundle per chunk.
3. Keep a tiny world index in your game with chunk bounds, URLs, and load radii.
4. Load nearby bundles on demand.
5. Unload distant bundles by removing their `root` and disposing their asset resolver.

Example world index:

```json
[
  { "id": "hub", "bounds": [-40, 0, -40, 40, 20, 40], "url": "/levels/hub.runtime.zip" },
  { "id": "cave-a", "bounds": [40, -10, -20, 120, 30, 50], "url": "/levels/cave-a.runtime.zip" }
]
```

This is the important part: runtime bundles are best thought of as streamable level chunks, not as one monolithic world package.

## Avoiding Asset Duplication Across Chunks

If several chunks share the same large textures or models, do not package those assets into every chunk forever.

Use one of these approaches:

- Keep heavy shared assets on a CDN or normal static asset path and leave those URLs external.
- Bundle only chunk-local assets into each runtime bundle.
- Put shared assets in a separate asset pack your game caches once.

If you have a build step around exported manifests, `externalizeWebHammerEngineScene()` supports leaving non-data-URL assets external:

```ts
import { externalizeWebHammerEngineScene } from "@web-hammer/three-runtime";

const bundle = await externalizeWebHammerEngineScene(scene, {
  copyExternalAssets: false
});
```

With `copyExternalAssets: false`:

- data URLs are still materialized into bundle files
- normal `https://...` or `/assets/...` references stay as-is
- your game can stream chunk manifests while shared heavy assets come from their existing URLs

That is usually the right model for large web worlds.

## Suggested Production Layout

- `/world/world-index.json`: chunk metadata only
- `/world/chunks/*.runtime.zip`: small chunk bundles
- `/world/shared/*`: large shared textures/models

This gives you:

- fast initial load
- chunked world streaming
- fewer duplicated megabytes
- normal CDN/browser caching for shared assets

## Current Limitation

The editor currently exports a single runtime bundle per scene. It does not yet auto-slice one authored scene into streaming cells for you.

So today, if you want streaming worlds, the practical workflow is:

- author separate scenes for separate chunks, or
- post-process exported manifests in your own content pipeline

That is a tooling gap, not a runtime limitation.
