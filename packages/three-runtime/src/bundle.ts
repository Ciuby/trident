import { unzipSync, zipSync } from "fflate";
import type { WebHammerEngineBundle, WebHammerEngineBundleFile, WebHammerEngineScene } from "./types";
import { parseWebHammerEngineScene } from "./loader";

const TEXTURE_FIELDS = ["baseColorTexture", "metallicRoughnessTexture", "normalTexture"] as const;

type TextureField = (typeof TEXTURE_FIELDS)[number];

export type ExternalizeWebHammerSceneOptions = {
  assetDir?: string;
  copyExternalAssets?: boolean;
};

export type CreateWebHammerBundleZipOptions = {
  compressionLevel?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  manifestPath?: string;
};

export async function externalizeWebHammerEngineScene(
  scene: WebHammerEngineScene,
  options: ExternalizeWebHammerSceneOptions = {}
): Promise<WebHammerEngineBundle> {
  const manifest = structuredClone(scene);
  const files: WebHammerEngineBundleFile[] = [];
  const assetDir = trimSlashes(options.assetDir ?? "assets");
  const copyExternalAssets = options.copyExternalAssets ?? true;
  const pathBySource = new Map<string, string>();
  const usedPaths = new Set<string>();

  for (const material of manifest.materials) {
    for (const field of TEXTURE_FIELDS) {
      const source = material[field];

      if (!source) {
        continue;
      }

      const bundledPath = await materializeSource(source, {
        copyExternalAssets,
        files,
        pathBySource,
        preferredStem: `${assetDir}/textures/${slugify(material.id)}-${textureFieldSuffix(field)}`,
        usedPaths
      });

      if (bundledPath) {
        material[field] = bundledPath;
      }
    }
  }

  for (const asset of manifest.assets) {
    if (asset.type !== "model") {
      continue;
    }

    const bundledPath = await materializeSource(asset.path, {
      copyExternalAssets,
      files,
      pathBySource,
      preferredExtension: inferModelExtension(asset.path, asset.metadata.modelFormat),
      preferredStem: `${assetDir}/models/${slugify(asset.id)}`,
      usedPaths
    });

    if (bundledPath) {
      asset.path = bundledPath;
    }

    const texturePath = asset.metadata.texturePath;

    if (typeof texturePath === "string" && texturePath.length > 0) {
      const bundledTexturePath = await materializeSource(texturePath, {
        copyExternalAssets,
        files,
        pathBySource,
        preferredStem: `${assetDir}/model-textures/${slugify(asset.id)}`,
        usedPaths
      });

      if (bundledTexturePath) {
        asset.metadata.texturePath = bundledTexturePath;
      }
    }
  }

  return {
    files,
    manifest
  };
}

export function createWebHammerEngineBundleZip(
  bundle: WebHammerEngineBundle,
  options: CreateWebHammerBundleZipOptions = {}
) {
  const manifestPath = options.manifestPath ?? "scene.runtime.json";
  const encoder = new TextEncoder();
  const entries: Record<string, Uint8Array> = {
    [manifestPath]: encoder.encode(JSON.stringify(bundle.manifest))
  };

  bundle.files.forEach((file) => {
    entries[file.path] = file.bytes;
  });

  return zipSync(entries, {
    level: options.compressionLevel ?? 6
  });
}

export function parseWebHammerEngineBundleZip(
  bytes: Uint8Array,
  options: { manifestPath?: string } = {}
): WebHammerEngineBundle {
  const manifestPath = options.manifestPath ?? "scene.runtime.json";
  const archive = unzipSync(bytes);
  const manifestBytes = archive[manifestPath];

  if (!manifestBytes) {
    throw new Error(`Bundle is missing ${manifestPath}.`);
  }

  const manifest = parseWebHammerEngineScene(new TextDecoder().decode(manifestBytes));
  const files = Object.entries(archive)
    .filter(([path]) => path !== manifestPath)
    .map(([path, fileBytes]) => ({
      bytes: fileBytes,
      mimeType: inferMimeTypeFromPath(path),
      path
    }));

  return {
    files,
    manifest
  };
}

export function createWebHammerBundleAssetResolver(bundle: WebHammerEngineBundle) {
  const urlByPath = new Map<string, string>();

  return {
    dispose() {
      urlByPath.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      urlByPath.clear();
    },
    resolve(path: string) {
      const existing = urlByPath.get(path);

      if (existing) {
        return existing;
      }

      const file = bundle.files.find((entry) => entry.path === path);

      if (!file) {
        return path;
      }

      const bytes = new Uint8Array(file.bytes.byteLength);
      bytes.set(file.bytes);
      const url = URL.createObjectURL(new Blob([bytes.buffer], { type: file.mimeType }));
      urlByPath.set(path, url);
      return url;
    }
  };
}

async function materializeSource(
  source: string,
  context: {
    copyExternalAssets: boolean;
    files: WebHammerEngineBundleFile[];
    pathBySource: Map<string, string>;
    preferredExtension?: string;
    preferredStem: string;
    usedPaths: Set<string>;
  }
) {
  const existing = context.pathBySource.get(source);

  if (existing) {
    return existing;
  }

  if (isDataUrl(source)) {
    const parsed = parseDataUrl(source);
    const path = ensureUniquePath(
      `${context.preferredStem}.${inferExtension(parsed.mimeType, context.preferredExtension)}`,
      context.usedPaths
    );

    context.files.push({
      bytes: parsed.bytes,
      mimeType: parsed.mimeType,
      path
    });
    context.pathBySource.set(source, path);
    return path;
  }

  if (!context.copyExternalAssets) {
    return undefined;
  }

  const response = await fetch(source);

  if (!response.ok) {
    throw new Error(`Failed to bundle asset: ${source}`);
  }

  const blob = await response.blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const path = ensureUniquePath(
    `${context.preferredStem}.${inferExtension(blob.type, context.preferredExtension ?? inferExtensionFromPath(source))}`,
    context.usedPaths
  );

  context.files.push({
    bytes,
    mimeType: blob.type || "application/octet-stream",
    path
  });
  context.pathBySource.set(source, path);

  return path;
}

function parseDataUrl(source: string) {
  const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/i.exec(source);

  if (!match) {
    throw new Error("Invalid data URL.");
  }

  const mimeType = match[1] || "application/octet-stream";
  const payload = match[3] || "";

  if (match[2]) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return { bytes, mimeType };
  }

  return {
    bytes: new TextEncoder().encode(decodeURIComponent(payload)),
    mimeType
  };
}

function textureFieldSuffix(field: TextureField) {
  switch (field) {
    case "baseColorTexture":
      return "color";
    case "metallicRoughnessTexture":
      return "orm";
    default:
      return "normal";
  }
}

function inferModelExtension(path: string, modelFormat: unknown) {
  if (typeof modelFormat === "string" && modelFormat.length > 0) {
    return modelFormat.toLowerCase();
  }

  return inferExtensionFromPath(path) ?? "bin";
}

function inferExtension(mimeType: string | undefined, fallback?: string) {
  const normalized = mimeType?.toLowerCase();

  if (normalized === "image/png") {
    return "png";
  }

  if (normalized === "image/jpeg") {
    return "jpg";
  }

  if (normalized === "image/svg+xml") {
    return "svg";
  }

  if (normalized === "model/gltf+json") {
    return "gltf";
  }

  if (normalized === "model/gltf-binary" || normalized === "application/octet-stream") {
    return fallback ?? "bin";
  }

  return fallback ?? "bin";
}

function inferExtensionFromPath(path: string) {
  const cleanPath = path.split("?")[0]?.split("#")[0] ?? path;
  const parts = cleanPath.split(".");
  return parts.length > 1 ? parts.at(-1)?.toLowerCase() : undefined;
}

function inferMimeTypeFromPath(path: string) {
  switch (inferExtensionFromPath(path)) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "svg":
      return "image/svg+xml";
    case "glb":
      return "model/gltf-binary";
    case "gltf":
      return "model/gltf+json";
    case "obj":
      return "text/plain";
    case "mtl":
      return "text/plain";
    case "json":
      return "application/json";
    default:
      return "application/octet-stream";
  }
}

function ensureUniquePath(path: string, usedPaths: Set<string>) {
  if (!usedPaths.has(path)) {
    usedPaths.add(path);
    return path;
  }

  const lastDot = path.lastIndexOf(".");
  const stem = lastDot >= 0 ? path.slice(0, lastDot) : path;
  const extension = lastDot >= 0 ? path.slice(lastDot) : "";
  let counter = 2;

  while (usedPaths.has(`${stem}-${counter}${extension}`)) {
    counter += 1;
  }

  const resolved = `${stem}-${counter}${extension}`;
  usedPaths.add(resolved);
  return resolved;
}

function isDataUrl(value: string) {
  return value.startsWith("data:");
}

function slugify(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "asset";
}

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, "");
}
