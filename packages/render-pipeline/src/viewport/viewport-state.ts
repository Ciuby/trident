import { vec3 } from "@web-hammer/shared";

export const gridSnapValues = [1, 2, 4, 8, 16, 32] as const;

export type GridSnapValue = (typeof gridSnapValues)[number];

export type ViewportProjection = "perspective";

export type EditorCameraState = {
  position: ReturnType<typeof vec3>;
  target: ReturnType<typeof vec3>;
  fov: number;
  near: number;
  far: number;
  minDistance: number;
  maxDistance: number;
};

export type ConstructionGridState = {
  visible: boolean;
  size: number;
  minorDivisions: number;
  majorLineEvery: number;
  elevation: number;
  snapSize: GridSnapValue;
};

export type ViewportState = {
  projection: ViewportProjection;
  camera: EditorCameraState;
  grid: ConstructionGridState;
};

export function createViewportState(snapSize: GridSnapValue = 8): ViewportState {
  return {
    projection: "perspective",
    camera: {
      position: vec3(18, 14, 18),
      target: vec3(0, 1.5, 0),
      fov: 50,
      near: 0.1,
      far: 500,
      minDistance: 3,
      maxDistance: 180
    },
    grid: {
      visible: true,
      size: 256,
      minorDivisions: 64,
      majorLineEvery: 8,
      elevation: 0,
      snapSize
    }
  };
}
