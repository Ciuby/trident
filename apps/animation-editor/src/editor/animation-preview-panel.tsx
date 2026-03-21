import { compileAnimationEditorDocument } from "@ggez/anim-compiler";
import { createPoseBufferFromRig, sampleClipPose } from "@ggez/anim-core";
import { createAnimatorInstance } from "@ggez/anim-runtime";
import { applyPoseBufferToSkeleton, applyPoseToSkeleton } from "@ggez/anim-three";
import type { AnimationEditorStore } from "@ggez/anim-editor-core";
import type { AnimationEditorDocument } from "@ggez/anim-schema";
import type { AnimatorInstance } from "@ggez/anim-runtime";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AmbientLight,
  Box3,
  Clock,
  Color,
  DirectionalLight,
  GridHelper,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import type { Object3D, Skeleton } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { useEditorStoreValue } from "./use-editor-store-value";
import type { ImportedCharacterAsset, ImportedPreviewClip } from "./preview-assets";
import { findPrimarySkeleton } from "./preview-assets";

type PreviewMode = "graph" | "clip";

const panelStyle: CSSProperties = {
  border: "1px solid rgba(167, 243, 208, 0.12)",
  borderRadius: 16,
  padding: 12,
  background: "linear-gradient(180deg, rgba(8, 16, 13, 0.92) 0%, rgba(6, 11, 9, 0.98) 100%)",
  color: "#ecfdf5",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.03)",
};

const fieldStyle: CSSProperties = {
  width: "100%",
  border: "1px solid rgba(167, 243, 208, 0.16)",
  borderRadius: 10,
  padding: "8px 10px",
  fontSize: 13,
  color: "#ecfdf5",
  background: "rgba(255, 255, 255, 0.06)",
};

function fitCameraToObject(camera: PerspectiveCamera, controls: OrbitControls, object: Object3D): void {
  const bounds = new Box3().setFromObject(object);
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  const maxSize = Math.max(size.x, size.y, size.z, 1);
  const distance = maxSize * 1.8;

  camera.position.set(center.x + distance, center.y + distance * 0.6, center.z + distance);
  camera.near = 0.01;
  camera.far = Math.max(1000, distance * 10);
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
}

function setAnimatorParameter(animator: AnimatorInstance, name: string, value: number | boolean, type: AnimationEditorDocument["parameters"][number]["type"]): void {
  if (type === "float") {
    animator.setFloat(name, Number(value));
    return;
  }

  if (type === "int") {
    animator.setInt(name, Number(value));
    return;
  }

  if (type === "bool") {
    animator.setBool(name, Boolean(value));
    return;
  }

  if (Boolean(value)) {
    animator.trigger(name);
  }
}

export function AnimationPreviewPanel(props: {
  store: AnimationEditorStore;
  character: ImportedCharacterAsset | null;
  importedClips: ImportedPreviewClip[];
}) {
  const { store, character, importedClips } = props;
  const document = useEditorStoreValue(store, () => store.getState().document, ["document"]);
  const [mode, setMode] = useState<PreviewMode>("graph");
  const [selectedClipId, setSelectedClipId] = useState("");
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [parameterValues, setParameterValues] = useState<Record<string, number | boolean>>({});
  const mountRef = useRef<HTMLDivElement | null>(null);
  const modeRef = useRef(mode);
  const isPlayingRef = useRef(isPlaying);
  const playbackSpeedRef = useRef(playbackSpeed);
  const selectedClipIdRef = useRef(selectedClipId);
  const parameterValuesRef = useRef(parameterValues);
  const animatorRef = useRef<AnimatorInstance | null>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  useEffect(() => {
    selectedClipIdRef.current = selectedClipId;
  }, [selectedClipId]);

  useEffect(() => {
    parameterValuesRef.current = parameterValues;
  }, [parameterValues]);

  useEffect(() => {
    if (!selectedClipId && importedClips.length > 0) {
      setSelectedClipId(importedClips[0]!.id);
    }
  }, [importedClips, selectedClipId]);

  useEffect(() => {
    setParameterValues((current) => {
      const next = { ...current };
      const validNames = new Set(document.parameters.map((parameter) => parameter.name));

      for (const parameter of document.parameters) {
        if (!(parameter.name in next)) {
          next[parameter.name] =
            parameter.type === "bool" || parameter.type === "trigger"
              ? Boolean(parameter.defaultValue ?? false)
              : Number(parameter.defaultValue ?? 0);
        }
      }

      for (const name of Object.keys(next)) {
        if (!validNames.has(name)) {
          delete next[name];
        }
      }

      return next;
    });
  }, [document.parameters]);

  const compileResult = useMemo(() => compileAnimationEditorDocument(document), [document]);
  const clipMap = useMemo(() => new Map(importedClips.map((clip) => [clip.id, clip])), [importedClips]);

  const graphPreview = useMemo(() => {
    if (!character) {
      return {
        animator: null,
        error: "Import a rigged character first to preview the graph.",
      };
    }

    if (!compileResult.ok || !compileResult.graph) {
      const firstError = compileResult.diagnostics.find((diagnostic) => diagnostic.severity === "error");
      return {
        animator: null,
        error: firstError?.message ?? "Fix compile errors before graph preview can run.",
      };
    }

    try {
      const clips = compileResult.graph.clipSlots.map((slot) => {
        const clip = clipMap.get(slot.id);
        if (!clip) {
          throw new Error(`Compiled graph references clip "${slot.id}" but no imported animation provides it.`);
        }
        return clip.asset;
      });

      return {
        animator: createAnimatorInstance({
          rig: character.rig,
          graph: compileResult.graph,
          clips,
        }),
        error: null,
      };
    } catch (error) {
      return {
        animator: null,
        error: error instanceof Error ? error.message : "Failed to create graph preview animator.",
      };
    }
  }, [character, clipMap, compileResult]);

  useEffect(() => {
    animatorRef.current = graphPreview.animator;
  }, [graphPreview.animator]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const host = mount;

    const scene = new Scene();
    scene.background = new Color("#060b09");
    const camera = new PerspectiveCamera(45, 1, 0.01, 1000);
    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = SRGBColorSpace;
    host.innerHTML = "";
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const ambient = new AmbientLight("#ffffff", 1.2);
    const keyLight = new DirectionalLight("#ffffff", 1.5);
    keyLight.position.set(6, 12, 8);
    const fillLight = new DirectionalLight("#7dd3fc", 0.7);
    fillLight.position.set(-4, 6, -6);
    const grid = new GridHelper(20, 20, "#14532d", "#052e16");
    scene.add(ambient, keyLight, fillLight, grid);

    let previewObject: Object3D | null = null;
    let previewSkeleton: Skeleton | null = null;
    let directClipTime = 0;
    let disposed = false;
    const directPose = character ? createPoseBufferFromRig(character.rig) : null;

    if (character) {
      previewObject = clone(character.scene);
      previewSkeleton = findPrimarySkeleton(previewObject);

      if (previewObject) {
        scene.add(previewObject);
        fitCameraToObject(camera, controls, previewObject);
      }
    } else {
      camera.position.set(3, 2, 3);
      controls.update();
    }

    function resize() {
      const width = host.clientWidth;
      const height = host.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const clock = new Clock();
    let animationFrame = 0;

    function renderFrame() {
      if (disposed) {
        return;
      }

      const delta = clock.getDelta();

      if (previewSkeleton && character) {
        if (modeRef.current === "clip") {
          const clip = clipMap.get(selectedClipIdRef.current);
          if (clip) {
            if (isPlayingRef.current) {
              directClipTime += delta * playbackSpeedRef.current;
            }

            if (directPose) {
              sampleClipPose(clip.asset, character.rig, directClipTime, directPose, true);
              applyPoseBufferToSkeleton(directPose, previewSkeleton);
            }
          }
        } else if (animatorRef.current) {
          for (const parameter of document.parameters) {
            const value = parameterValuesRef.current[parameter.name];
            if (value !== undefined) {
              setAnimatorParameter(animatorRef.current, parameter.name, value, parameter.type);
            }
          }

          animatorRef.current.update(isPlayingRef.current ? delta * playbackSpeedRef.current : 0);
          applyPoseToSkeleton(animatorRef.current, previewSkeleton);
        }
      }

      controls.update();
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(renderFrame);
    }

    animationFrame = window.requestAnimationFrame(renderFrame);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      host.innerHTML = "";
    };
  }, [character, clipMap, document.parameters]);

  const previewStatus =
    !character
      ? "Import a rigged GLB/FBX character to preview animation."
      : mode === "graph"
        ? graphPreview.error ?? "Compiled runtime preview is active."
        : importedClips.length === 0
          ? "Import animation clips to use raw clip preview."
          : "Raw clip preview is active.";

  return (
    <section style={panelStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: "0.02em" }}>Preview</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setMode("graph")}
            style={{
              ...fieldStyle,
              width: "auto",
              cursor: "pointer",
              background: mode === "graph" ? "rgba(52, 211, 153, 0.22)" : "rgba(255, 255, 255, 0.06)",
            }}
          >
            Graph
          </button>
          <button
            onClick={() => setMode("clip")}
            style={{
              ...fieldStyle,
              width: "auto",
              cursor: "pointer",
              background: mode === "clip" ? "rgba(52, 211, 153, 0.22)" : "rgba(255, 255, 255, 0.06)",
            }}
          >
            Clip
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        <button onClick={() => setIsPlaying((current) => !current)} style={{ ...fieldStyle, cursor: "pointer" }}>
          {isPlaying ? "Pause" : "Play"}
        </button>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: "rgba(236, 253, 245, 0.62)" }}>Speed</span>
          <input
            type="number"
            min={0.1}
            max={4}
            step={0.1}
            value={playbackSpeed}
            onChange={(event) => setPlaybackSpeed(Number(event.target.value))}
            style={fieldStyle}
          />
        </label>
        {mode === "clip" ? (
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "rgba(236, 253, 245, 0.62)" }}>Clip</span>
            <select
              value={selectedClipId}
              onChange={(event) => setSelectedClipId(event.target.value)}
              style={fieldStyle}
            >
              {importedClips.map((clip) => (
                <option key={clip.id} value={clip.id}>
                  {clip.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div style={{ ...fieldStyle, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(236, 253, 245, 0.72)" }}>
            Runtime graph playback
          </div>
        )}
      </div>

      {mode === "graph" && document.parameters.length > 0 ? (
        <div style={{ display: "grid", gap: 8 }}>
          {document.parameters.map((parameter) => (
            <label key={parameter.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, color: "rgba(236, 253, 245, 0.62)" }}>{parameter.name}</span>
              {parameter.type === "bool" || parameter.type === "trigger" ? (
                <input
                  type="checkbox"
                  checked={Boolean(parameterValues[parameter.name])}
                  onChange={(event) =>
                    setParameterValues((current) => ({
                      ...current,
                      [parameter.name]: event.target.checked,
                    }))
                  }
                />
              ) : (
                <input
                  type="number"
                  value={Number(parameterValues[parameter.name] ?? 0)}
                  onChange={(event) =>
                    setParameterValues((current) => ({
                      ...current,
                      [parameter.name]: Number(event.target.value),
                    }))
                  }
                  style={fieldStyle}
                />
              )}
            </label>
          ))}
        </div>
      ) : null}

      <div
        ref={mountRef}
        style={{
          minHeight: 320,
          borderRadius: 16,
          overflow: "hidden",
          border: "1px solid rgba(167, 243, 208, 0.12)",
          background: "linear-gradient(180deg, rgba(3, 7, 6, 1) 0%, rgba(5, 10, 9, 1) 100%)",
        }}
      />

      <div style={{ fontSize: 12, color: "rgba(236, 253, 245, 0.72)" }}>{previewStatus}</div>
    </section>
  );
}
