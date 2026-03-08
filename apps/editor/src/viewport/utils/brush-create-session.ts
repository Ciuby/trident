import { createAxisAlignedBrushFromBounds } from "@web-hammer/geometry-kernel";
import { makeTransform, snapValue, vec3, type PrimitiveShape, type Vec3 } from "@web-hammer/shared";
import { createPrimitiveNodeData, createPrimitiveNodeLabel } from "@/lib/authoring";
import type { BrushCreateBasis, BrushCreatePlacement, BrushCreateState } from "@/viewport/types";
import {
  computeBrushCreateCenter,
  createBrushCreateDragPlane,
  measureBrushCreateBase,
  projectPointerToPlane,
  projectPointerToThreePlane
} from "@/viewport/utils/brush-create";
import { Camera, Euler, Matrix4, Quaternion, Raycaster, Vector3 } from "three";

type BrushCreatePointerContext = {
  bounds: DOMRect;
  camera: Camera;
  clientX: number;
  clientY: number;
  raycaster: Raycaster;
  snapSize: number;
};

export function startBrushCreateState(shape: PrimitiveShape, anchor: Vec3, basis: BrushCreateBasis): BrushCreateState {
  if (shape === "cube") {
    return {
      anchor,
      basis,
      currentPoint: anchor,
      shape,
      stage: "base"
    };
  }

  if (shape === "sphere") {
    return {
      anchor,
      basis,
      currentPoint: anchor,
      radius: 0,
      shape,
      stage: "radius"
    };
  }

  return {
    anchor,
    basis,
    currentPoint: anchor,
    radius: 0,
    shape,
    stage: "base"
  };
}

export function updateBrushCreateState(
  state: BrushCreateState,
  { bounds, camera, clientX, clientY, raycaster, snapSize }: BrushCreatePointerContext
): BrushCreateState | undefined {
  if (state.shape === "cube" && state.stage === "base") {
    const point = projectPointerToPlane(clientX, clientY, bounds, camera, raycaster, state.anchor, state.basis.normal);

    if (!point) {
      return undefined;
    }

    return {
      ...state,
      currentPoint: point
    };
  }

  if (state.shape === "sphere") {
    const point = projectPointerToPlane(clientX, clientY, bounds, camera, raycaster, state.anchor, state.basis.normal);

    if (!point) {
      return undefined;
    }

    return {
      ...state,
      currentPoint: point,
      radius: measureRadialRadius(state.anchor, state.basis, point, snapSize)
    };
  }

  if (state.stage === "base") {
    const point = projectPointerToPlane(clientX, clientY, bounds, camera, raycaster, state.anchor, state.basis.normal);

    if (!point) {
      return undefined;
    }

    return {
      ...state,
      currentPoint: point,
      radius: measureRadialRadius(state.anchor, state.basis, point, snapSize)
    };
  }

  const point = projectPointerToThreePlane(clientX, clientY, bounds, camera, raycaster, state.dragPlane);

  if (!point) {
    return undefined;
  }

  return {
    ...state,
    height: resolveExtrusionHeight(state.startPoint, state.basis.normal, point, snapSize)
  };
}

export function advanceBrushCreateState(
  state: BrushCreateState,
  { bounds, camera, clientX, clientY, raycaster, snapSize }: BrushCreatePointerContext
): { nextState?: BrushCreateState; placement?: BrushCreatePlacement } {
  if (state.shape === "cube" && state.stage === "base") {
    const point = projectPointerToPlane(clientX, clientY, bounds, camera, raycaster, state.anchor, state.basis.normal) ?? state.currentPoint;
    const { depth, width } = measureBrushCreateBase(state.anchor, state.basis, point, snapSize);

    if (Math.abs(width) <= snapSize * 0.5 || Math.abs(depth) <= snapSize * 0.5) {
      return {};
    }

    const center = computeBrushCreateCenter(state.anchor, state.basis, width, depth, 0);
    const dragPlane = createBrushCreateDragPlane(camera, state.basis.normal, center);
    const startPoint =
      projectPointerToThreePlane(clientX, clientY, bounds, camera, raycaster, dragPlane) ??
      new Vector3(center.x, center.y, center.z);

    return {
      nextState: {
        ...state,
        depth,
        dragPlane,
        height: 0,
        stage: "height",
        startPoint: vec3(startPoint.x, startPoint.y, startPoint.z),
        width
      }
    };
  }

  if (state.shape === "sphere") {
    const point = projectPointerToPlane(clientX, clientY, bounds, camera, raycaster, state.anchor, state.basis.normal) ?? state.currentPoint;
    const radius = measureRadialRadius(state.anchor, state.basis, point, snapSize);
    const placement = buildBrushCreatePlacement({
      ...state,
      currentPoint: point,
      radius
    });

    return placement ? { placement } : {};
  }

  if (state.stage === "base") {
    const point = projectPointerToPlane(clientX, clientY, bounds, camera, raycaster, state.anchor, state.basis.normal) ?? state.currentPoint;
    const radius = measureRadialRadius(state.anchor, state.basis, point, snapSize);

    if (radius <= snapSize * 0.5) {
      return {};
    }

    const dragPlane = createBrushCreateDragPlane(camera, state.basis.normal, state.anchor);
    const startPoint =
      projectPointerToThreePlane(clientX, clientY, bounds, camera, raycaster, dragPlane) ??
      new Vector3(state.anchor.x, state.anchor.y, state.anchor.z);

    return {
      nextState: {
        anchor: state.anchor,
        basis: state.basis,
        dragPlane,
        height: 0,
        radius,
        shape: state.shape,
        stage: "height",
        startPoint: vec3(startPoint.x, startPoint.y, startPoint.z)
      }
    };
  }

  const point =
    projectPointerToThreePlane(clientX, clientY, bounds, camera, raycaster, state.dragPlane) ??
    new Vector3(state.startPoint.x, state.startPoint.y, state.startPoint.z);
  const placement = buildBrushCreatePlacement({
    ...state,
    height: resolveExtrusionHeight(state.startPoint, state.basis.normal, point, snapSize)
  });

  return placement ? { placement } : {};
}

export function buildBrushCreatePlacement(state: BrushCreateState): BrushCreatePlacement | undefined {
  if (state.shape === "cube") {
    if (state.stage !== "height" || Math.abs(state.width) <= 0.0001 || Math.abs(state.depth) <= 0.0001 || Math.abs(state.height) <= 0.0001) {
      return undefined;
    }

    const center = computeBrushCreateCenter(state.anchor, state.basis, state.width, state.depth, state.height);
    const rotation = basisToEuler(state.basis);

    return {
      brush: createAxisAlignedBrushFromBounds({
        x: { min: -Math.abs(state.width) * 0.5, max: Math.abs(state.width) * 0.5 },
        y: { min: -Math.abs(state.height) * 0.5, max: Math.abs(state.height) * 0.5 },
        z: { min: -Math.abs(state.depth) * 0.5, max: Math.abs(state.depth) * 0.5 }
      }),
      kind: "brush",
      transform: {
        ...makeTransform(center),
        rotation
      }
    };
  }

  if (state.shape === "sphere") {
    if (Math.abs(state.radius) <= 0.0001) {
      return undefined;
    }

    const radius = Math.abs(state.radius);
    const center = vec3(
      state.anchor.x + state.basis.normal.x * radius,
      state.anchor.y + state.basis.normal.y * radius,
      state.anchor.z + state.basis.normal.z * radius
    );

    return {
      kind: "primitive",
      name: createPrimitiveNodeLabel("brush", "sphere"),
      primitive: createPrimitiveNodeData("brush", "sphere", vec3(radius * 2, radius * 2, radius * 2)),
      transform: {
        ...makeTransform(center),
        rotation: basisToEuler(state.basis)
      }
    };
  }

  if (state.stage !== "height" || Math.abs(state.radius) <= 0.0001 || Math.abs(state.height) <= 0.0001) {
    return undefined;
  }

  const radius = Math.abs(state.radius);
  const center = vec3(
    state.anchor.x + state.basis.normal.x * (state.height * 0.5),
    state.anchor.y + state.basis.normal.y * (state.height * 0.5),
    state.anchor.z + state.basis.normal.z * (state.height * 0.5)
  );

  return {
    kind: "primitive",
    name: createPrimitiveNodeLabel("brush", state.shape),
    primitive: createPrimitiveNodeData("brush", state.shape, vec3(radius * 2, Math.abs(state.height), radius * 2)),
    transform: {
      ...makeTransform(center),
      rotation: basisToEuler(state.basis)
    }
  };
}

export function buildBrushCreatePreviewPositions(state: BrushCreateState, snapSize: number): number[] {
  const positions: number[] = [];

  if (state.shape === "cube") {
    const base =
      state.stage === "base"
        ? measureBrushCreateBase(state.anchor, state.basis, state.currentPoint, snapSize)
        : { depth: state.depth, width: state.width };
    const baseCorners = buildBoxCorners(state.anchor, state.basis, base.width, base.depth, 0);

    pushLoopSegments(positions, baseCorners);

    if (state.stage === "height" && Math.abs(state.height) > 0.0001) {
      const topCorners = buildBoxCorners(state.anchor, state.basis, state.width, state.depth, state.height);
      pushLoopSegments(positions, topCorners);

      for (let index = 0; index < baseCorners.length; index += 1) {
        pushSegment(positions, baseCorners[index], topCorners[index]);
      }
    }

    return positions;
  }

  if (state.shape === "sphere") {
    if (state.radius <= 0.0001) {
      return positions;
    }

    const radius = Math.abs(state.radius);
    const center = vec3(
      state.anchor.x + state.basis.normal.x * radius,
      state.anchor.y + state.basis.normal.y * radius,
      state.anchor.z + state.basis.normal.z * radius
    );

    pushCircleSegments(positions, center, state.basis.u, state.basis.v, radius);
    pushCircleSegments(positions, center, state.basis.u, state.basis.normal, radius);
    pushCircleSegments(positions, center, state.basis.v, state.basis.normal, radius);
    pushSegment(positions, state.anchor, center);

    return positions;
  }

  if (state.stage === "base") {
    if (state.radius <= 0.0001) {
      return positions;
    }

    pushCircleSegments(positions, state.anchor, state.basis.u, state.basis.v, state.radius);
    return positions;
  }

  const topCenter = vec3(
    state.anchor.x + state.basis.normal.x * state.height,
    state.anchor.y + state.basis.normal.y * state.height,
    state.anchor.z + state.basis.normal.z * state.height
  );

  pushCircleSegments(positions, state.anchor, state.basis.u, state.basis.v, state.radius);

  if (state.shape === "cylinder") {
    pushCircleSegments(positions, topCenter, state.basis.u, state.basis.v, state.radius);

    const sideAngles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];

    sideAngles.forEach((angle) => {
      const bottom = resolveCirclePoint(state.anchor, state.basis.u, state.basis.v, state.radius, angle);
      const top = resolveCirclePoint(topCenter, state.basis.u, state.basis.v, state.radius, angle);
      pushSegment(positions, bottom, top);
    });

    return positions;
  }

  pushSegment(positions, state.anchor, topCenter);

  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2;
    const basePoint = resolveCirclePoint(state.anchor, state.basis.u, state.basis.v, state.radius, angle);
    pushSegment(positions, basePoint, topCenter);
  }

  return positions;
}

function measureRadialRadius(anchor: Vec3, basis: BrushCreateBasis, point: Vec3, snapSize: number) {
  const { depth, width } = measureBrushCreateBase(anchor, basis, point, snapSize);
  return snapValue(Math.hypot(width, depth), snapSize);
}

function resolveExtrusionHeight(startPoint: Vec3, normal: Vec3, point: Vector3, snapSize: number) {
  return snapValue(
    point
      .clone()
      .sub(new Vector3(startPoint.x, startPoint.y, startPoint.z))
      .dot(new Vector3(normal.x, normal.y, normal.z)),
    snapSize
  );
}

function basisToEuler(basis: BrushCreateBasis): Vec3 {
  const matrix = new Matrix4().makeBasis(
    new Vector3(basis.u.x, basis.u.y, basis.u.z),
    new Vector3(basis.normal.x, basis.normal.y, basis.normal.z),
    new Vector3(basis.v.x, basis.v.y, basis.v.z)
  );
  const quaternion = new Quaternion().setFromRotationMatrix(matrix);
  const euler = new Euler().setFromQuaternion(quaternion, "XYZ");

  return vec3(euler.x, euler.y, euler.z);
}

function buildBoxCorners(anchor: Vec3, basis: BrushCreateBasis, width: number, depth: number, height: number): Vec3[] {
  const widthOffset = vec3(basis.u.x * width, basis.u.y * width, basis.u.z * width);
  const depthOffset = vec3(basis.v.x * depth, basis.v.y * depth, basis.v.z * depth);
  const heightOffset = vec3(basis.normal.x * height, basis.normal.y * height, basis.normal.z * height);

  return [
    vec3(anchor.x + heightOffset.x, anchor.y + heightOffset.y, anchor.z + heightOffset.z),
    vec3(
      anchor.x + widthOffset.x + heightOffset.x,
      anchor.y + widthOffset.y + heightOffset.y,
      anchor.z + widthOffset.z + heightOffset.z
    ),
    vec3(
      anchor.x + widthOffset.x + depthOffset.x + heightOffset.x,
      anchor.y + widthOffset.y + depthOffset.y + heightOffset.y,
      anchor.z + widthOffset.z + depthOffset.z + heightOffset.z
    ),
    vec3(
      anchor.x + depthOffset.x + heightOffset.x,
      anchor.y + depthOffset.y + heightOffset.y,
      anchor.z + depthOffset.z + heightOffset.z
    )
  ];
}

function pushLoopSegments(positions: number[], points: Vec3[]) {
  for (let index = 0; index < points.length; index += 1) {
    pushSegment(positions, points[index], points[(index + 1) % points.length]);
  }
}

function pushCircleSegments(
  positions: number[],
  center: Vec3,
  axisA: Vec3,
  axisB: Vec3,
  radius: number,
  segments = 24
) {
  for (let index = 0; index < segments; index += 1) {
    const currentAngle = (index / segments) * Math.PI * 2;
    const nextAngle = ((index + 1) / segments) * Math.PI * 2;
    pushSegment(
      positions,
      resolveCirclePoint(center, axisA, axisB, radius, currentAngle),
      resolveCirclePoint(center, axisA, axisB, radius, nextAngle)
    );
  }
}

function resolveCirclePoint(center: Vec3, axisA: Vec3, axisB: Vec3, radius: number, angle: number) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return vec3(
    center.x + axisA.x * cos * radius + axisB.x * sin * radius,
    center.y + axisA.y * cos * radius + axisB.y * sin * radius,
    center.z + axisA.z * cos * radius + axisB.z * sin * radius
  );
}

function pushSegment(positions: number[], start: Vec3, end: Vec3) {
  positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
}
