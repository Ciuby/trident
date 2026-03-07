import { TransformControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useRef } from "react";
import type { Transform } from "@web-hammer/shared";
import { objectToTransform } from "@/viewport/utils/geometry";
import type { ViewportCanvasProps } from "@/viewport/types";

export function ObjectTransformGizmo({
  activeToolId,
  onPreviewNodeTransform,
  onUpdateNodeTransform,
  selectedNodeIds,
  transformMode,
  viewport
}: Pick<
  ViewportCanvasProps,
  "activeToolId" | "onPreviewNodeTransform" | "onUpdateNodeTransform" | "selectedNodeIds" | "transformMode" | "viewport"
>) {
  const baselineTransformRef = useRef<Transform | undefined>(undefined);
  const scene = useThree((state) => state.scene);
  const selectedNodeId = selectedNodeIds[0];
  const selectedObject = selectedNodeId ? scene.getObjectByName(`node:${selectedNodeId}`) : undefined;

  if (activeToolId !== "transform" || !selectedNodeId || !selectedObject) {
    return null;
  }

  return (
    <TransformControls
      enabled
      mode={transformMode}
      object={selectedObject}
      onMouseDown={() => {
        baselineTransformRef.current = objectToTransform(selectedObject);
      }}
      onMouseUp={() => {
        if (!baselineTransformRef.current) {
          return;
        }

        onUpdateNodeTransform(selectedNodeId, objectToTransform(selectedObject), baselineTransformRef.current);
        baselineTransformRef.current = undefined;
      }}
      onObjectChange={() => {
        onPreviewNodeTransform(selectedNodeId, objectToTransform(selectedObject));
      }}
      rotationSnap={Math.PI / 12}
      scaleSnap={Math.max(viewport.grid.snapSize / 16, 0.125)}
      showX
      showY
      showZ
      translationSnap={viewport.grid.snapSize}
    />
  );
}
