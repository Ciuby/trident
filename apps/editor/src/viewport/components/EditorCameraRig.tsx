import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { toTuple } from "@web-hammer/shared";
import { useEffect, useRef } from "react";
import type { PerspectiveCamera } from "three";
import type { ViewportCanvasProps } from "@/viewport/types";

export function EditorCameraRig({
  controlsEnabled,
  viewport
}: Pick<ViewportCanvasProps, "viewport"> & { controlsEnabled: boolean }) {
  const camera = useThree((state) => state.camera as PerspectiveCamera);
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    const [x, y, z] = toTuple(viewport.camera.position);
    const [targetX, targetY, targetZ] = toTuple(viewport.camera.target);

    camera.position.set(x, y, z);
    camera.near = viewport.camera.near;
    camera.far = viewport.camera.far;
    camera.fov = viewport.camera.fov;
    camera.updateProjectionMatrix();

    controlsRef.current?.target.set(targetX, targetY, targetZ);
    controlsRef.current?.update();
  }, [camera, viewport]);

  return (
    <OrbitControls
      ref={controlsRef}
      dampingFactor={0.12}
      enableDamping
      enabled={controlsEnabled}
      makeDefault
      maxDistance={viewport.camera.maxDistance}
      maxPolarAngle={Math.PI - 0.01}
      minDistance={viewport.camera.minDistance}
      minPolarAngle={0.01}
      target={toTuple(viewport.camera.target)}
    />
  );
}
