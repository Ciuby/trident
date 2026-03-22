import { createAnimationArtifact, createAnimationBundle, serializeAnimationArtifact, serializeAnimationBundle } from "@ggez/anim-exporter";
import { compileAnimationEditorDocumentOrThrow } from "@ggez/anim-compiler";
import { parseAnimationEditorDocument } from "@ggez/anim-schema";
import { strToU8, zipSync } from "fflate";
import type { ImportedPreviewClip } from "./preview-assets";

type RuntimeBundleExportResult = {
  fileName: string;
  bytes: Uint8Array;
  folderName: string;
};

function slugifySegment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "animation";
}

function getFileExtension(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase();
  return extension ? `.${extension}` : "";
}

function getFileStem(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

function makeUniquePath(basePath: string, usedPaths: Set<string>): string {
  if (!usedPaths.has(basePath)) {
    usedPaths.add(basePath);
    return basePath;
  }

  const extension = getFileExtension(basePath);
  const stem = extension ? basePath.slice(0, -extension.length) : basePath;
  let suffix = 2;

  while (usedPaths.has(`${stem}-${suffix}${extension}`)) {
    suffix += 1;
  }

  const nextPath = `${stem}-${suffix}${extension}`;
  usedPaths.add(nextPath);
  return nextPath;
}

async function buildZipFiles(input: {
  basePath: string;
  characterFile: File | null;
  importedClips: ImportedPreviewClip[];
  sourceDocument: unknown;
}) {
  const editorDocument = parseAnimationEditorDocument(input.sourceDocument);
  const compiledGraph = compileAnimationEditorDocumentOrThrow(editorDocument);
  const clipsById = new Map(input.importedClips.map((clip) => [clip.id, clip]));
  const files = new Map<string, Uint8Array>();
  const assetPathsByFile = new Map<File, string>();
  const usedAssetPaths = new Set<string>();

  const reserveAssetPath = (file: File, preferredBaseName?: string) => {
    const existingPath = assetPathsByFile.get(file);
    if (existingPath) {
      return existingPath;
    }

    const extension = getFileExtension(file.name);
    const baseName = slugifySegment(preferredBaseName ?? getFileStem(file.name));
    const relativePath = makeUniquePath(`assets/${baseName}${extension}`, usedAssetPaths);
    assetPathsByFile.set(file, relativePath);
    return relativePath;
  };

  if (input.characterFile) {
    reserveAssetPath(input.characterFile, getFileStem(input.characterFile.name));
  }

  const bundleClips = compiledGraph.clipSlots.map((slot) => {
    const importedClip = clipsById.get(slot.id);
    if (!importedClip) {
      throw new Error(`Compiled graph references clip "${slot.id}" but no imported animation source is available for export.`);
    }

    return {
      id: slot.id,
      name: slot.name,
      duration: slot.duration,
      source: importedClip.source
    };
  });

  const artifact = createAnimationArtifact({
    graph: compiledGraph,
    clips: bundleClips.map((bundleClip) => clipsById.get(bundleClip.id)!.asset)
  });
  const manifest = createAnimationBundle({
    name: editorDocument.name,
    artifactPath: "./graph.animation.json",
    characterAssetPath: input.characterFile ? `./${reserveAssetPath(input.characterFile, getFileStem(input.characterFile.name))}` : undefined,
    clips: bundleClips
  });

  files.set(`${input.basePath}/animation.bundle.json`, strToU8(serializeAnimationBundle(manifest)));
  files.set(`${input.basePath}/graph.animation.json`, strToU8(serializeAnimationArtifact(artifact)));

  const fileEntries = Array.from(assetPathsByFile.entries());
  for (const [file, relativePath] of fileEntries) {
    files.set(`${input.basePath}/${relativePath}`, new Uint8Array(await file.arrayBuffer()));
  }

  return files;
}

export async function createRuntimeBundleZip(input: {
  characterFile: File | null;
  importedClips: ImportedPreviewClip[];
  sourceDocument: unknown;
}): Promise<RuntimeBundleExportResult> {
  const editorDocument = parseAnimationEditorDocument(input.sourceDocument);
  const folderName = slugifySegment(editorDocument.name);
  const basePath = `animations/${folderName}`;
  const files = await buildZipFiles({
    basePath,
    characterFile: input.characterFile,
    importedClips: input.importedClips,
    sourceDocument: editorDocument
  });

  return {
    fileName: `${folderName}.ggezanim.zip`,
    bytes: zipSync(Object.fromEntries(files), { level: 6 }),
    folderName
  };
}